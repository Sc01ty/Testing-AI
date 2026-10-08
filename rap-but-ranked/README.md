# RAP BUT RANKED

**Write 2 bars. Rap them. Get ranked. Build the song.**

The player writes and performs their own lyrics. The app sets challenges, judges what it can honestly measure, ranks each round from D to S, and steers the next two bars so the track turns into a real song. It never writes the bars for the player.

> **Status: Stage 2 — Beat Library.** Brand intro, menu, settings and a full beat library (upload, analysis, waveform, BPM, preview, edit, delete, saved in the browser). Play and Freestyle can already pick a saved beat; their gameplay opens in later stages.

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
| `npm run test:e2e` | Browser tests (Playwright): intro, menu, every page, back nav, settings, mobile |

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

## Beat library (Stage 2)
- **Add:** *Add beat* (or drop an MP3/WAV anywhere on the Beats screen) → analysing → setup → *Save beat*.
- **Analysis** runs in your browser; nothing is uploaded anywhere. It decodes the file, draws the waveform from the real audio, then estimates BPM and where bar 1 starts (in a background worker).
- **BPM is a best guess.** It's very reliable on steady drum beats, but half/double-time is genuinely ambiguous (a 140 trap beat is also "70"), and short loops are a little less precise. Use ½× / 2×, type it in, or tap along (**T**).
- **Start (bar 1):** auto-placed after any silence and lined up with the kicks. Drag the marker on the waveform, or *Use playhead*, to skip a long intro.
- **Preview:** **Space** plays/pauses, click the waveform to jump, drag to scrub. Only one beat ever plays, and the menu music ducks while it does.
- **Storage:** beats (audio + metadata + waveform) are kept in IndexedDB in this browser, so they survive refreshes but not clearing site data or switching browsers.

## Audio assets
- `public/audio/music/menu-theme.mp3` is the supplied *RAP_BUT_RANKED* theme. It loops quietly on the menu and is muffled, never restarted, behind other pages. It preloads in the background once the page is up and starts on the first interaction, or immediately if the browser allows autoplay.
- UI sounds are currently tiny procedural Web Audio sounds (`src/audio/synthRecipes.ts`). When the Game Audio Vault is linked, drop files in `public/audio/ui/` and point the entries in `src/audio/sounds.ts` at them. Components won't need to change.

## Fonts
[Unbounded](https://fonts.google.com/specimen/Unbounded) is the display face and [Manrope](https://fonts.google.com/specimen/Manrope) the UI/body face. Both are SIL Open Font License and self-hosted through `@fontsource-variable`, so there are no third-party font requests.
