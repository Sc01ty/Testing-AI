# Elliot rig

`elliot_rigged.glb` is the portable, Y-up, -Z-forward animated character.
The original OBJ/MTL remain the static modelling checkpoint.

## Skeleton

- Hips
  - Spine
    - Chest
      - Neck
        - Head
      - LeftUpperArm
        - LeftLowerArm
          - LeftHand
      - RightUpperArm
        - RightLowerArm
          - RightHand
  - LeftUpperLeg
    - LeftLowerLeg
      - LeftFoot
  - RightUpperLeg
    - RightLowerLeg
      - RightFoot

## Animation clips

- `IDLE_NEUTRAL_A` (3.60s)
- `IDLE_NEUTRAL_B` (4.20s)
- `IDLE_NERVOUS_A` (2.80s)
- `IDLE_NERVOUS_B` (2.40s)
- `WEIGHT_SHIFT_LEFT` (1.60s)
- `WEIGHT_SHIFT_RIGHT` (1.60s)
- `ADJUST_SLEEVE` (2.20s)
- `RUB_HANDS` (2.00s)
- `TOUCH_FACE` (1.90s)
- `SCRATCH_NECK` (2.10s)
- `LOOK_AT_FLOOR` (2.20s)
- `LOOK_AROUND` (3.00s)
- `CHECK_BEHIND` (2.40s)
- `DEEP_BREATH` (2.40s)
- `NOTICE_PLAYER` (1.10s)
- `QUICK_GLANCE` (0.75s)
- `LONG_GLANCE` (2.10s)
- `BREAK_EYE_CONTACT` (1.70s)
- `DOUBLE_TAKE` (1.50s)
- `LOOK_BACK_AT_PLAYER` (1.50s)
- `TURN_TOWARD_PLAYER_PARTIAL` (1.10s)
- `TURN_AWAY_FROM_PLAYER` (1.20s)
- `CLOSED_POSTURE` (2.00s)
- `STEP_BACK_SMALL` (1.00s)
- `STEP_BACK_FAST` (0.65s)
- `STEP_BACK_STARTLED` (0.53s)
- `BACKPEDAL_SHORT` (0.91s)
- `SIDE_STEP_LEFT` (0.90s)
- `SIDE_STEP_RIGHT` (0.90s)
- `TURN_AND_WALK_AWAY` (1.25s)
- `WALK_AWAY_NERVOUS` (1.13s)
- `STOP_AND_LOOK_BACK` (1.60s)
- `WALK_FORWARD` (1.00s)
- `WALK_BACKWARD` (1.53s)
- `TURN_LEFT` (1.00s)
- `TURN_RIGHT` (1.00s)
- `BUMP_RECOIL_LIGHT` (0.85s)
- `BUMP_RECOIL_MEDIUM` (0.85s)
- `SHOULDER_IMPACT_LEFT` (0.95s)
- `SHOULDER_IMPACT_RIGHT` (0.95s)
- `STUMBLE_BACK` (0.76s)
- `REGAIN_BALANCE` (1.10s)
- `HAND_UP_BOUNDARY` (1.50s)
- `CONFUSED_REACTION` (1.50s)
- `ANNOYED_REACTION` (1.40s)
- `PHONE_NOTICE` (1.00s)
- `PHONE_PULL_OUT` (1.10s)
- `PHONE_LOOK_AT` (2.40s)
- `PHONE_SCROLL` (2.60s)
- `PHONE_RAISE_TO_EAR` (0.95s)
- `PHONE_TALK_IDLE` (3.00s)
- `PHONE_LISTEN_IDLE` (3.20s)
- `PHONE_LOWER_SLIGHTLY` (0.70s)
- `PHONE_END_CALL` (0.90s)
- `PHONE_PUT_AWAY` (1.10s)
- `NERVOUS_IDLE` (2.40s)
- `GLANCE_AWAY` (1.65s)
- `STEP_BACK` (1.20s)
- `NERVOUS_WARNING` (1.35s)

## Godot import

1. Copy or drag the GLB into the Godot project.
2. Leave scale at `1.0`; the asset is authored in metres.
3. Keep animation import enabled and loop `NERVOUS_IDLE` only.
4. The example project uses uppercase animation names exactly as listed above.
5. If Godot adds a name prefix, select the imported AnimationPlayer and confirm the generated library names.

## Reuse

The 17-bone hierarchy and animation names are character-independent. A later
character can reuse it by mapping mesh sections/weights to the same bone names.

## Geometry

- 2,911 vertices across 47 named mesh sections
- 4,598 triangles
- Rigid weights (one joint per vertex), chosen for this segmented low-poly prototype

## Limitations

- No facial blendshapes or separate eye bones yet; gaze is communicated by head direction.
- Rigid weights suit this model but elbows/shoulders will need blended weights on a continuous future mesh.
- `STEP_BACK` is in-place. The behaviour controller moves the entity 0.28 m so perception and navigation share one world position.
- The GLB and poses were structurally validated and rendered from their skin transforms, but no local Godot executable was available for an engine playtest.
