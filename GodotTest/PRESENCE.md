# Elliot presence / expressive behaviour

## Architecture

The existing perception and seven-state behaviour controller remain the source
of high-priority facts and boundaries. Three focused layers now sit beside them:

- `SocialState` derives alertness, comfort, familiarity and irritation from the
  perception snapshot and behaviour events. Nervousness remains owned by the
  existing perception model.
- `PresenceController` converts events into short reaction sequences and selects
  occasional context-weighted micro-behaviours between sequences.
- `AttentionController` applies restrained head, chest, lean, weight, breathing
  and arm offsets over the currently playing authored animation.
- `SpatialRepositioner` turns the in-place step animation into collision-checked
  world movement away from the player.

The high-level state controller no longer writes gaze targets. This gives the
presence layer one owner for attention and avoids state/sequence conflicts.

## Behaviour and timing

Attention modes are `PLAYER_FACE`, `PLAYER_BODY`, `NEAR_PLAYER`, `FLOOR`,
`SIDE`, `RANDOM_ENVIRONMENT_POINT`, and `NONE`. Event-driven sequences cover
noticing, sustained staring, personal-space invasion, following, warning,
backing off, and recovery. Each sequence has context-dependent latency and may
be interrupted only by an equal/higher-priority event.

Between reactions, weighted selection favours stillness. Alertness, nervousness
and comfort adjust the alternatives; a three-action history penalty and per-
action cooldowns suppress obvious repetition. The random generator is seeded so
the harness is reproducible while timings still vary within a run.

Procedural limits are intentionally small: head yaw 28 degrees, head pitch 16,
chest yaw 8, lean 4, weight shift 1.4, arm fidget 2.2, and breathing 0.45.

## Spatial response and animation

The repositioner tests directions away from the player at 0, +/-35 and +/-70
degrees. A physics ray selects the direction with the most clearance, subtracts
a collision margin, and refuses movement below 0.08 m. Accepted movement uses a
smoothstep curve over 0.72 seconds and normally covers 0.28 m.

The existing `NERVOUS_IDLE`, `GLANCE_AWAY`, `STEP_BACK`, and
`NERVOUS_WARNING` clips are preserved. `AnimationPlayer.play()` crossfades over
0.18 seconds, priority locks prevent low-priority interruption, and procedural
bone offsets are layered after the authored pose. The current GLB exposes an
`AnimationPlayer`, not an `AnimationTree`, so this is crossfading plus procedural
overlays rather than a blend-tree rewrite.

## Godot 4.7.1 runtime results

Executed through `tests/presence_scenario_runner.tscn` in the real engine:

| Scenario | Observed response | Result |
| --- | --- | --- |
| A walk past, no look | notice/disengage/stillness; no step or warning | Pass |
| B nearby, ignored | brief notice, near-player glance, stillness | Pass |
| C brief eye contact | notice sequence only; no long-stare response | Pass |
| D continuous stare | check gaze, break eye contact, closed posture | Pass |
| E slow staring approach | alertness rose to 0.71; no premature step | Pass |
| F enter personal space | lean, one 0.28 m step, watch afterward | Pass |
| G stay still after step | exactly one step; no false follow/warning | Pass |
| H follow the step | follow detected, guarded watch, warning | Pass |
| I repeat violation | repeated-boundary event and one warning cycle | Pass |
| J back off | confirm distance, relax attention; comfort recovered to 0.34 | Pass |
| K leave 20+ sec, return | recovered to calm, then noticed return anew | Pass |

Runtime completion: `PRESENCE_SCENARIOS_COMPLETE failures=0`.

## Honest visual boundary

The engine-level sequences, transforms, state values and movement were verified.
This automated run does not prove that every procedural bone offset reads well
on Elliot's current stylised proportions from the player's camera. The remaining
gate is a short human visual pass in the editor, especially the 4-degree lean,
head/chest overlay during `GLANCE_AWAY`, and the 0.28 m animation-to-world step
sync. Those should be tuned, not expanded with more bespoke clips.
