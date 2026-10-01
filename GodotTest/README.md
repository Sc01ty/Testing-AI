# Elliot presence test

Open this folder as a Godot 4 project and run `main.tscn`. Elliot now reacts
to player distance, gaze, approach, repeated crowding and following. Authored
animations are combined with procedural attention, posture, reaction timing,
social state and collision-checked world movement.

- `WASD`: move the camera
- arrow keys: turn the player view
- `F3`: toggle perception ranges and sight ray
- `1–4`: manual animation overrides for diagnosis only

The GLB in `assets/` is a generated copy. The canonical package asset is
`../Characters/Elliot/Model/elliot_rigged.glb`.

See `PERCEPTION.md` for perception thresholds and `PRESENCE.md` for the
expressive-behaviour architecture and verified A-K scenario results.
