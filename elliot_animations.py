"""Elliot's animation vocabulary.

Kept separate from rig_elliot.py on purpose: the rig, skinning and GLB export
are working and should not be touched to add clips. This module only produces
keyframe curves, which rig_elliot.py exports unchanged.

Authoring notes
---------------
Bone local axes at rest are world-aligned (the rest pose has no bone rotations),
with +Y up and -Z forward. So for a bone:

    X rotation -> pitch   (lean / limb swing forward-back)
    Y rotation -> yaw     (turn / twist)
    Z rotation -> roll    (side lean / limb abduction)

The sign conventions below are set by SIGN_* constants and were checked against
rendered poses rather than assumed - flip one constant to correct a whole family
of clips.

Movement principle
------------------
The previous STEP_BACK translated the hips while the body stayed near-static,
which is what made it read as a sliding prop rather than a person. Every retreat
clip here follows real weight-shift order:

    anticipate -> unweight one foot -> swing that leg -> transfer weight
    -> plant -> absorb -> settle (with a small overshoot)

and the arms always participate, counter-swinging against the legs.
"""

from __future__ import annotations

import math

import numpy as np

# --- sign conventions ---------------------------------------------------------
# Established empirically by tests/check_sign_conventions.py, which renders
# isolated single-bone poses from a fixed side view. Both of these are the
# opposite of what the axis layout suggests, and guessing them wrong inverts
# every torso lean and bends the knees forwards.
SIGN_LEAN_BACK = -1.0     # -X on Chest/Spine leans the torso BACKWARD
SIGN_LIMB_FORWARD = 1.0   # +X on an UpperArm/UpperLeg swings that limb FORWARD


def quat_axis(axis, degrees):
    axis = np.asarray(axis, dtype=float)
    axis = axis / np.linalg.norm(axis)
    a = math.radians(degrees) / 2.0
    return np.array((*axis * math.sin(a), math.cos(a)), dtype=np.float32)


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array((
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ), dtype=np.float32)


def qxyz(x=0.0, y=0.0, z=0.0):
    """Euler degrees -> quaternion, applied X then Y then Z."""
    return quat_mul(quat_mul(quat_axis((1, 0, 0), x), quat_axis((0, 1, 0), y)), quat_axis((0, 0, 1), z))


def curve(node, path, times, values):
    return {
        "node": node,
        "path": path,
        "times": np.array(times, np.float32),
        "values": np.array(values, np.float32),
    }


def _mirror(side: str) -> str:
    return "Right" if side == "Left" else "Left"


def _sign(side: str) -> float:
    """+1 for the left limb, -1 for the right, for mirrored roll/abduction."""
    return 1.0 if side == "Left" else -1.0


# =============================================================================
# Generators
# =============================================================================


def _breathing_spine(duration: float, depth: float = 1.0, phase_keys: int = 5):
    """Chest rise/fall. Every idle gets this so Elliot is never truly frozen."""
    times = [duration * i / (phase_keys - 1) for i in range(phase_keys)]
    values = []
    for i in range(phase_keys):
        t = i / (phase_keys - 1)
        amount = math.sin(t * math.pi * 2.0) * 0.55 * depth
        values.append(qxyz(SIGN_LEAN_BACK * -amount, 0, 0))
    values[-1] = values[0]
    return curve("Spine", "rotation", times, values)


def idle(name: str, duration: float, *, nervous: float = 0.0, sway: float = 1.0,
         head_drift=(2.0, -3.0), lead: str = "Left"):
    """Ambient standing idle. `nervous` raises fidget amplitude and tempo."""
    n = nervous
    hx, hy = head_drift
    k = [0.0, duration * 0.25, duration * 0.5, duration * 0.75, duration]

    head = [
        qxyz(hx, hy, 0),
        qxyz(hx + 1.5 + 3.0 * n, hy + 4.0 + 5.0 * n, -0.5),
        qxyz(hx + 3.0 + 5.0 * n, hy - 5.0 - 7.0 * n, 0.8),
        qxyz(hx + 1.0, hy + 2.0 + 3.0 * n, 0.2),
        qxyz(hx, hy, 0),
    ]
    chest = [
        qxyz(0, 0, 0),
        qxyz(0.6 * sway, 1.2 * sway, -0.9 * sway),
        qxyz(-0.4 * sway, -1.0 * sway, 0.7 * sway),
        qxyz(0.5 * sway, 0.6 * sway, -0.4 * sway),
        qxyz(0, 0, 0),
    ]
    # Weight rests mostly on one leg, so the hips roll very slightly.
    s = _sign(lead)
    hips = [
        qxyz(0, 0, 0.4 * s),
        qxyz(0, 0, 0.9 * s),
        qxyz(0, 0, 0.5 * s),
        qxyz(0, 0, 0.8 * s),
        qxyz(0, 0, 0.4 * s),
    ]
    arm_l = [qxyz(), qxyz(0, 0, -1.2 - 2.0 * n), qxyz(0, 0, -0.4), qxyz(0, 0, -1.6 - 2.4 * n), qxyz()]
    arm_r = [qxyz(), qxyz(0, 0, 0.9 + 1.6 * n), qxyz(0, 0, 0.3), qxyz(0, 0, 1.3 + 2.0 * n), qxyz()]

    return [
        curve("Head", "rotation", k, head),
        curve("Chest", "rotation", k, chest),
        curve("Hips", "rotation", k, hips),
        _breathing_spine(duration, depth=0.8 + 0.5 * n),
        curve("LeftUpperArm", "rotation", k, arm_l),
        curve("RightUpperArm", "rotation", k, arm_r),
    ]


def weight_shift(side: str, duration: float = 1.6):
    """Transfer weight onto one leg - the commonest real standing 'idle'."""
    s = _sign(side)
    k = [0.0, duration * 0.35, duration * 0.7, duration]
    return [
        curve("Hips", "rotation", k, [qxyz(), qxyz(0, 0, 2.4 * s), qxyz(0, 0, 2.6 * s), qxyz(0, 0, 0.4 * s)]),
        curve("Chest", "rotation", k, [qxyz(), qxyz(0, 0, -1.6 * s), qxyz(0, 0, -1.8 * s), qxyz(0, 0, -0.3 * s)]),
        curve("Head", "rotation", k, [qxyz(2, 0, 0), qxyz(2, -2 * s, -0.8 * s), qxyz(2, -2 * s, -0.9 * s), qxyz(2, 0, 0)]),
        # The unweighted knee softens.
        curve(f"{_mirror(side)}LowerLeg", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -5, 0, 0), qxyz(SIGN_LIMB_FORWARD * -6, 0, 0), qxyz()]),
        curve(f"{side}UpperArm", "rotation", k, [qxyz(), qxyz(0, 0, -1.4 * s), qxyz(0, 0, -1.5 * s), qxyz()]),
    ]


def hand_fidget(name: str, duration: float, target: str):
    """Self-soothing gestures: rubbing hands, touching face, adjusting a sleeve."""
    k = [0.0, duration * 0.22, duration * 0.5, duration * 0.78, duration]

    if target == "face":
        return [
            curve("RightUpperArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 34, 0, 10), qxyz(SIGN_LIMB_FORWARD * 46, 0, 13),
                   qxyz(SIGN_LIMB_FORWARD * 30, 0, 9), qxyz()]),
            curve("RightLowerArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 48, 0, -8), qxyz(SIGN_LIMB_FORWARD * 74, 0, -12),
                   qxyz(SIGN_LIMB_FORWARD * 44, 0, -7), qxyz()]),
            curve("RightHand", "rotation", k, [qxyz(), qxyz(0, 0, -8), qxyz(0, 0, -14), qxyz(0, 0, -6), qxyz()]),
            curve("Head", "rotation", k, [qxyz(2, 0, 0), qxyz(5, 3, 0), qxyz(7, 4, 0), qxyz(4, 2, 0), qxyz(2, 0, 0)]),
            _breathing_spine(duration, 0.7),
        ]

    if target == "neck":
        return [
            curve("LeftUpperArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 40, 0, -18), qxyz(SIGN_LIMB_FORWARD * 58, 0, -24),
                   qxyz(SIGN_LIMB_FORWARD * 36, 0, -16), qxyz()]),
            curve("LeftLowerArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 55, 0, 10), qxyz(SIGN_LIMB_FORWARD * 82, 0, 16),
                   qxyz(SIGN_LIMB_FORWARD * 50, 0, 9), qxyz()]),
            curve("Head", "rotation", k, [qxyz(2, 0, 0), qxyz(4, -6, -2), qxyz(6, -9, -3), qxyz(3, -4, -1), qxyz(2, 0, 0)]),
            curve("Chest", "rotation", k, [qxyz(), qxyz(0, -2, 0), qxyz(0, -3, 0), qxyz(0, -1, 0), qxyz()]),
        ]

    if target == "sleeve":
        return [
            curve("LeftUpperArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 22, 0, -8), qxyz(SIGN_LIMB_FORWARD * 30, 0, -11),
                   qxyz(SIGN_LIMB_FORWARD * 20, 0, -7), qxyz()]),
            curve("LeftLowerArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 44, 0, 6), qxyz(SIGN_LIMB_FORWARD * 58, 0, 9),
                   qxyz(SIGN_LIMB_FORWARD * 40, 0, 5), qxyz()]),
            curve("RightUpperArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 26, 0, 9), qxyz(SIGN_LIMB_FORWARD * 34, 0, 12),
                   qxyz(SIGN_LIMB_FORWARD * 22, 0, 8), qxyz()]),
            curve("RightLowerArm", "rotation", k,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 50, 0, -8), qxyz(SIGN_LIMB_FORWARD * 66, 0, -12),
                   qxyz(SIGN_LIMB_FORWARD * 46, 0, -7), qxyz()]),
            curve("Head", "rotation", k, [qxyz(2, 0, 0), qxyz(9, 2, 0), qxyz(12, 3, 0), qxyz(7, 1, 0), qxyz(2, 0, 0)]),
        ]

    # "rub hands" - both forearms come together in front
    return [
        curve("LeftUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 18, 0, -12), qxyz(SIGN_LIMB_FORWARD * 24, 0, -15),
               qxyz(SIGN_LIMB_FORWARD * 17, 0, -11), qxyz()]),
        curve("LeftLowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 52, 0, 14), qxyz(SIGN_LIMB_FORWARD * 60, 0, 18),
               qxyz(SIGN_LIMB_FORWARD * 50, 0, 13), qxyz()]),
        curve("RightUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 18, 0, 12), qxyz(SIGN_LIMB_FORWARD * 24, 0, 15),
               qxyz(SIGN_LIMB_FORWARD * 17, 0, 11), qxyz()]),
        curve("RightLowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 52, 0, -14), qxyz(SIGN_LIMB_FORWARD * 60, 0, -18),
               qxyz(SIGN_LIMB_FORWARD * 50, 0, -13), qxyz()]),
        curve("Head", "rotation", k, [qxyz(2, 0, 0), qxyz(8, -2, 0), qxyz(10, -3, 0), qxyz(6, -1, 0), qxyz(2, 0, 0)]),
        _breathing_spine(duration, 0.7),
    ]


def look(name: str, duration: float, yaw: float, pitch: float, *,
         hold: float = 0.4, chest_follow: float = 0.25, return_to=(2.0, -3.0)):
    """A gaze move: turn, hold, return. Used for glances, floor looks, checks."""
    rx, ry = return_to
    t_out = duration * 0.22
    t_hold_end = min(duration * 0.22 + hold, duration * 0.82)
    k = [0.0, t_out, t_hold_end, duration]
    return [
        curve("Head", "rotation", k,
              [qxyz(rx, ry, 0), qxyz(pitch, yaw, yaw * 0.03),
               qxyz(pitch, yaw, yaw * 0.03), qxyz(rx, ry, 0)]),
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(0, yaw * chest_follow, 0), qxyz(0, yaw * chest_follow, 0), qxyz()]),
        curve("Neck", "rotation", k,
              [qxyz(), qxyz(pitch * 0.3, yaw * 0.2, 0), qxyz(pitch * 0.3, yaw * 0.2, 0), qxyz()]),
    ]


def double_take(duration: float = 1.5):
    """Look away, then snap back - reads as 'wait, what was that'."""
    k = [0.0, 0.18, 0.42, 0.62, 0.95, duration]
    return [
        curve("Head", "rotation", k,
              [qxyz(2, -3, 0), qxyz(3, 20, 1), qxyz(4, 24, 1),
               qxyz(0, -14, -2), qxyz(1, -8, -1), qxyz(2, -4, 0)]),
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(0, 5, 0), qxyz(0, 6, 0), qxyz(0, -4, 0), qxyz(0, -2, 0), qxyz()]),
        curve("LeftUpperArm", "rotation", k,
              [qxyz(), qxyz(), qxyz(), qxyz(0, 0, -4), qxyz(0, 0, -2), qxyz()]),
    ]


def closed_posture(duration: float = 2.0):
    """Arms drawn in, shoulders forward, chin lowered. Defensive, not dramatic."""
    k = [0.0, duration * 0.3, duration * 0.72, duration]
    return [
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * -5, 0, 0), qxyz(SIGN_LEAN_BACK * -6, 0, 0), qxyz(SIGN_LEAN_BACK * -5, 0, 0)]),
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(9, -8, 0), qxyz(11, -10, 0), qxyz(10, -9, 0)]),
        curve("LeftUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 16, 0, -10), qxyz(SIGN_LIMB_FORWARD * 21, 0, -13),
               qxyz(SIGN_LIMB_FORWARD * 20, 0, -12)]),
        curve("LeftLowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 40, 0, 12), qxyz(SIGN_LIMB_FORWARD * 52, 0, 16),
               qxyz(SIGN_LIMB_FORWARD * 50, 0, 15)]),
        curve("RightUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 16, 0, 10), qxyz(SIGN_LIMB_FORWARD * 21, 0, 13),
               qxyz(SIGN_LIMB_FORWARD * 20, 0, 12)]),
        curve("RightLowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 40, 0, -12), qxyz(SIGN_LIMB_FORWARD * 52, 0, -16),
               qxyz(SIGN_LIMB_FORWARD * 50, 0, -15)]),
        _breathing_spine(duration, 1.3),
    ]


def step_back(hips, *, lead: str = "Left", speed: float = 1.0, distance: float = 0.30,
              startled: bool = False, stumble: bool = False):
    """A real backward step.

    Order matters: anticipate, unweight, swing the leg, transfer, plant, absorb,
    settle. Arms counter-swing. `stumble` adds an overshoot the body then has to
    catch, which is what sells a hard shove.
    """
    d = (1.0 / max(speed, 0.2))
    lead_sign = _sign(lead)
    trail = _mirror(lead)

    # phase times
    t_anticipate = 0.10 * d
    t_lift = 0.24 * d
    t_swing = 0.40 * d
    t_plant = 0.56 * d
    t_absorb = 0.72 * d
    t_settle = 1.00 * d if not stumble else 1.30 * d

    k = [0.0, t_anticipate, t_lift, t_swing, t_plant, t_absorb, t_settle]

    back = float(distance)
    overshoot = back * (1.35 if stumble else 1.06)

    # Root travel. Z is forward/back in glTF; +Z is backward for a -Z-forward rig.
    hp = np.asarray(hips, dtype=np.float32)
    root = [
        hp,
        hp + (0, 0.004, -0.010),                    # weight forward a touch first
        hp + (0, 0.012, back * 0.10),
        hp + (0, 0.020, back * 0.42),
        hp + (0, 0.006, overshoot),
        hp + (0, -0.014, back * 0.98),              # knee absorbs, hips dip
        hp + (0, 0.0, back),
    ]

    # Amplitudes are deliberately large. On a low-poly, rigidly-skinned character
    # a "realistic" 5 degree lean reads as no movement at all - the silhouette has
    # to change or the viewer sees a sliding prop.
    lean_peak = 17.0 if startled else 10.0
    torso = [
        qxyz(),
        qxyz(SIGN_LEAN_BACK * -2.0, 0, 0),          # anticipation: lean IN slightly
        qxyz(SIGN_LEAN_BACK * lean_peak * 0.5, 0, 0),
        qxyz(SIGN_LEAN_BACK * lean_peak, 0, -1.5 * lead_sign),
        qxyz(SIGN_LEAN_BACK * lean_peak * 0.8, 0, -1.0 * lead_sign),
        qxyz(SIGN_LEAN_BACK * (lean_peak * 0.3 + (5.0 if stumble else 0.0)), 0, 0),
        qxyz(SIGN_LEAN_BACK * 1.5, 0, 0),
    ]

    head = [
        qxyz(1, -2, 0),
        qxyz(0, -2, 0),
        qxyz(-2 if startled else 0, -3, 0),
        qxyz(-4 if startled else -2, -4, 0),
        qxyz(-2, -4, 0),
        qxyz(1, -3, 0),
        qxyz(2, -3, 0),
    ]

    # Lead leg swings back; trail leg supports then follows.
    # The knee flexion during swing is what lifts the foot clear of the floor -
    # without it the leg scissors through the ground and reads as a slide.
    lead_hip = [0, 2, 14, 30, -8, -4, 0]
    lead_knee = [0, -4, -38, -58, -14, -20, -3]
    trail_hip = [0, -4, -8, -16, 12, 6, 0]
    trail_knee = [0, -5, -10, -8, -26, -32, -5]

    # Contralateral arm swing, exaggerated when startled.
    amp = 48.0 if startled else 30.0
    lead_arm = [0, 2, -amp * 0.4, -amp, -amp * 0.55, -amp * 0.15, 0]
    trail_arm = [0, -2, amp * 0.45, amp * 1.05, amp * 0.6, amp * 0.18, 0]

    def limb(bone, values, scale=1.0, roll=0.0):
        return curve(bone, "rotation", k,
                     [qxyz(SIGN_LIMB_FORWARD * v * scale, 0, roll) for v in values])

    curves = [
        curve("Hips", "translation", k, root),
        curve("Chest", "rotation", k, torso),
        curve("Spine", "rotation", k, [qxyz(SIGN_LEAN_BACK * v * 0.35, 0, 0)
                                       for v in [0, -1, 3, 5, 4, 2, 1]]),
        curve("Head", "rotation", k, head),
        limb(f"{lead}UpperLeg", lead_hip),
        limb(f"{lead}LowerLeg", lead_knee),
        limb(f"{trail}UpperLeg", trail_hip),
        limb(f"{trail}LowerLeg", trail_knee),
        limb(f"{lead}Foot", [0, 0, -14, -22, 8, 4, 0]),
        limb(f"{trail}Foot", [0, 0, 6, 10, -12, -8, 0]),
        limb(f"{_mirror(lead)}UpperArm", lead_arm, roll=-3.0 * lead_sign),
        limb(f"{lead}UpperArm", trail_arm, roll=3.0 * lead_sign),
        limb(f"{_mirror(lead)}LowerArm", [v * 0.5 for v in lead_arm]),
        limb(f"{lead}LowerArm", [v * 0.45 for v in trail_arm]),
    ]
    return curves


def regain_balance(duration: float = 1.1):
    """The catch after a stumble - arms out, torso corrects, knees absorb."""
    k = [0.0, 0.16, 0.38, 0.66, duration]
    return [
        curve("Chest", "rotation", k,
              [qxyz(SIGN_LEAN_BACK * 9, 0, 0), qxyz(SIGN_LEAN_BACK * 4, 0, 2),
               qxyz(SIGN_LEAN_BACK * -3, 0, -1), qxyz(SIGN_LEAN_BACK * 1, 0, 0), qxyz()]),
        curve("Head", "rotation", k, [qxyz(-4, 0, 0), qxyz(0, -2, 0), qxyz(4, -3, 0), qxyz(2, -3, 0), qxyz(2, -3, 0)]),
        curve("LeftUpperArm", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -30, 0, -26), qxyz(SIGN_LIMB_FORWARD * -20, 0, -20),
               qxyz(SIGN_LIMB_FORWARD * -8, 0, -10), qxyz(SIGN_LIMB_FORWARD * -2, 0, -4), qxyz()]),
        curve("RightUpperArm", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -30, 0, 26), qxyz(SIGN_LIMB_FORWARD * -20, 0, 20),
               qxyz(SIGN_LIMB_FORWARD * -8, 0, 10), qxyz(SIGN_LIMB_FORWARD * -2, 0, 4), qxyz()]),
        curve("LeftLowerLeg", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -18, 0, 0), qxyz(SIGN_LIMB_FORWARD * -22, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -10, 0, 0), qxyz(SIGN_LIMB_FORWARD * -4, 0, 0), qxyz()]),
        curve("RightLowerLeg", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -14, 0, 0), qxyz(SIGN_LIMB_FORWARD * -20, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -9, 0, 0), qxyz(SIGN_LIMB_FORWARD * -3, 0, 0), qxyz()]),
    ]


def impact(side: str, strength: str = "light", duration: float = 0.85):
    """Reaction to being walked into. Impulse first, then the correction."""
    s = _sign(side)
    mag = {"light": 0.45, "medium": 1.0, "heavy": 1.7}[strength]
    k = [0.0, 0.08, 0.22, 0.45, duration]

    return [
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * 4 * mag, -6 * mag * s, 5 * mag * s),
               qxyz(SIGN_LEAN_BACK * 7 * mag, -8 * mag * s, 7 * mag * s),
               qxyz(SIGN_LEAN_BACK * 2 * mag, -3 * mag * s, 2 * mag * s), qxyz()]),
        curve("Spine", "rotation", k,
              [qxyz(), qxyz(0, -3 * mag * s, 3 * mag * s), qxyz(0, -4 * mag * s, 4 * mag * s),
               qxyz(0, -1 * mag * s, 1 * mag * s), qxyz()]),
        curve("Head", "rotation", k,
              [qxyz(2, -3, 0), qxyz(-3 * mag, -10 * mag * s, 4 * mag * s),
               qxyz(-1 * mag, 14 * s, 2 * mag * s),  # then looks AT the player
               qxyz(1, 10 * s, 0), qxyz(2, 8 * s, 0)]),
        # Struck shoulder gives, opposite arm flies out for balance.
        curve(f"{side}UpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 12 * mag, 0, -14 * mag * s),
               qxyz(SIGN_LIMB_FORWARD * 16 * mag, 0, -18 * mag * s),
               qxyz(SIGN_LIMB_FORWARD * 5 * mag, 0, -6 * mag * s), qxyz()]),
        curve(f"{_mirror(side)}UpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -10 * mag, 0, 16 * mag * s),
               qxyz(SIGN_LIMB_FORWARD * -14 * mag, 0, 22 * mag * s),
               qxyz(SIGN_LIMB_FORWARD * -4 * mag, 0, 8 * mag * s), qxyz()]),
        curve(f"{_mirror(side)}LowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -14 * mag, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -20 * mag, 0, 0), qxyz(SIGN_LIMB_FORWARD * -6 * mag, 0, 0), qxyz()]),
        # Legs brace.
        curve(f"{_mirror(side)}LowerLeg", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -8 * mag, 0, 0), qxyz(SIGN_LIMB_FORWARD * -12 * mag, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -5 * mag, 0, 0), qxyz()]),
    ]


def walk_cycle(hips, *, direction: str = "forward", speed: float = 1.0,
               cautious: bool = False, cycles: int = 1):
    """A two-step locomotion cycle, authored in place.

    In-place on purpose: the Godot locomotion controller drives world movement
    and matches its speed to the clip, which keeps the asset portable and avoids
    root-motion import differences between engines.
    """
    period = (1.30 if cautious else 1.00) / max(speed, 0.25)
    duration = period * cycles
    steps = 8 * cycles
    k = [duration * i / steps for i in range(steps + 1)]

    backward = direction == "backward"
    side_dir = 0.0
    if direction == "left":
        side_dir = 1.0
    elif direction == "right":
        side_dir = -1.0

    # Stride is capped to keep the foot lift in a human range. At 34 degrees the
    # measured lift was 0.37 m, which reads as marching; tests/measure_locomotion.py
    # reports the real figure so this stays honest rather than eyeballed.
    stride = (16.0 if cautious else 23.0) * (0.78 if backward else 1.0)
    arm_amp = (10.0 if cautious else 20.0) * (0.75 if backward else 1.0)
    bob = 0.020 if not cautious else 0.012

    hp = np.asarray(hips, dtype=np.float32)
    root, l_hip, r_hip, l_knee, r_knee, l_arm, r_arm, chest, head, l_foot, r_foot = ([] for _ in range(11))

    for i in range(steps + 1):
        phase = (i / 8.0) * 2.0 * math.pi
        swing = math.sin(phase)
        opposite = math.sin(phase + math.pi)
        lift = abs(math.sin(phase * 1.0))

        root.append(hp + (0, bob * abs(math.sin(phase * 2.0)) - bob * 0.5, 0))
        sgn = -1.0 if backward else 1.0
        l_hip.append(stride * swing * sgn)
        r_hip.append(stride * opposite * sgn)
        # Knees only bend one way.
        l_knee.append(-abs(stride * 0.9) * max(0.0, -swing * sgn) - 4.0 - 10.0 * lift * 0.3)
        r_knee.append(-abs(stride * 0.9) * max(0.0, -opposite * sgn) - 4.0 - 10.0 * (1 - lift) * 0.3)
        l_foot.append(-stride * 0.35 * swing * sgn)
        r_foot.append(-stride * 0.35 * opposite * sgn)
        l_arm.append(arm_amp * opposite * sgn)
        r_arm.append(arm_amp * swing * sgn)
        chest.append(qxyz(SIGN_LEAN_BACK * (4.0 if backward else -3.0) * (1.2 if cautious else 1.0),
                          -stride * 0.10 * swing * sgn, side_dir * 2.0))
        head.append(qxyz(2 + (3 if backward else 0), -3 + (side_dir * -6), 0))

    def limb(bone, values, roll=0.0):
        return curve(bone, "rotation", k, [qxyz(SIGN_LIMB_FORWARD * v, 0, roll) for v in values])

    curves = [
        curve("Hips", "translation", k, root),
        curve("Chest", "rotation", k, chest),
        curve("Head", "rotation", k, head),
        limb("LeftUpperLeg", l_hip),
        limb("RightUpperLeg", r_hip),
        limb("LeftLowerLeg", l_knee),
        limb("RightLowerLeg", r_knee),
        limb("LeftFoot", l_foot),
        limb("RightFoot", r_foot),
        limb("LeftUpperArm", l_arm, roll=-2.0),
        limb("RightUpperArm", r_arm, roll=2.0),
        limb("LeftLowerArm", [v * 0.45 - 6.0 for v in l_arm]),
        limb("RightLowerArm", [v * 0.45 - 6.0 for v in r_arm]),
    ]
    return curves


def side_step(hips, side: str, duration: float = 0.9):
    """Lateral weight transfer - used to circle away rather than only retreat."""
    s = _sign(side)
    k = [0.0, 0.14, 0.34, 0.56, duration]
    hp = np.asarray(hips, dtype=np.float32)
    lateral = 0.26 * s
    return [
        curve("Hips", "translation", k,
              [hp, hp + (lateral * 0.12, 0.008, 0), hp + (lateral * 0.55, 0.016, 0),
               hp + (lateral * 1.02, 0.004, 0), hp + (lateral, 0, 0)]),
        curve("Hips", "rotation", k, [qxyz(), qxyz(0, 0, -2 * s), qxyz(0, 0, -3 * s), qxyz(0, 0, 1 * s), qxyz()]),
        curve("Chest", "rotation", k, [qxyz(), qxyz(0, 0, 3 * s), qxyz(0, 0, 4 * s), qxyz(0, 0, -1 * s), qxyz()]),
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(2, -8 * s, 0), qxyz(2, -10 * s, 0), qxyz(2, -6 * s, 0), qxyz(2, -3, 0)]),
        curve(f"{side}UpperLeg", "rotation", k,
              [qxyz(), qxyz(0, 0, -10 * s), qxyz(0, 0, -16 * s), qxyz(0, 0, -6 * s), qxyz()]),
        curve(f"{_mirror(side)}UpperLeg", "rotation", k,
              [qxyz(), qxyz(0, 0, -3 * s), qxyz(0, 0, -6 * s), qxyz(0, 0, -12 * s), qxyz()]),
        curve(f"{_mirror(side)}LowerLeg", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -6, 0, 0), qxyz(SIGN_LIMB_FORWARD * -12, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -6, 0, 0), qxyz()]),
        curve(f"{side}UpperArm", "rotation", k,
              [qxyz(), qxyz(0, 0, -8 * s), qxyz(0, 0, -12 * s), qxyz(0, 0, -5 * s), qxyz()]),
    ]


def turn_in_place(degrees: float, duration: float = 1.0):
    """Pivot. The head leads the turn, as it does in life."""
    k = [0.0, duration * 0.16, duration * 0.5, duration * 0.82, duration]
    return [
        curve("Hips", "rotation", k,
              [qxyz(), qxyz(0, degrees * 0.08, 0), qxyz(0, degrees * 0.55, 0),
               qxyz(0, degrees * 0.92, 0), qxyz(0, degrees, 0)]),
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(0, degrees * 0.22, 0), qxyz(0, degrees * 0.18, 0), qxyz(0, degrees * 0.05, 0), qxyz()]),
        curve("Head", "rotation", k,
              [qxyz(2, -3, 0), qxyz(2, degrees * 0.30, 0), qxyz(2, degrees * 0.16, 0), qxyz(2, 0, 0), qxyz(2, -3, 0)]),
        curve("LeftUpperLeg", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 6, 0, 0), qxyz(SIGN_LIMB_FORWARD * 10, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * 4, 0, 0), qxyz()]),
        curve("RightUpperLeg", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * -4, 0, 0), qxyz(SIGN_LIMB_FORWARD * -8, 0, 0),
               qxyz(SIGN_LIMB_FORWARD * -3, 0, 0), qxyz()]),
    ]


def stop_and_look_back(duration: float = 1.6):
    """Plant, settle, then check over the shoulder. The 'did you follow me' beat."""
    k = [0.0, 0.20, 0.46, 0.80, 1.20, duration]
    return [
        curve("Chest", "rotation", k,
              [qxyz(SIGN_LEAN_BACK * -3, 0, 0), qxyz(SIGN_LEAN_BACK * 2, 0, 0), qxyz(0, 12, 0),
               qxyz(0, 22, 0), qxyz(0, 18, 0), qxyz(0, 6, 0)]),
        curve("Head", "rotation", k,
              [qxyz(2, 0, 0), qxyz(2, 8, 0), qxyz(1, 30, 1), qxyz(0, 42, 2), qxyz(0, 38, 2), qxyz(2, 14, 0)]),
        curve("LeftUpperLeg", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * 8, 0, 0), qxyz(SIGN_LIMB_FORWARD * 2, 0, 0), qxyz(), qxyz(), qxyz(), qxyz()]),
        curve("RightUpperLeg", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -6, 0, 0), qxyz(SIGN_LIMB_FORWARD * -1, 0, 0), qxyz(), qxyz(), qxyz(), qxyz()]),
        curve("LeftUpperArm", "rotation", k,
              [qxyz(SIGN_LIMB_FORWARD * -8, 0, 0), qxyz(SIGN_LIMB_FORWARD * -2, 0, 0),
               qxyz(0, 0, -4), qxyz(0, 0, -6), qxyz(0, 0, -5), qxyz()]),
        _breathing_spine(duration, 1.2),
    ]


def hand_up_boundary(duration: float = 1.5):
    """Palm raised. A boundary signal, not aggression."""
    k = [0.0, 0.18, 0.42, 0.95, duration]
    return [
        curve("RightUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 28, 0, 12), qxyz(SIGN_LIMB_FORWARD * 52, 0, 18),
               qxyz(SIGN_LIMB_FORWARD * 50, 0, 17), qxyz(SIGN_LIMB_FORWARD * 10, 0, 4)]),
        curve("RightLowerArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 30, 0, -8), qxyz(SIGN_LIMB_FORWARD * 46, 0, -12),
               qxyz(SIGN_LIMB_FORWARD * 44, 0, -11), qxyz(SIGN_LIMB_FORWARD * 8, 0, -2)]),
        curve("RightHand", "rotation", k,
              [qxyz(), qxyz(-14, 0, 0), qxyz(-26, 0, 0), qxyz(-26, 0, 0), qxyz(-4, 0, 0)]),
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * 3, 0, 0), qxyz(SIGN_LEAN_BACK * 5, -4, 0),
               qxyz(SIGN_LEAN_BACK * 5, -4, 0), qxyz(SIGN_LEAN_BACK * 1, 0, 0)]),
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(0, 0, 0), qxyz(-1, 2, 0), qxyz(-1, 2, 0), qxyz(2, -2, 0)]),
    ]


# Verified arm poses (tests/check_sign_conventions.py, front view).
# Z+ abducts the arm outward, LowerArm X+ flexes the elbow. Reaching the ear
# needs BOTH: abduction to lift the elbow, then strong flexion to bring the hand
# up beside the head. Forward-only flexion just holds the hand at the chest.
_PHONE_HOLD = {"upper": (30.0, 0.0, 16.0), "lower": (88.0, 0.0, -6.0)}   # reading it
_PHONE_EAR = {"upper": (28.0, 0.0, 62.0), "lower": (128.0, 0.0, 0.0)}    # to the ear


def _arm(pose_dict, blend: float = 1.0):
    """Interpolate an arm pose from rest, so stages can share endpoints."""
    ux, uy, uz = pose_dict["upper"]
    lx, ly, lz = pose_dict["lower"]
    return (qxyz(ux * blend, uy * blend, uz * blend),
            qxyz(lx * blend, ly * blend, lz * blend))


def phone_pose(stage: str, duration: float):
    """Phone handling. RIGHT hand carries the prop, so it leads every stage."""
    k4 = [0.0, duration * 0.25, duration * 0.6, duration]
    hold_u, hold_l = _arm(_PHONE_HOLD)
    ear_u, ear_l = _arm(_PHONE_EAR)

    if stage == "notice":
        # Hears/feels it, glances toward the pocket.
        return [
            curve("Head", "rotation", k4, [qxyz(2, -3, 0), qxyz(10, 8, 0), qxyz(14, 10, 0), qxyz(8, 6, 0)]),
            curve("Chest", "rotation", k4, [qxyz(), qxyz(0, 3, 0), qxyz(0, 4, 0), qxyz(0, 2, 0)]),
            curve("RightUpperArm", "rotation", k4,
                  [qxyz(), qxyz(SIGN_LIMB_FORWARD * 6, 0, 3), qxyz(SIGN_LIMB_FORWARD * 10, 0, 5),
                   qxyz(SIGN_LIMB_FORWARD * 8, 0, 4)]),
        ]

    if stage == "pull_out":
        return [
            curve("RightUpperArm", "rotation", k4,
                  [qxyz(), _arm(_PHONE_HOLD, 0.30)[0], _arm(_PHONE_HOLD, 0.80)[0], hold_u]),
            curve("RightLowerArm", "rotation", k4,
                  [qxyz(), _arm(_PHONE_HOLD, 0.30)[1], _arm(_PHONE_HOLD, 0.80)[1], hold_l]),
            curve("Head", "rotation", k4, [qxyz(8, 6, 0), qxyz(12, 5, 0), qxyz(16, 2, 0), qxyz(18, 0, 0)]),
            curve("Chest", "rotation", k4, [qxyz(0, 2, 0), qxyz(SIGN_LEAN_BACK * -2, 1, 0),
                                            qxyz(SIGN_LEAN_BACK * -4, 0, 0), qxyz(SIGN_LEAN_BACK * -5, 0, 0)]),
        ]

    if stage in ("look_at", "scroll"):
        scroll = stage == "scroll"
        k = [0.0, duration * 0.2, duration * 0.45, duration * 0.7, duration]
        thumb = [0, -6, -2, -7, 0] if scroll else [0, -1, 0, -1, 0]
        return [
            curve("RightUpperArm", "rotation", k, [hold_u] * 5),
            curve("RightLowerArm", "rotation", k,
                  [qxyz(_PHONE_HOLD["lower"][0] + v, 0, _PHONE_HOLD["lower"][2]) for v in thumb]),
            curve("RightHand", "rotation", k, [qxyz(0, 0, v * 1.5) for v in thumb]),
            curve("Head", "rotation", k,
                  [qxyz(18, 0, 0), qxyz(19, 1, 0), qxyz(18, -1, 0), qxyz(19, 1, 0), qxyz(18, 0, 0)]),
            curve("Chest", "rotation", k, [qxyz(SIGN_LEAN_BACK * -5, 0, 0)] * 5),
            _breathing_spine(duration, 0.6),
        ]

    if stage == "raise_to_ear":
        return [
            curve("RightUpperArm", "rotation", k4,
                  [hold_u, _arm({"upper": (29, 0, 34), "lower": (0, 0, 0)})[0],
                   _arm({"upper": (28, 0, 55), "lower": (0, 0, 0)})[0], ear_u]),
            curve("RightLowerArm", "rotation", k4,
                  [hold_l, _arm({"upper": (0, 0, 0), "lower": (104, 0, -4)})[1],
                   _arm({"upper": (0, 0, 0), "lower": (122, 0, -1)})[1], ear_l]),
            curve("Head", "rotation", k4, [qxyz(18, 0, 0), qxyz(10, -4, -3), qxyz(4, -6, -5), qxyz(3, -6, -6)]),
            curve("Chest", "rotation", k4, [qxyz(SIGN_LEAN_BACK * -5, 0, 0), qxyz(SIGN_LEAN_BACK * -3, -2, 0),
                                            qxyz(SIGN_LEAN_BACK * -1, -3, 0), qxyz(0, -3, 0)]),
        ]

    if stage in ("talk_idle", "listen_idle"):
        talking = stage == "talk_idle"
        k = [0.0, duration * 0.22, duration * 0.48, duration * 0.74, duration]
        # Free hand gestures when talking, hangs when listening.
        free = [0, -10, -4, -12, 0] if talking else [0, -2, -1, -2, 0]
        return [
            curve("RightUpperArm", "rotation", k, [ear_u] * 5),
            curve("RightLowerArm", "rotation", k, [ear_l] * 5),
            curve("LeftUpperArm", "rotation", k,
                  [qxyz(SIGN_LIMB_FORWARD * abs(v) * 1.2, 0, -abs(v) * 0.4) for v in free]),
            curve("LeftLowerArm", "rotation", k,
                  [qxyz(SIGN_LIMB_FORWARD * abs(v) * 2.4, 0, 0) for v in free]),
            curve("Head", "rotation", k,
                  [qxyz(3, -6, -6), qxyz(5, -2, -5), qxyz(2, -9, -6), qxyz(6, -4, -5), qxyz(3, -6, -6)]),
            curve("Chest", "rotation", k,
                  [qxyz(0, -3, 0), qxyz(0, -1, 0), qxyz(0, -5, 0), qxyz(0, -2, 0), qxyz(0, -3, 0)]),
            _breathing_spine(duration, 0.9),
        ]

    if stage == "lower_slightly":
        # Keeps the call but drops the phone to attend to the player.
        return [
            curve("RightUpperArm", "rotation", k4,
                  [ear_u, _arm(_PHONE_EAR, 0.86)[0], _arm(_PHONE_EAR, 0.74)[0], _arm(_PHONE_EAR, 0.74)[0]]),
            curve("RightLowerArm", "rotation", k4,
                  [ear_l, _arm(_PHONE_EAR, 0.86)[1], _arm(_PHONE_EAR, 0.74)[1], _arm(_PHONE_EAR, 0.74)[1]]),
            curve("Head", "rotation", k4, [qxyz(3, -6, -6), qxyz(2, -2, -3), qxyz(1, 2, -1), qxyz(1, 3, 0)]),
            curve("Chest", "rotation", k4, [qxyz(0, -3, 0), qxyz(0, -1, 0), qxyz(0, 1, 0), qxyz(0, 2, 0)]),
        ]

    if stage == "end_call":
        return [
            curve("RightUpperArm", "rotation", k4,
                  [ear_u, _arm(_PHONE_EAR, 0.55)[0], hold_u, hold_u]),
            curve("RightLowerArm", "rotation", k4,
                  [ear_l, _arm(_PHONE_EAR, 0.55)[1], hold_l, hold_l]),
            curve("RightHand", "rotation", k4, [qxyz(), qxyz(0, 0, -6), qxyz(0, 0, -10), qxyz()]),
            curve("Head", "rotation", k4, [qxyz(3, -6, -6), qxyz(12, -2, -2), qxyz(17, 0, 0), qxyz(18, 0, 0)]),
        ]

    # put_away
    return [
        curve("RightUpperArm", "rotation", k4,
              [hold_u, _arm(_PHONE_HOLD, 0.62)[0], _arm(_PHONE_HOLD, 0.18)[0], qxyz()]),
        curve("RightLowerArm", "rotation", k4,
              [hold_l, _arm(_PHONE_HOLD, 0.62)[1], _arm(_PHONE_HOLD, 0.18)[1], qxyz()]),
        curve("Head", "rotation", k4, [qxyz(18, 0, 0), qxyz(12, 2, 0), qxyz(5, -1, 0), qxyz(2, -3, 0)]),
        curve("Chest", "rotation", k4,
              [qxyz(SIGN_LEAN_BACK * -5, 0, 0), qxyz(SIGN_LEAN_BACK * -3, 0, 0), qxyz(SIGN_LEAN_BACK * -1, 0, 0), qxyz()]),
    ]


def deep_breath(duration: float = 2.4):
    """A composure reset, used during RECOVERING."""
    k = [0.0, duration * 0.32, duration * 0.52, duration * 0.85, duration]
    return [
        curve("Spine", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * -2.6, 0, 0), qxyz(SIGN_LEAN_BACK * -3.0, 0, 0),
               qxyz(SIGN_LEAN_BACK * 0.8, 0, 0), qxyz()]),
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * -3.5, 0, 0), qxyz(SIGN_LEAN_BACK * -4.0, 0, 0),
               qxyz(SIGN_LEAN_BACK * 1.2, 0, 0), qxyz()]),
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(-3, -1, 0), qxyz(-4, 0, 0), qxyz(6, -2, 0), qxyz(2, -3, 0)]),
        curve("LeftUpperArm", "rotation", k, [qxyz(), qxyz(0, 0, -3.5), qxyz(0, 0, -4), qxyz(0, 0, 1), qxyz()]),
        curve("RightUpperArm", "rotation", k, [qxyz(), qxyz(0, 0, 3.5), qxyz(0, 0, 4), qxyz(0, 0, -1), qxyz()]),
    ]


def annoyed(duration: float = 1.4):
    """Irritation rather than fear - squarer shoulders, sharper head turn."""
    k = [0.0, 0.22, 0.55, 0.95, duration]
    return [
        curve("Chest", "rotation", k,
              [qxyz(), qxyz(SIGN_LEAN_BACK * -2, -6, 0), qxyz(SIGN_LEAN_BACK * -3, -9, 0),
               qxyz(SIGN_LEAN_BACK * -2, -7, 0), qxyz()]),
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(-2, -12, -2), qxyz(-3, -16, -3), qxyz(-2, -12, -2), qxyz(2, -4, 0)]),
        curve("LeftUpperArm", "rotation", k, [qxyz(), qxyz(0, 0, -7), qxyz(0, 0, -9), qxyz(0, 0, -7), qxyz()]),
        curve("RightUpperArm", "rotation", k, [qxyz(), qxyz(0, 0, 7), qxyz(0, 0, 9), qxyz(0, 0, 7), qxyz()]),
        _breathing_spine(duration, 1.4),
    ]


def confused(duration: float = 1.5):
    k = [0.0, 0.25, 0.60, 1.05, duration]
    return [
        curve("Head", "rotation", k, [qxyz(2, -3, 0), qxyz(4, 6, -7), qxyz(6, 9, -10), qxyz(4, 4, -6), qxyz(2, -3, 0)]),
        curve("Chest", "rotation", k, [qxyz(), qxyz(0, 3, 0), qxyz(0, 4, 0), qxyz(0, 2, 0), qxyz()]),
        curve("LeftUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 10, 0, -14), qxyz(SIGN_LIMB_FORWARD * 14, 0, -19),
               qxyz(SIGN_LIMB_FORWARD * 8, 0, -12), qxyz()]),
        curve("RightUpperArm", "rotation", k,
              [qxyz(), qxyz(SIGN_LIMB_FORWARD * 10, 0, 14), qxyz(SIGN_LIMB_FORWARD * 14, 0, 19),
               qxyz(SIGN_LIMB_FORWARD * 8, 0, 12), qxyz()]),
    ]


# =============================================================================
# Library
# =============================================================================


def build_library(hips_position, legacy_clips=None):
    """Return {clip_name: curves}. Legacy clips are preserved verbatim."""
    hp = np.asarray(hips_position, dtype=np.float32)
    clips: dict[str, list] = {}

    # --- idle / ambient ------------------------------------------------------
    clips["IDLE_NEUTRAL_A"] = idle("IDLE_NEUTRAL_A", 3.6, nervous=0.0, sway=1.0, lead="Left")
    clips["IDLE_NEUTRAL_B"] = idle("IDLE_NEUTRAL_B", 4.2, nervous=0.05, sway=0.8,
                                   head_drift=(1.0, 4.0), lead="Right")
    clips["IDLE_NERVOUS_A"] = idle("IDLE_NERVOUS_A", 2.8, nervous=0.75, sway=1.25)
    clips["IDLE_NERVOUS_B"] = idle("IDLE_NERVOUS_B", 2.4, nervous=1.0, sway=1.4,
                                   head_drift=(3.0, -6.0), lead="Right")
    clips["WEIGHT_SHIFT_LEFT"] = weight_shift("Left")
    clips["WEIGHT_SHIFT_RIGHT"] = weight_shift("Right")
    clips["ADJUST_SLEEVE"] = hand_fidget("ADJUST_SLEEVE", 2.2, "sleeve")
    clips["RUB_HANDS"] = hand_fidget("RUB_HANDS", 2.0, "hands")
    clips["TOUCH_FACE"] = hand_fidget("TOUCH_FACE", 1.9, "face")
    clips["SCRATCH_NECK"] = hand_fidget("SCRATCH_NECK", 2.1, "neck")
    clips["LOOK_AT_FLOOR"] = look("LOOK_AT_FLOOR", 2.2, yaw=-6.0, pitch=22.0, hold=1.0, chest_follow=0.1)
    clips["LOOK_AROUND"] = look("LOOK_AROUND", 3.0, yaw=34.0, pitch=-2.0, hold=0.7, chest_follow=0.3)
    clips["CHECK_BEHIND"] = look("CHECK_BEHIND", 2.4, yaw=-58.0, pitch=0.0, hold=0.5, chest_follow=0.45)
    clips["DEEP_BREATH"] = deep_breath()

    # --- player attention ----------------------------------------------------
    clips["NOTICE_PLAYER"] = look("NOTICE_PLAYER", 1.1, yaw=-14.0, pitch=-3.0, hold=0.35, chest_follow=0.18)
    clips["QUICK_GLANCE"] = look("QUICK_GLANCE", 0.75, yaw=-18.0, pitch=-1.0, hold=0.12, chest_follow=0.08)
    clips["LONG_GLANCE"] = look("LONG_GLANCE", 2.1, yaw=-16.0, pitch=-2.0, hold=1.1, chest_follow=0.15)
    clips["BREAK_EYE_CONTACT"] = look("BREAK_EYE_CONTACT", 1.7, yaw=30.0, pitch=8.0, hold=0.75, chest_follow=0.22)
    clips["DOUBLE_TAKE"] = double_take()
    clips["LOOK_BACK_AT_PLAYER"] = look("LOOK_BACK_AT_PLAYER", 1.5, yaw=-20.0, pitch=-4.0, hold=0.6, chest_follow=0.3)
    clips["TURN_TOWARD_PLAYER_PARTIAL"] = turn_in_place(-34.0, 1.1)
    clips["TURN_AWAY_FROM_PLAYER"] = turn_in_place(52.0, 1.2)
    clips["CLOSED_POSTURE"] = closed_posture()

    # --- personal space / movement ------------------------------------------
    clips["STEP_BACK_SMALL"] = step_back(hp, lead="Left", speed=1.0, distance=0.26)
    clips["STEP_BACK_FAST"] = step_back(hp, lead="Right", speed=1.55, distance=0.34)
    clips["STEP_BACK_STARTLED"] = step_back(hp, lead="Left", speed=1.9, distance=0.38, startled=True)
    clips["BACKPEDAL_SHORT"] = walk_cycle(hp, direction="backward", speed=1.1, cycles=1)
    clips["SIDE_STEP_LEFT"] = side_step(hp, "Left")
    clips["SIDE_STEP_RIGHT"] = side_step(hp, "Right")
    clips["TURN_AND_WALK_AWAY"] = turn_in_place(118.0, 1.25)
    clips["WALK_AWAY_NERVOUS"] = walk_cycle(hp, direction="forward", speed=1.15, cautious=True, cycles=1)
    clips["STOP_AND_LOOK_BACK"] = stop_and_look_back()

    # --- locomotion ----------------------------------------------------------
    clips["WALK_FORWARD"] = walk_cycle(hp, direction="forward", speed=1.0, cycles=1)
    clips["WALK_BACKWARD"] = walk_cycle(hp, direction="backward", speed=0.85, cautious=True, cycles=1)
    clips["TURN_LEFT"] = turn_in_place(-46.0, 1.0)
    clips["TURN_RIGHT"] = turn_in_place(46.0, 1.0)

    # --- contact / impact ----------------------------------------------------
    clips["BUMP_RECOIL_LIGHT"] = impact("Left", "light")
    clips["BUMP_RECOIL_MEDIUM"] = impact("Left", "medium")
    clips["SHOULDER_IMPACT_LEFT"] = impact("Left", "medium", duration=0.95)
    clips["SHOULDER_IMPACT_RIGHT"] = impact("Right", "medium", duration=0.95)
    clips["STUMBLE_BACK"] = step_back(hp, lead="Right", speed=1.7, distance=0.46,
                                      startled=True, stumble=True)
    clips["REGAIN_BALANCE"] = regain_balance()

    # --- warning / social ----------------------------------------------------
    clips["HAND_UP_BOUNDARY"] = hand_up_boundary()
    clips["CONFUSED_REACTION"] = confused()
    clips["ANNOYED_REACTION"] = annoyed()

    # --- phone ---------------------------------------------------------------
    clips["PHONE_NOTICE"] = phone_pose("notice", 1.0)
    clips["PHONE_PULL_OUT"] = phone_pose("pull_out", 1.1)
    clips["PHONE_LOOK_AT"] = phone_pose("look_at", 2.4)
    clips["PHONE_SCROLL"] = phone_pose("scroll", 2.6)
    clips["PHONE_RAISE_TO_EAR"] = phone_pose("raise_to_ear", 0.95)
    clips["PHONE_TALK_IDLE"] = phone_pose("talk_idle", 3.0)
    clips["PHONE_LISTEN_IDLE"] = phone_pose("listen_idle", 3.2)
    clips["PHONE_LOWER_SLIGHTLY"] = phone_pose("lower_slightly", 0.7)
    clips["PHONE_END_CALL"] = phone_pose("end_call", 0.9)
    clips["PHONE_PUT_AWAY"] = phone_pose("put_away", 1.1)

    # --- preserved originals -------------------------------------------------
    # The behaviour system still references these names; keeping them means the
    # existing perception/presence layers need no changes to keep working.
    if legacy_clips:
        for name, curves in legacy_clips.items():
            clips[name] = curves

    return clips


# Which clips are safe to loop, for the importer and the Godot animator.
LOOPING = {
    "IDLE_NEUTRAL_A", "IDLE_NEUTRAL_B", "IDLE_NERVOUS_A", "IDLE_NERVOUS_B",
    "NERVOUS_IDLE", "WALK_FORWARD", "WALK_BACKWARD", "BACKPEDAL_SHORT",
    "WALK_AWAY_NERVOUS", "PHONE_LOOK_AT", "PHONE_SCROLL", "PHONE_TALK_IDLE",
    "PHONE_LISTEN_IDLE", "CLOSED_POSTURE",
}

# Clips that carry meaningful root translation, so the locomotion controller
# knows which ones it must match world movement to.
ROOT_MOTION = {
    "STEP_BACK_SMALL": 0.26, "STEP_BACK_FAST": 0.34, "STEP_BACK_STARTLED": 0.38,
    "STUMBLE_BACK": 0.46, "SIDE_STEP_LEFT": 0.26, "SIDE_STEP_RIGHT": 0.26,
}
