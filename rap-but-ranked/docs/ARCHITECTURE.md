# Architecture

React 19 + TypeScript + Vite. There's no router library, no state library and no CSS framework. The app is small enough that each of these is a few dozen lines we fully control, and the motion/audio requirements are specific.

```
src/
  app/            App shell, routes, hash router, config flags
  views/          One file per screen (MenuView = intro + main menu)
  components/
    brand/        Logo (wordmark; per-letter spans for animation)
    layout/       Background, PageShell (shared page frame), SoundToggle
    menu/         MenuBackdrop (reactive motif behind the menu)
    ui/           Button, Panel, Field, Segmented, Toggle, Slider, StageLock
  styles/         tokens.css (design tokens), base.css, transitions.css
  motion/         reduced-motion resolution, View Transition wrapper
  audio/          AudioEngine (buses), sound registry, synth recipes, BeatPlayer
    analysis/     decode, waveform peaks, tempo + downbeat detection (worker)
  settings/       persisted settings store + hook
  domain/         types for beats, takes, challenges, scores, ranks; rank thresholds; beat grid maths
  storage/        IndexedDB wrapper; beat library + sessions/takes APIs (no UI)
  play/           session rules (pure), take audio cache, full-track build/export
  scoring/        lyric scores, performance (audio) analysis, round + final results
  lyrics/         tokenising, syllables, rhyme engine, theme lexicon
  director/       Director contract, song arc, basic (rule) director, Rap AI (WebLLM) director
  lib/            small helpers (formatting, tap tempo)
  services/ai/    provider-agnostic AIService contract (no implementation yet)
```

## Design system
- **Tokens** (`styles/tokens.css`) hold every colour, type size, spacing step, radius, easing and duration. Near-black surfaces with a purple undertone; bright purple only for accents and selection.
- **Type:** Unbounded (display: logo, menu, titles, ranks) and Manrope (everything else).
- **Motion:** expo-out easing and short durations. Entrance animations use the shared `.enter` class with a `--i` stagger index.

## Navigation and transitions
- `app/router.ts` is a hash router (`#/play`) that works on static hosting. Every route change goes through `motion/viewTransition.ts`.
- **View Transitions:** the current screen is the `screen` layer, which sinks and blurs out while the next rises in. The logo (`brand`) and each menu label (`title-play`, …) are shared elements, so **PLAY** in the menu morphs into the **PLAY** page title. The background is the document root and never animates, which is what makes the app feel like one continuous surface.
- Browsers without View Transitions, or with reduced motion on, swap instantly and keep the CSS entrance animations.

## Intro
On first load, `MenuView` shows a ~2s CSS brand sting in an overlay above the menu (`loading → intro → menu`). JS only waits briefly for the display font, mounts the sting and flips to the menu at 2.0s; the choreography itself is CSS keyframes in `MenuView.css`:

| Time | Beat |
| --- | --- |
| 0.15s | RAP: diagonal clip-path wipe, settling from scale + blur |
| 0.55s | a thin purple slice cuts across RAP and leaves a brief glow |
| 0.8s | RAP slides left; BUT opens in the gap |
| 1.0s | RANKED expands from blur into focus; violet bloom behind |
| 1.5s | hold |
| 2.0s | sting lifts away; menu logo, rows, backdrop and rank chip build in (usable immediately) |

A click or key skips it. Reduced motion skips it entirely. There's no click-to-enter: if the browser blocks autoplay, the sting is silent (its impact sounds only play when autoplay is already allowed) and audio starts on the first click or key press.

## Audio
`audio/AudioEngine.ts` is one lazily created `AudioContext`:

```
ui bus ──────────────────────────┐
music ─ lowpass ─ mood ─ duck ─ bus ┼─ master ─ out
beat bus (previews, later the Play transport) ┘
(Stage 3+: vocal bus, monitor)
```

- Components request sounds **by meaning** (`audio.play('confirm')`). `audio/sounds.ts` maps each meaning to a synth recipe or an audio file.
- Volumes come from settings (perceptual curve). Mute, master, UI and music levels are all live.
- Every call is a silent no-op until `unlock()`, so no component has to care about autoplay rules.
- Music is "wanted" from boot and preloaded once the page is idle. `unlock()` is tried on load (it works where autoplay is allowed) and again on every click/key press; the theme fades in as soon as the context is actually running. Sub-pages muffle it with a lowpass rather than cutting or restarting it.
- `audio/musicEnergy.ts` runs one animation loop that reads the music's bass level (an AnalyserNode before the volume controls) and writes a smoothed `--energy` CSS variable to subscribed elements: the menu backdrop, the background glow and the sound icon. It's a fast-attack, slow-release loudness follower, not beat detection, and falls back to gentle procedural motion when no music is playing.

## Settings
`settings/settings.ts` is a tiny persisted store (localStorage, sanitised on load, safe if storage is blocked), read through `useSettings()` in React or `subscribe()` in modules. Later stages add fields there.

## Beat library (Stage 2)
`storage/beatLibrary.ts` is the only thing that touches stored beats:

```ts
getSavedBeats(): Promise<SavedBeat[]>     // newest first, audio blob + grid included
listBeats(): Promise<BeatMeta[]>          // metadata only (lists)
getBeat(id) / getBeatAudio(id)
saveBeat(newBeat) / updateBeat(id, patch) / deleteBeat(id)
subscribeBeats(fn)                        // fires on changes, across tabs too
```

`SavedBeat` = `BeatMeta` (id, name, fileName, mimeType, sizeBytes, durationSec, bpm, bpmSource, bpmConfidence, introOffset, introOffsetSource, beatsPerBar, peaks, createdAt, updatedAt) plus `blob`, `secondsPerBeat`, `secondsPerBar`, `barCount`.

- **IndexedDB:** two stores, `beats` (metadata + ~1600 waveform peaks) and `beatAudio` (the original file blob), so listing never loads audio. `navigator.storage.persist()` is requested on the first save.
- **Grid:** `domain/beatGrid.ts`: `gridFor`, `barStart`, `barTimes`, `beatTimes`. A constant tempo from `introOffset`, 4/4 by default. Play mode asks for "bars 5–6" with `barStart(grid, offset, 4)` … `barStart(grid, offset, 6)`.
- **Analysis:** `audio/analysis/analyseBeat.ts` decodes with an `OfflineAudioContext` (no gesture needed), computes peaks, then runs `tempo.ts` in a worker:
  - an onset envelope from a kick band and a hi band
  - candidate BPMs scored by autocorrelation at 1–16 beats, with a mild prior around 90
  - refinement at repeats up to 32 beats
  - bar 1 taken from the kick phase
  
  It's honest about half/double-time and returns alternatives.
- **Playback:** `audio/BeatPlayer.ts` is a singleton, so starting any beat stops the previous one. `play(beat, { from, to })` gives the exact-range playback Stage 3 needs for "preview these two bars". It decodes lazily, caches up to 4 decoded beats, and ducks the menu music while playing.

## Play loop
```
PlayView ─ setup (PlaySetup) ─ round (RoundStudio) ─ judging (Judging) ─ … ─ TrackComplete
              │                     │                     │
        sessionStore           TakeRecorder          scoreRound (sync)
        (IndexedDB)            + trackPlayer          + director.afterRound (async)
```
- **Session state** is `domain/types.ts → Session/Round/TakeMeta/RoundResult`. Rules live in `play/sessionLogic.ts`: the bars a round covers, the lengths allowed, and advance/complete. `useSession` saves every change (lyrics debounced).
- **Recording** (`audio/recordTake.ts`) schedules a one-bar count-in (clicks + beat), the two bars and a short tail on the AudioContext clock. An AudioWorklet (`recorder.worklet.js`) captures the mic with frame timestamps. Round-trip latency (output + input + the user's fine-tune) is subtracted, so `TakeMeta.beatTimeSec` is the exact beat-file second of the take's first sample. Takes are stored as 16-bit WAV in `takeAudio`.
- **Playback/mix** (`audio/mix.ts`) uses one scheduler for take playback, full-track playback and the offline WAV export (OfflineAudioContext + a gentle limiter). Clips carry a `region` (start/end/fades) from `audio/arrange.ts`, which joins neighbouring takes at the quietest point of their overlap and levels them. `play/vocals.ts → arrangedClips()` is the one entry point. The beat can also loop (`MixOptions.loop`, for Freestyle).
- **Metronome** (`audio/metronome.ts`) is a look-ahead scheduler on the AudioContext clock. It feeds its own click bus, never the beat bus or an export, through a gate that follows the setting live. `BeatPlayer` (previews, with seamless `loop`) and the recorders start it with the beat grid.
- **Scoring** (`scoring/`) is deterministic and explainable: each category returns reasons. Flow is the only audio-based category: onsets from the take vs the 16th-note grid, coverage and gaps.
- **Director** (`director/`):
  - `Director.afterRound(ctx)` returns `{ analysis, next, storyDirection }`, and `help(kind, ctx)` returns a string.
  - `basicDirector` handles hooks (people, themes, details), the arc stage and templates, and never repeats a template.
  - `llmDirector` gets the focus from `chooseFocus()` and asks the model for JSON (schema-constrained). It validates the answer (an instruction, on-focus, connected, not a repeat, not lyrics) and falls back to the rules.
  - `localModel` handles WebGPU detection, choosing the f16/f32 build, cache detection, download/load progress and deletion. WebLLM is imported lazily and runs in a worker.

### The coach
The rap intelligence (phonetic rhyme engine, semantic lexicon, bar analysis, scoring v2, skill profile, purposeful challenges, Help modes, the model's validated refine step) lives in `src/coach/` and is documented in [`COACH.md`](COACH.md).

### Why Qwen2.5 1.5B (and not 0.5B)
Candidates were tested on the same prompts with real song scenarios:

| Model | Result |
| --- | --- |
| Qwen2.5 0.5B (290 MB) | Not good enough: frequently generic or nonsensical ("write 2 bars about how my bus works") |
| Qwen3 0.6B | Generic, and copied the example's wording into unrelated songs |
| Llama 3.2 1B | Decent, but fell back on one template |
| Qwen2.5 1.5B (880 MB) | Most specific and varied; still occasionally odd, which is what the validation is for |

## How later stages slot in
| Stage | Where it goes |
| --- | --- |
| 2 Beats ✅ | `storage/beatLibrary.ts`, `audio/analysis/`, `audio/BeatPlayer.ts`, `domain/beatGrid.ts`, `views/BeatsView` + `components/beats/` |
| 3–5 Play ✅ | `audio/recordTake.ts`, `audio/mix.ts`, `audio/trackPlayer.ts`, `play/`, `scoring/`, `director/`, `components/play/` |
| Later: server AI | add a `Director` implementation that calls our own server route (the key stays on the server); `currentDirector()` picks it |
| 6 Saved / Improve / Freestyle ✅ | `storage/freestyleStore.ts` (DB v3) + `components/saved/`, `improve/analyse.ts` + `components/play/ImproveView.tsx`, `freestyle/` (prompts, recorder, on-device Whisper in `asr.worker.ts`, scoring, session) + `components/freestyle/` |
| 7 | device selection, latency calibration, deployment workflow |

### AI rules baked into the contract
- `Director` (`src/director/types.ts`) is an interface: the basic rule-based director and the local in-browser model both implement it, so a server-backed provider can be added later without touching the UI.
- API keys never ship to the browser or the repo. Any future hosted model must sit behind a backend route.
- The local model's output is validated (must ask for 2 bars, stay on focus, connect to the song); anything invalid falls back to the basic director.
- A score category is only produced when there is a real input for it (`CategoryScore.basis`). Timing comes from measured audio features, never from guessing on lyric text.
- Help may teach, explain and hint, but it doesn't write the bars by default.
