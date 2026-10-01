# Elliot perception and behaviour milestone

The behaviour thresholds live in `config/elliot_behavior_spec.json`. This makes
the specification portable while the reference test environment remains Godot.

## Signals

- smoothed player distance and signed approach velocity
- Elliot-to-player field of view plus obstruction ray
- player camera gaze toward Elliot
- stare duration with fast release
- awareness and personal-space hysteresis
- close dwell, approach, retreat, failed step-back/following
- decaying boundary-violation count and nervousness pressure

## State order

`CALM_IDLE -> WATCHING_PLAYER -> NERVOUS_IDLE`

Reactions interrupt passive states in this priority order:

1. `WARNING` for a followed step-back or repeated violations
2. `STEP_BACK` after 0.3 seconds continuously inside 1.55 m
3. `GLANCE_AWAY` after 1.4 seconds of sustained gaze
4. `RECOVERING` once the player is gone and nervousness falls below 0.16

Personal space exits at 1.9 m and awareness exits at 6.7 m, preventing boundary
jitter. `STEP_BACK` moves the Elliot entity 0.28 m; the animation itself is
in-place so gameplay distance and rendered distance remain consistent.
`WARNING` is latched once per encounter and resets after full recovery. A
separate boundary-response latch prevents Elliot stepping backward repeatedly
while the player remains stationary inside the same personal-space incident;
it resets only after the player exits personal space.

## Events for future dialogue/VO

`OnPlayerNoticed`, `OnLongStare`, `OnPlayerTooClose`, `OnStepBack`,
`OnPlayerFollowed`, `OnRepeatedBoundaryViolation`, `OnWarning`,
`OnPlayerBackedOff`, and `OnRecovered`.

Every emitted context includes priority, deterministic `variant_seed`, distance,
nervousness, stare time, violations and current perception flags. The event bus
owns cooldowns and can select a future line variant without involving Jev.

## Debug controls

- `WASD`: move
- arrow keys: turn player view
- `F3`: toggle awareness/personal-space rings and sight ray
- `1–4`: manual animation override, retained only for animation diagnosis

The screen panel reports state, current behaviour, attention, internal social
state, distance, stare time, previous/next action and following state.

## Validation boundary

`tests/simulate_perception_behavior.py` checks calm passage, staring, personal
space, hysteresis, following escalation, and recovery against the shared JSON.
`tests/presence_scenario_runner.tscn` is the runtime gate and has been executed
in Godot 4.7.1 across scenarios A-K. See `PRESENCE.md` for the result record.
