# RAP BUT RANKED

**Write 2 bars. Rap them. Get ranked. Build the song.**

The player writes and performs their own lyrics. The app sets challenges, judges what it can honestly measure, ranks each round from D to S, and steers the next two bars so the track turns into a real song. It never writes the bars for the player.

> **Status: Stage 1 — brand + main menu.** The intro, menu, navigation, sound system and settings work. Play, Beats and Freestyle are styled previews that open in later stages.

## Run it

```bash
cd rap-but-ranked
npm install
npm run dev        # http://localhost:5173
```

The production build is `npm run build && npm run preview` (http://localhost:4173). It builds to static files with relative paths, so it can be hosted on GitHub Pages as-is.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright): intro, menu, every page, back nav, settings, mobile |

### Controls
- **Intro:** plays automatically. Press any key or click to enter. Pressing early skips it.
- **Menu:** mouse, or `↑` `↓` / `W` `S` and `Enter`.
- **Pages:** `Esc`, `Backspace`, the **Menu** button, the logo, or the browser back button.
- **Settings → Brand intro → Replay** replays the reveal, which is handy for retakes.

## Stages

| # | Stage | State |
| --- | --- | --- |
| 1 | Brand, main menu, design system, UI audio, navigation | ✅ |
| 2 | Beat library: upload, IndexedDB, waveform, BPM detect/tap, offset, bar grid | — |
| 3 | Play without AI: setup, 2-bar challenge, preview, count-in, record, playback, retake | — |
| 4 | Ranking + AI: scoring pipeline, judging screen, rank, feedback, next challenge, Help | — |
| 5 | Full song: all rounds, take timeline, full playback, final rank, export | — |
| 6 | Freestyle mode | — |
| 7 | Devices, latency, polish, deployment | — |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how each stage plugs in.

## Audio assets
- `public/audio/music/menu-theme.mp3` is the supplied *RAP_BUT_RANKED* theme. It loops quietly on the menu, is muffled behind other pages, and only loads after the first gesture.
- UI sounds are currently tiny procedural Web Audio sounds (`src/audio/synthRecipes.ts`). When the Game Audio Vault is linked, drop files in `public/audio/ui/` and point the entries in `src/audio/sounds.ts` at them. Components won't need to change.

## Fonts
[Unbounded](https://fonts.google.com/specimen/Unbounded) is the display face and [Manrope](https://fonts.google.com/specimen/Manrope) the UI/body face. Both are SIL Open Font License and self-hosted through `@fontsource-variable`, so there are no third-party font requests.
