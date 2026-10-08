# RAP BUT RANKED

**Write 2 bars. Rap them. Get ranked. Build the song.**

The player writes and performs their own lyrics. The app sets challenges, judges what it can honestly measure, ranks each round from D to S, and steers the next two bars so the track turns into a real song. It never writes the bars for the player.

> **Status: core loop playable.** Upload a beat → pick a topic → write 2 bars → preview → record → listen back → submit → get scored → get a next challenge that follows your story → repeat → finish the song, play it back and download it. Freestyle is still a preview.

## Run it

First time (Windows Command Prompt, macOS or Linux terminal):

```
git clone https://github.com/Sc01ty/Testing-AI.git
cd Testing-AI
git checkout claude/inspiring-curie-wctfxr
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
| 3 | Play without AI: setup, 2-bar challenge, preview, count-in, record, playback, retake | — |
| 4 | Ranking + AI: scoring pipeline, judging screen, rank, feedback, next challenge, Help | — |
| 5 | Full song: all rounds, take timeline, full playback, final rank, export | — |
| 6 | Freestyle mode | — |
| 7 | Devices, latency, polish, deployment | — |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how each stage plugs in.

## Playing a track
1. **Beats → Add beat.** Drop an MP3/WAV anywhere on the screen. Check the BPM (½× / 2× / type it / tap **T**) and where bar 1 starts, then save.
2. **Play.** Name the track, pick the beat, a starting topic and a length (8 / 16 / 32 bars; lengths the beat is too short for are disabled).
3. **Each round** is 2 bars:
   - Write both bars yourself.
   - **Preview bars** plays exactly those two bars of the beat.
   - **Record**: 🎧 headphones on. A bar of count-in (3, 2, 1, with clicks), then rap. It stops by itself after the two bars. The first time, the browser asks for the mic.
   - **Play back** to hear the beat with your vocal, **Retake**, or **Submit**.
4. **Judging** reveals five scores, the round score and a D–S rank, then the next challenge. Click or Space skips the reveal.
5. **Track complete**: final scores and rank, **Play full track** (every take placed exactly where you recorded it, lyrics highlighted), **Download WAV**, lyrics, round history, **Try again**.

Everything is saved in the browser as you go. Refreshing mid-track puts you back in the same round, and **Play → Continue** resumes an unfinished track.

### Scoring (and what it can't do)
Every score lists the reasons behind it.

| Category | From | How |
| --- | --- | --- |
| Rhyme | lyrics | End rhyme between your two bars (perfect / multisyllabic / slant / vowel) plus internal rhymes, using a spelling-to-sound rhyme engine |
| Prompt | lyrics | Did your words hit what the challenge asked for (including slang: bread, racks, mum/mom…)? |
| Story | lyrics | Do these bars connect to earlier ones (people, themes) *and* move it on (new detail)? |
| Flow / timing | your recording | How close your syllable onsets land to the beat's 16th-note grid, how much of the two bars you rap through, and long gaps |
| Originality | lyrics | Clichés, repeated words, the most obvious rhymes, reusing earlier bars |

**Not measured:** voice quality, tone, charisma. No number from a mic signal can judge those fairly, so they aren't scored. Timing depends on the latency estimate; if takes sound early or late, adjust **Settings → Microphone → Timing fine-tune**.

### The director: Rap AI or basic
- **Rap AI** is a small language model (Qwen2.5 1.5B, 4-bit) that runs *in your browser on your GPU* via WebGPU/WebLLM. There's no API key, no server, and nothing leaves your computer. It's a one-time ~880 MB download, then cached. It needs a desktop browser with WebGPU (Chrome or Edge) and ~1.6 GB of GPU memory.
- **Basic director** is rule-based, not an AI, and is always available. It reads your bars for people, themes and details and follows a song arc (setup → deeper → people → obstacle → turning point → back to the start).
- **They work together:** the rules pick *what* to follow (e.g. you just mentioned your mum), and the model phrases a fresh challenge around it. Every AI answer is checked (on-focus, connected to your song, an instruction rather than lyrics, not a repeat). If it fails, the rules' challenge is used and it's labelled **Basic director**.
- **Help** (side panel) explains the challenge, gives hints, finds rhymes and talks through the story. It won't write your bars.

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
