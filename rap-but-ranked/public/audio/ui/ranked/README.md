# Ranked sounds

`rank-up.mp3` is Alfie's success sting ("success - Sound Effect"), with its 3.2 s of leading silence trimmed and loudness matched (−16 LUFS). It plays on placement and every promotion. Hall of Fame layers the orchestral fanfare (the score notes stacked into chords) on top.

Everything else is still a small Web Audio stand-in (`src/audio/synthRecipes.ts`). To use an FL export instead, drop the file in this folder and change its entry in `src/audio/sounds.ts`, e.g.

```ts
rpTick: { source: { kind: 'file', url: 'audio/ui/ranked/rp-tick.wav', gain: 0.5 }, minIntervalMs: 28 },
```

| Sound id | When | What to make |
|---|---|---|
| `rpTick` | Each RP line and each step of the counter | Short pluck or hi-hat tick, ~40 ms |
| `rpFill` | The RP bar starts filling | Riser, ~1.6 s, fine to cut off early |
| `divisionUp` | Crossing into the next division (not a new tier) | 2-note orchestral sting, C6 → E6 |
| `rankUp` | Placement complete / promoted to a new tier | ✅ your success sting |
| `nearMiss` | Ended within 15 RP of the next division | Low string swell that cuts off |
| `demote` | Dropped a division or tier | Descending 2 notes, quiet |
| `publish` | A rap goes on the Feed | Upward whoosh + 2 notes |
| `like` | Liking a track | Tiny pop |

Trim any leading silence before export; the reveal is timed to the frame.
