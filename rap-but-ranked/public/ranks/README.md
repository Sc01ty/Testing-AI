# Rank emblems

The eight files here are **placeholders** (made by `scripts/make-rank-placeholders.mjs`). Draw the real ones in Illustrator and save them over these, using the **same file names**. The app picks them up with no code changes.

| File | Tier | Idea | Colour |
|---|---|---|---|
| `open-mic.svg` | Open Mic | Lone mic stand in a spotlight circle | Graphite / grey |
| `cypher.svg` | Cypher | Mic in the middle of a ring of 5 dots (the cypher circle) | Bronze |
| `underground.svg` | Underground | Mic inside a brick tunnel arch | Concrete + teal |
| `breakout.svg` | Breakout | Mic smashing through a cracked ring, shards flying out | Silver + electric blue |
| `mainstage.svg` | Mainstage | Mic under two spotlight beams over a stage edge | Gold |
| `headliner.svg` | Headliner | Marquee bulbs around the badge + first small wings | Platinum / cyan |
| `icon.svg` | Icon | Vinyl behind the mic, bigger wings, small crown | Brand purple / magenta |
| `hall-of-fame.svg` | Hall of Fame | Gold mic on a pedestal, laurel, star halo | White-gold with a prism edge |

**One rule ties them together:** the same badge outline every time, with one thing added per tier, so a higher rank looks heavier at a glance. Wings start at Headliner, a crown at Icon, a full halo at Hall of Fame.

## Illustrator setup

- Artboard **1024 × 1024**. Keep the emblem inside a centred **880 px circle**: the app adds a glow around it, and the division bars sit just below.
- Flat vector. Before export: **Object → Expand** strokes and **Object → Expand Appearance** for effects, so the SVG looks the same in the browser.
- Export: **File → Export → Export As → SVG**. Styling: *Presentation Attributes*. Fonts: *Convert to outlines*. Images: *Embed*. Tick *Minify* and *Responsive*.
- **Don't draw the III / II / I divisions.** The app draws them as bars under the emblem in the tier's colour, so you make 8 emblems instead of 22.
- Test it small: the leaderboard and Feed show emblems at **30–40 px**. Zoom out until it's that size; if you can't tell the tiers apart, simplify.
- The glow colour for each tier is set in `src/components/ranked/ranked.css` (`--tier`). If your colours move, change those to match.
