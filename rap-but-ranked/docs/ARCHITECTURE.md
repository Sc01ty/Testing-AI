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
  audio/          AudioEngine (buses), sound registry, synth recipes
  settings/       persisted settings store + hook
  domain/         types for beats, takes, challenges, scores, ranks; rank thresholds
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
`MenuView` owns both the title sequence and the menu, so the logo is a single element that travels from centre stage to the menu corner (`enter → pre → rap → reveal → settle → menu`).

- **enter:** a minimal *Click to enter*. Browsers block audio until a gesture, so this click unlocks the AudioContext and starts the theme. `app/config.ts → CLICK_TO_ENTER` can turn it off.
- **Music-synced reveal:** the theme starts at `MENU_THEME_START` (2.6s). The intro polls the music's own clock (`audio.getMusicTime`) and starts the reveal so RANKED lands on `MENU_THEME_HIT`. If the music is off or still buffering, it falls back to fixed timings, so the intro never stalls.
- **Sounds:** `impact` when RAP lands, `swish` for BUT, `impactBig` under RANKED, `transition` as the menu arrives.

## Audio
`audio/AudioEngine.ts` is one lazily created `AudioContext`:

```
ui bus ─────────────────┐
music ─ lowpass ─ mood ─ bus ┼─ master ─ out
(Stage 2+: beat bus, vocal bus, monitor)
```

- Components request sounds **by meaning** (`audio.play('confirm')`). `audio/sounds.ts` maps each meaning to a synth recipe or an audio file.
- Volumes come from settings (perceptual curve). Mute, master, UI and music levels are all live.
- Every call is a silent no-op until `unlock()`, so no component has to care about autoplay rules.
- Music is "wanted" from boot, preloaded once the first screen is idle, and started on the first gesture with a fade-in. Sub-pages muffle it with a lowpass rather than cutting or restarting it.
- `audio/musicEnergy.ts` runs one animation loop that reads the music's bass level (an AnalyserNode before the volume controls) and writes a smoothed `--energy` CSS variable to subscribed elements: the menu backdrop, the background glow and the sound icon. It's a fast-attack, slow-release loudness follower, not beat detection, and falls back to gentle procedural motion when no music is playing.

## Settings
`settings/settings.ts` is a tiny persisted store (localStorage, sanitised on load, safe if storage is blocked), read through `useSettings()` in React or `subscribe()` in modules. Later stages add fields there.

## How later stages slot in
| Stage | Where it goes |
| --- | --- |
| 2 Beats | `storage/beatStore.ts` (IndexedDB blobs + metadata), `audio/analysis/` (decode, peaks, BPM, grid), `views/BeatsView` |
| 3 Play | `audio/recorder.ts` (getUserMedia + worklet), `audio/transport.ts` (beat playback from bar N, count-in), `session/` store, `views/play/*` |
| 4 AI | `services/ai/httpProvider.ts` → **our own server route** holding the key; `scoring/` combines lyric judgements with client-measured `AudioFeatures`; judging + rank reveal views |
| 5 Song | `export/mixdown.ts` (OfflineAudioContext: beat + takes at `Take.beatStartSec`), results views |
| 6 Freestyle | `views/freestyle/*` reusing transport, recorder and AI service |
| 7 | device selection, latency calibration, deployment workflow |

### AI rules baked into the contract
- `AIService` is an interface, so providers can be swapped without touching the UI.
- API keys never ship to the browser or the repo. The HTTP provider will call a backend route.
- A score category is only produced when there is a real input for it (`CategoryScore.basis`). Timing comes from measured audio features, never from guessing on lyric text.
- Help may teach, explain and hint, but it doesn't write the bars by default.
