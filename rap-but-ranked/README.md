# RAP BUT RANKED

**Write 2 bars. Rap them. Get ranked. Build the song.**

## v0.7 — local duo and freestyle revision

Scotty Systems: https://scottysystems.it.com/rap-but-ranked/ · Creator Tools: https://scottysystems.it.com/tools.html#rap-but-ranked

PLAY now opens **SINGLEPLAYER / MULTIPLAYER**. Singleplayer keeps its existing Play/Improve loop. Multiplayer is two people on one computer: name both players, choose a beat/topic/length, then Standard (4 bars each) or Quick Trade (2 bars each). Prepare each section in order; the basic or optional local AI director sees both players' lyrics. Once every section is ready, perform the whole track with one count-in and one continuous beat.

Clean handoffs change players at the bar line. Overlap handoffs cue the incoming player one beat early. A shared microphone records both voices in one master, heard once in the mix; it does not separate speakers. Individual performance scores are withheld for turns touching an overlap. Retakes punch into fixed slots and never move later sections; both players must repeat any shared overlap inside the replacement slot. Combined rank averages measured round feedback; story observations cite repeated lyric details rather than adding an invented teamwork number.

Completed duo tracks appear in Saved, with both names, playback and WAV export. Improve can analyse their writing. IndexedDB v4 adds a multiplayer store without rewriting existing singleplayer or freestyle records. A reload restores the open mode/session; returning from the main menu still offers the mode choice.

Freestyle adds Everyday / Personal / Absurd / Mixed categories, a compact challenge queue, mic/beat status, transcript excerpts for prompt hits and **Retry same settings**. Difficulty sets prompt pace; Chaos leaves at least two bars between prompts. Detection uses explicit words, narrow equivalents and a limited financial-context rule, not broad theme membership. Recognition is approximate and happens after recording; missing transcripts omit word categories. Retry keeps category, duration, difficulty and prompt-frequency settings, with a fresh prompt sequence.

Source modules: `src/multiplayer/` for turn plans, storage, continuous capture UI and mixing; existing singleplayer audio remains intact. The optional local model uses its existing WebLLM worker and validated JSON instructions with a labelled basic-director fallback. Live multiplayer inference and real-device latency need human verification; browser recording tests use synthetic microphone audio.

GitHub Pages rebuilds on main pushes. The Scotty Systems domain is a separate deployment: copy `dist/` into the Portfolio's `public/rap-but-ranked/` and use `deploy-tools/Publish-RapButRanked.ps1 -AppOnly`. Upload assets before the app index. No built-in third-party beats are bundled.

The player writes and performs their own lyrics. The app sets challenges, judges what it can honestly measure, ranks each round from D to S, and steers the next two bars so the track turns into a real song. It never writes the bars for the player.

> **Status: core loop playable.** Upload a beat → pick a topic → write 2 bars → preview → record → listen back → submit → get scored → get a next challenge that follows your story → repeat → finish the song, play it back and download it. Freestyle is still a preview.

**Play it in your browser:** https://sc01ty.github.io/Testing-AI/ (Chrome or Edge on desktop; allow the microphone when asked). It rebuilds automatically on every push to `main` (`.github/workflows/deploy-rap-but-ranked.yml`).

## Run it

First time (Windows Command Prompt, macOS or Linux terminal):

```
git clone https://github.com/Sc01ty/Testing-AI.git
cd Testing-AI
git checkout main
cd rap-but-ranked
npm install
npm run dev
```

Then open http://localhost:5173 (Chrome or Edge, sound on). After that it's just `cd Testing-AI/rap-but-ranked` and `npm run dev`. Requires Node.js 20+.

The production build is `npm run build && npm run preview` (http://localhost:4173). It builds to static files with relative paths, so it can be hosted on GitHub Pages as-is.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright): intro, menu, beat library, and a full song session with a fake microphone |

### Controls
- **Intro:** a ~2s brand sting plays on load, then the menu builds in. Any click or key skips it.
- **Audio:** browsers block sound until you interact with the page. If yours does, the sting is silent and the menu theme and UI sounds start on your first click or key press (hovering doesn't count as interaction for browsers).
- **Menu:** mouse, or `↑` `↓` / `W` `S` and `Enter`.
- **Pages:** `Esc`, `Backspace`, the **Menu** button, the logo, or the browser back button.
- **M** mutes or unmutes everything.
- **Settings → Brand intro → Replay** replays the sting, which is handy for retakes.

## Stages

| # | Stage | State |
| --- | --- | --- |
| 1 | Brand, main menu, design system, UI audio, navigation | ✅ |
| 2 | Beat library: upload, IndexedDB, waveform, BPM detect/tap, offset, bar grid | ✅ |
| 3 | Play without AI: setup, 2-bar challenge, preview, count-in, record, playback, retake | ✅ |
| 4 | Ranking + AI: scoring pipeline, judging screen, rank, feedback, next challenge, Help | ✅ |
| 5 | Full song: all rounds, take timeline, full playback, final rank, export | ✅ |
| 6 | Saved raps, Improve, Freestyle, loop + metronome, continuous takes | ✅ |
| 7 | Devices, latency calibration, deployment | — |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how each stage plugs in.

## Playing a track
0. **Play** opens on **PLAY / IMPROVE**. Improve stays locked until you've finished a track.
1. **Beats → Add beat.** Drop an MP3/WAV anywhere on the screen. Check the BPM (½× / 2× / type it / tap **T**) and where bar 1 starts, then save.
2. **Play.** Name the track, pick the beat, a starting topic and a length (8 / 16 / 32 bars; lengths the beat is too short for are disabled).
3. **Each round** is 2 bars:
   - Write both bars yourself.
   - **Preview bars** plays exactly those two bars of the beat. The small **loop** button next to it repeats them seamlessly until you stop. The **metronome** button adds a quiet click on every beat (volume in Settings). It's never in your recordings or exports.
   - **Record**: 🎧 headphones on. A bar of count-in (3, 2, 1, with clicks), during which you hear the end of your previous take so the flow carries on. Then rap. It stops by itself after the two bars. The first time, the browser asks for the mic.
   - **Play back** to hear the beat with your vocal, **Retake**, or **Submit**.
4. **Judging** reveals five scores, the round score and a D–S rank, then the next challenge. Click or Space skips the reveal.
5. **Track complete**: final scores and rank, a **song timeline** (beat + every take), **Play full track**, **Download WAV**, lyrics, round history, **Try again**. The track is saved to **Beats → Saved**.

### One continuous vocal (no gaps)
Each take is recorded a beat early (pickups) and runs a little past its last bar, so neighbouring takes overlap. When the song plays (and when it's exported), `audio/arrange.ts`:
- keeps every take at the exact beat position it was recorded. Your timing isn't moved or snapped.
- cuts each seam at the quietest moment inside the overlap, with a 20 ms crossfade. Nothing plays twice, and no silence is inserted. The only quiet is the quiet you left.
- trims leading silence before your first word and keeps a natural tail after your last.
- levels every take to the same loudness.

This is tested on the real audio in a browser (`e2e/audio.spec.ts`): no gaps, no doubled overlaps, no clicks added at seams, no metronome in the export.

## Saved, Improve, Freestyle
- **Beats → Saved** lists finished tracks and freestyles: rank, score, beat, topic, bars and date, plus play, lyrics, history, WAV download and delete. Vocals and timing are kept in IndexedDB, so a saved song plays back exactly as made. If you delete its beat, the vocals still play on their own.
- **Improve** reads one finished track and tells you what you're doing well, what's holding you back and what to think about next time, quoting your own bars. It then gives you exercises (for example "write 2 bars about money without using money / cash / rich") with a **Check** button. It's rule-based analysis, not a chatbot, and it never writes bars for you.
- **Freestyle:** pick a beat, 30s / 1 min / 2 min, a difficulty (Easy: a new word every 8 bars; Medium: every 4; Hard: every 2, harder words; Chaos: random timing and words) and optionally the prompt frequency. The beat loops and you record one continuous take. Afterwards it's transcribed **on your device** (Whisper base, ~77 MB, one-time download, no key, audio never uploaded). It's then scored on Prompts, Continuity, Rhyme, Variety and Flow/timing. Without a transcript (switched off or unavailable), only Continuity and Flow/timing are scored, and the result says so.

Everything is saved in the browser as you go. Refreshing mid-track puts you back in the same round, and **Play → Continue** resumes an unfinished track.

### Scoring (and what it can't do)
Writing and performance are scored separately, and every number lists its reasons.
- **Writing:** Meaning, Rhyme (judged by sound with a pronunciation dictionary, including multis across words and slant rhymes), Cadence (syllables against the bar at this tempo), Naturalness, Structure and Originality. **Wordplay** only appears when you attempt it. It can raise the score but never lowers it, so a plain line that moves the story is not marked down.
- **Performance** comes from your recording: timing on the beat grid, filling the bars, dead gaps. Voice quality, tone and charisma aren't scored, because a mic signal can't judge them fairly.
- The coach flags **possible rhyme-first filler** ("if the rhyme disappeared, would this word still have a reason to be here?"). It gives one focus for next time, and notes how much Help you used without penalising it.

Details are in [`docs/COACH.md`](docs/COACH.md).

### The director: Rap AI or basic
- **Rap AI** is a small language model (Qwen2.5 1.5B, 4-bit) that runs *in your browser on your GPU* via WebGPU/WebLLM. There's no API key, no server, and nothing leaves your computer. It's a one-time ~880 MB download, then cached. It needs a desktop browser with WebGPU (Chrome or Edge) and ~1.6 GB of GPU memory.
- **Basic director** is rule-based, not an AI, and is always available. It reads your bars for people, themes and details and follows a song arc (setup → deeper → people → obstacle → turning point → back to the start).
- **They work together:** the rules pick *what* to follow (e.g. you just mentioned your mum), and the model phrases a fresh challenge around it. Every AI answer is checked (on-focus, connected to your song, an instruction rather than lyrics, not a repeat). If it fails, the rules' challenge is used and it's labelled **Basic director**.
- **Help** is a coach panel with six modes: **Thought** (what do you actually want to say?), **Connections** (where a word leads, and where two worlds collide), **Rhymes** (families: multis, perfect, slant), **Flip** (second meanings and sound-alikes), **Flow** (type a mumbled cadence like `da-da-DA-da` and it reads the shape) and **Critique** (what works, what doesn't, one next action). Each starts with a nudge; **More help** goes deeper. It won't write your bars, and if you ask it to, you get your strongest idea back plus directions to explore.
- **Challenges have a purpose.** The next challenge continues your song *and* trains something: the weakness the coach just saw, or one that keeps coming up across your recent rounds (e.g. "…without using money, cash or rich" if your bars are too general). Stronger players get stretch goals like hidden double meanings.

## Beat library
- **Analysis** runs in your browser; nothing is uploaded anywhere. It decodes the file, draws the waveform from the real audio, then estimates BPM and where bar 1 starts.
- **BPM is a best guess.** On 20 real hip-hop clips it got 16 exactly right, 2 at half/double speed (one press of ½× or 2×) and 2 ambiguous 3:2 cases, which show as "fairly sure" or "unsure". You can always type it in or tap along.
- **Start (bar 1):** auto-placed after any silence and lined up with the kicks. Drag the marker to skip a long intro.
- **Playback:** only one thing ever plays at a time, and the menu music ducks while it does.
- **Storage:** beats, sessions and takes live in IndexedDB in this browser. They survive refreshes, but not clearing site data or switching browsers.

## Audio assets
- `public/audio/music/menu-theme.mp3` is the supplied *RAP_BUT_RANKED* theme. It loops quietly on the menu and is muffled, never restarted, behind other pages. It preloads in the background once the page is up and starts on the first interaction, or immediately if the browser allows autoplay.
- UI sounds are currently tiny procedural Web Audio sounds (`src/audio/synthRecipes.ts`). When the Game Audio Vault is linked, drop files in `public/audio/ui/` and point the entries in `src/audio/sounds.ts` at them. Components won't need to change.

## Fonts
[Unbounded](https://fonts.google.com/specimen/Unbounded) is the display face and [Manrope](https://fonts.google.com/specimen/Manrope) the UI/body face. Both are SIL Open Font License and self-hosted through `@fontsource-variable`, so there are no third-party font requests.
