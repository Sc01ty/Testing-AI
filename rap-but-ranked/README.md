# RAP BUT RANKED

**Write 2 bars. Rap them. Get ranked. Build the song.**

## v0.13 — ranked ladder, Feed and Leaderboards

**Ranks.** Every finished piece earns or loses **RP**: solo tracks, freestyles and your sections of an online multiplayer track. The ladder is **OPEN MIC → CYPHER → UNDERGROUND → BREAKOUT → MAINSTAGE → HEADLINER → ICON → HALL OF FAME**, three divisions each (III → II → I, 100 RP per division), except Hall of Fame. The round grades D–S stay as they were; they now feed the ladder.
- **Par, not averages.** Each point on the ladder expects a score (Open Mic 45 … Headliner 80 … Hall of Fame 90, sliding smoothly between tiers). RP = (score − par) × 3 + 10, capped at −30 / +60, times length (8 bars ×0.6, 16 ×1, 32 ×1.6; freestyle 30 s ×0.4, 60 s ×0.7, 2 min ×1; multiplayer your bars ÷ 16). A B track is a big jump early and a loss at Headliner.
- **Placement:** your first 3 pieces never lose RP and count ×2.2 (up to 150 raw), capped at Breakout III, so good rappers don't grind Open Mic. **Hot streak:** 3 rounds in a row at A or S gives +10% RP on that track, shown live in the studio. **Demotion shield:** the first loss after a promotion can't drop you out of the new tier.
- **The reveal** (end of a track, freestyle or multiplayer track): the breakdown lines tick in, +RP counts up, the bar fills towards the next division (flash + reset at each line it crosses), then the verdict: PROMOTED / DIVISION UP / ONE MORE TRACK (within 15 RP) / DIVISION DOWN / DROPPED. Placement and promotions get a full-screen emblem moment with Alfie's success sting; Hall of Fame adds a fanfare built from the score notes. Each piece pays out once, by id, so reloading or reopening from Saved never pays twice. Space or click skips it.
- `src/ranked/ladder.ts` is the maths; `public/api/social-ladder.php` is a line-for-line copy so the server can work RP out itself. `src/ranked/ladder.test.ts` checks both agree on 2,000 random cases.
- Emblems: `public/ranks/*.svg` are placeholders; see `public/ranks/README.md` for the Illustrator brief. Sounds: `public/audio/ui/ranked/README.md`.

**Feed, Leaderboards, profiles** (`public/api/social.php`, same PHP host as the rooms):
- **Names** with no password or email: claim a name and you get a recovery code, which is your login on another device. Claiming replays this device's rank history through the server's own maths (capped at Breakout III).
- **FEED**: New / Trending. **+ Publish rap** picks from Saved (tracks, freestyles, multiplayer tracks); it uploads the finished mix as a 22 kHz mono WAV with lyrics, scores and round grades. No outside uploads. Cards play in place; opening one gives seeking, lyrics, score breakdown, like and report. A listen counts after 8 s, once per listener per day.
- **LEADERBOARDS**: Ranked (top 100 by RP), Most listened, Trending (plays this week, recent ones weigh more), Top scores. **Profiles** at `#/profile/<name>`: rank, position, peak, tracks, listens, published tracks. Hall of Fame players in the top 100 get a **#N WORLD** tag.
- **Moderation:** names, titles and captions go through a strict word filter; lyrics only through the hard-slur list (`public/api/social-filter.php`, edit the lists to change policy). Anyone can **Report**; 3 reports hide a track until an admin looks. Admins (names in `RBR_ADMIN_NAMES`, via env, `scotty-shop-secrets.php` next to the web root, or `rbr-social/admins.txt`) get **#/admin**: restore / hide / remove tracks and ban names. A ban hides everything the player published and stops them earning RP.
- **Honestly:** scores are worked out in the browser, so the server treats them as claims. It recomputes RP itself, ignores repeats, rate-limits, and caps imports. That's the right level for a free game; it is not anti-cheat.
- **Storage:** SQLite + WAVs **outside the web root** in `<parent of document root>/rbr-social` (override with `RBR_SOCIAL_ROOT`). The host needs `pdo_sqlite`. Locally that's `rap-but-ranked/rbr-social/` (git-ignored).

Menu: FEED and LEADERBOARDS sit in a smaller row under the main four (↓ / ↑ reach them, ← → move along the row). The corner chip shows your emblem, rank and RP to the next division, and opens your profile.

Tests: `src/ranked/ladder.test.ts` (ladder, placement, caps, shield, streaks, PHP parity), `node --test scripts/social.test.mjs` (starts its own PHP server: names, server-side RP, publish validation, feed, audio ranges, plays, likes, the 3-report hide, bans, leaderboards), `e2e/ranked.spec.ts` (finish a real track with a fake mic → RP reveal pays once → claim a name → publish → play from the Feed → unpublish; needs `php -S localhost:4180 -t public`).

## v0.12 — the scoring rise

The judging reveal (singleplayer rounds and freestyle results) plays the supplied notes as the scores land: a whole-tone climb from C5 to C6 (`public/audio/ui/score-notes/`). Each category score lands on the next note up, and the round score always lands on the top C6, followed by the rank impact. Rounds with more reveals than notes start a whole tone or two lower by pitching C5 down. Each MP3's ~28 ms of encoder silence is skipped and the notes are loaded before the reveal, so every note starts with its number. The levels are evened out (the higher notes were ~3 dB quieter) with a slight build towards the top. The notes go through the UI volume and mute. They replace the per-category tick and the score chime. Multiplayer shows its section scores on a card with no step-by-step reveal, so it doesn't use the rise. `e2e/score-rise.spec.ts` logs every note as it starts and checks the order and its sync with the reveal.

## v0.11 — the bouncing-ball Rhyme Run, and Relay vs Parallel

**Freestyle → Rhyme Run** (now the default mode) uses the Rhyme Game timing idea in Rap But Ranked's own look. Every bar is a row: `1 · 2 · 3 · TARGET`. A ball bounces on every beat. Rap anything you like on beats 1–3, then land the target word with the ball on beat 4. Rows come in rhyme families checked against the pronunciation dictionary (ground / sound / found / round). The next row slides up early enough to see the rhyme coming.
- **The ball is driven by the audio clock, not CSS timing.** Each frame reads the beat's real playback position, minus the speakers' output latency, and places the ball from that. It keeps the beat's BPM through stops, restarts and dropped frames (`src/freestyle/rhymeRun.ts → ballAt`, `src/components/freestyle/RhymeBall.tsx`).
- **Difficulty** changes the rhymes and how much warning you get. Easy: one-syllable rhymes, the whole family shown, a breather bar between families. Medium: two-syllable families join, current + next shown. Hard: longer multis, the next rhyme appears on beat 3. Chaos: slant families switching every 2 bars, the next rhyme only on beat 4.
- **Try the ball** on the setup screen plays the chosen beat with the ball (pause / resume / restart) without recording.
- **Scoring happens after the run, from the transcript and audio.** Nothing is faked live. Each target shows `SOUND ✓ landed +90ms`, `said “pound” instead` (half credit), or `target not detected`. Then **N / M LANDED**, a **TIMING** grade (average distance from beat 4: S ≤ 60 ms … D > 250 ms) and the **RHYME RUN** score (landed 55%, timing 25%, lines built 20%). Word times come from on-device speech recognition and are sharpened by the audio onset. Expect ±100 ms or so, so timing is marked low-confidence. "Lines built" checks the recording for rapping on beats 1–3, so saying only the word doesn't count. Without speech recognition, landings are shown as *Not checked*.
- **Topic Run** (the previous topic-every-few-bars mode) is still there as the second option. Rhyme runs saved before v0.11 still open and show their old results.

**Multiplayer has two game modes.** The host picks one when setting up the track:
- **RELAY:** the v0.10 turn system. One player has the studio; the other sees *SCOTTY IS RAPPING · GET READY FOR YOUR TURN*, their mate's challenge, the bars they'll get and a tip. Each direction is written after the previous section is submitted, so it can answer what was just said.
- **PARALLEL:** both players write and record at the same time on their own PCs. Sections alternate (16 bars: P1 1–4, P2 5–8, P1 9–12, P2 13–16), so Player 2 is effectively four bars ahead. Directions come in **pairs** per batch: two complementary angles on the topic ("set the scene" / "what life looks like if it works out"). They only use sections already finished, and never pretend to know unfinished bars. Live board: *YOU — BARS 1–4 · WRITING* next to *ALEX — BARS 5–8 · ● RECORDING* (also PREVIEWING, RETAKING, READY). Your mate's lyrics and audio stay hidden until the track is complete, so the reveal is the finished song. Finish early and you move straight to your next section; once all yours are in, *SECTION LOCKED · WAITING FOR ALEX*.
- **The server owns the sections.** In Parallel each player can only submit their own next section, within its START/END bounds and only once it has a direction. The first request to direct a batch wins and later ones are ignored, so the two clients can't race into different directions. Every take is placed by its section's bars, never by upload order.

`public/api/rooms.php` adds `direct`, parallel ordering and a `retaking` status. Deploy it together with the app.

Tests: `src/freestyle/rhymeRun.test.ts` covers families rhyming by sound, plans, ball maths at 72/100/140 BPM and landing/offset/grade scoring. `e2e/rhymerun.spec.ts` checks the ball follows 120, 90 and 73 BPM beats against the audio clock and wall time, resumes in sync after pause, lands on the word on beat 4, touches down on the right row on mobile, and runs a full Rhyme Run to results. `scripts/rooms.test.mjs` covers parallel ownership, ordering, first-writer directions, upload-order placement and bounds. `e2e/revision.spec.ts` covers Relay (the next challenge picks up the previous player's words) and Parallel with two isolated browsers: both write and record at once, see each other's status, finish at different times, refresh mid-track, and get the same correctly ordered track and WAV.

## v0.10 — turn-by-turn online rooms and START / END sections

**Online multiplayer is now the singleplayer loop, taking turns.** Whoever's section it is gets the normal studio: challenge, one line per bar, beat waveform, preview/loop/metronome, record, play back, retake, **Submit turn**. The other player sees a get-ready screen: **“SCOTTY IS RAPPING”** (or writing / checking the take / locking it in, live from their mate's studio), *GET READY FOR YOUR TURN*, their mate's challenge and a small writing tip. On submit the take is scored on the submitter's device, uploaded, a quick score card appears on both screens and the studio switches to the other player, whose count-in plays the end of their mate's take. When every section is in, both browsers save the combined track. Afterwards each player can **Redo my section** without touching their mate's; the host can start a **New track in this room**. Voice chat is optional now.

**START / END handles** sit on the beat lane in singleplayer and online. Drag a handle to trim, drag the middle to slide, or use ← → (a beat) and Shift+← → (a bar). Everything snaps to beats. The window is **locked at its maximum length**: dragging END further does nothing (the box flashes). It can't leave its zone either:
- *Singleplayer:* each round may be placed up to four bars after where the previous round ended. It records at most two bars, and the zone never grows so far that the remaining rounds would run off the beat. Rounds you don't move sit exactly where they always did, so old sessions are unchanged.
- *Online:* a section stays inside its own bars (4 Standard, 2 Quick Trade, plus the early beat for overlaps), so the next player's section is never touched. The server rejects anything outside.

If you move START/END after recording, Submit is disabled until you record again, because the take no longer fits. The mix, WAV export and performance scoring use the chosen window.

Room API changes (`public/api/rooms.php`): `submit` (one section: lyrics, START/END, WAV, score, next challenge; turn order and ownership enforced; redo replaces the old file) and `activity` (what the active player is doing, without bumping the room version) replace `lock` / `ready` / `start` / `reset` / `upload`. **Deploy the PHP file with the app**: an old client won't work against the new API, and vice versa. Each new track in a room gets its own id, so finishing a second track no longer overwrites the first in Saved.

Tests: `src/play/sectionWindow.test.ts` (locking, trimming, sliding, zones, old-session placement), `scripts/rooms.test.mjs` (order, ownership, bounds, redo, activity) and `e2e/revision.spec.ts` (two isolated browsers take real turns in Standard, Quick Trade and overlap rooms with a fake mic, check the waiting screen and live “IS RAPPING”, try to drag END past the lock, then redo a section). `e2e/play.spec.ts` checks the singleplayer lock and trim.

## v0.9 — the real-playtest improvement pass

The existing Play loop, black/purple identity, online rooms and nine included beats remain. Rhyme feedback now exposes sound-pair evidence, phrase multis, slants, internal pairs and pronunciation confidence. Play, Freestyle and Improve use the same phonetic engine. Alternate dictionary pronunciations and common closed compounds are handled; filler endings no longer hide the landing. Repeated words/homophones do not earn new rhyme credit. Scores describe likely **written pronunciation**, not what an accent or performance actually sounded like. Unknown slang/names lower confidence; Freestyle also depends on the transcript and bar alignment.

Story challenges stay one short task. Optional skill coaching appears behind a separate hint instead of lengthening the prompt or enforcing hidden constraints. The local director sees the full lyric/challenge history and people/story context; validated short output falls back to the contextual basic director. Duo prompts retain speaker identity.

Freestyle has **Topic Run** and **Rhyme Run**. Topic Run uses the existing categories. Rhyme Run shows sound families and needs at least two different recognized words in each window; repetitions alone cannot hit a target. Difficulty, duration, beat, next prompt, remaining time, mic/metronome and progression stay visible. Prompt hits quote transcript excerpts after recording. Results separate Prompts Hit, Rhyme, Continuity, Repetition, Timing and Flow; unavailable word categories are left unjudged. Retry preserves settings with a fresh prompt plan. Story Run is intentionally deferred until reliable story assessment exists.

Completed singleplayer and duo tracks offer one optional continuous **ad-lib layer**: record over accepted beat/vocals, preview, keep, retake or mute. It has its own waveform and is mixed at a lower backing level into playback/WAV export. Cancelling a retake preserves the kept layer. Saved reloads it without changing the lead vocals or old records. **Online duo ad-libs are device-local**; both players retain the shared lead track, but extra layers are not uploaded to the room. Clearing browser storage removes local recordings.

Judging adds a quiet, cancellable rising chord texture, the user's Game Audio Vault `Menu_Confirm.wav` for score reveal (`public/audio/ui/score-reveal.wav`), and the existing rank impact. The reveal honors UI/master volume and mute. No dedicated orchestral riser was present in the inspected vault, so the rising texture uses Web Audio rather than an unrelated music excerpt.

Verification: `npm test -- --run` includes messy slants, slang, fillers, phrase multis, repeated sounds, guessed pronunciations and weak bars. `e2e/quality.spec.ts` captures a real browser microphone stream over seeded completed single/duo lead tracks and checks keep/mute/export/reload/cancel. Existing audio, freestyle and isolated-client room tests cover continuity, ASR, retry and multiplayer handoffs. Human ears remain the check for accent-sensitive fairness and sound balance.

## v0.8 — online rooms and included beats

Multiplayer now means **two separate devices**: enter your name, create a lobby, share its seven-character code and have your mate join. The host chooses the shared beat/topic/length and Standard or Quick Trade. Each player locks only their own sections; both can see the story so far. Enable voice, ready up on both devices, then the host starts one shared count-in. Keep the tab visible and wear headphones.

Both devices play the same beat locally against a start timestamp adjusted to the room server's clock. WebRTC carries live microphone audio; internet delay affects hearing your mate live. Each device records its own microphone, uploads it and downloads the other player's recording for the aligned finished mix. Overlaps can therefore receive separate performance feedback. Both players save the same combined track; owner-only retakes replace fixed slots and propagate to both browsers. Failed uploads have a retry button; the host can reset an interrupted performance. Reopening the lobby restores access in that tab.

Nine beats supplied from `D:\Video Projects\BEATS` are included; **bank fees - original.mp3 is excluded**. They appear in Beats and all beat selectors. Audio is copied unchanged; BPM/downbeat estimates come from the existing detector and remain adjustable in the beat library. Rooms use the included shared catalogue so nobody needs to upload or transfer a beat manually.

The room API (`public/api/rooms.php`) runs on the Scotty Systems PHP host, stores token-protected room data/audio in a private temporary directory, and expires room access after 24 hours. Expired files are cleaned on subsequent requests. Each room has two participants, a 100 MB recording budget, and 16 MB per upload. Client scores are feedback for a private session, not an authoritative competitive leaderboard. WebRTC uses public STUN servers; no TURN relay is configured, so some restrictive networks cannot connect voice. The UI requires connected voice before starting rather than silently running without your mate.

For local online development run `php -S localhost:4180 -t public` beside Vite; the dev/preview proxy forwards `/api`. `node --test scripts/rooms.test.mjs` checks access and state changes. `npx playwright test e2e/revision.spec.ts` tests isolated clients end to end. `RBR_LIVE_URL=https://scottysystems.it.com/rap-but-ranked/` runs those browser flows against the deployed host. GitHub Pages can serve singleplayer/freestyle but cannot execute PHP; online multiplayer links to the Scotty Systems deployment.

## v0.7 — previous local duo and freestyle revision

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
- Most UI sounds are tiny procedural Web Audio sounds (`src/audio/synthRecipes.ts`). When the Game Audio Vault is linked, drop files in `public/audio/ui/` and point the entries in `src/audio/sounds.ts` at them. Components won't need to change.

## Fonts
[Unbounded](https://fonts.google.com/specimen/Unbounded) is the display face and [Manrope](https://fonts.google.com/specimen/Manrope) the UI/body face. Both are SIL Open Font License and self-hosted through `@fontsource-variable`, so there are no third-party font requests.
