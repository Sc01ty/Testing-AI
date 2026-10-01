"""Derive ground speed from the authored walk cycles.

Foot sliding happens when world movement and the animation disagree. Rather than
guessing a speed and tuning it by eye, this measures how far the *planted* foot
travels backward relative to the root over one cycle. That distance divided by
the cycle duration is the speed at which the clip will not slide.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_elliot_model import build_parts  # noqa: E402
from rig_elliot import animation_clips, posed_parts  # noqa: E402

# Clips whose world speed the locomotion controller has to match.
LOCOMOTION_CLIPS = [
    "WALK_FORWARD", "WALK_BACKWARD", "BACKPEDAL_SHORT", "WALK_AWAY_NERVOUS",
]

SAMPLES = 48


def measure(clip_name: str, parts) -> dict:
    curves = animation_clips()[clip_name]
    duration = max(float(c["times"][-1]) for c in curves)

    # posed_parts returns Z-up world coords: X lateral, Y forward/back, Z up.
    feet_y = {"shoe_L": [], "shoe_R": []}
    feet_z = {"shoe_L": [], "shoe_R": []}
    for i in range(SAMPLES + 1):
        t = duration * i / SAMPLES
        posed = {p.name: p for p in posed_parts(parts, curves, float(t))}
        for foot in feet_y:
            centre = posed[foot].vertices.mean(axis=0)
            feet_y[foot].append(centre[1])   # forward/back
            feet_z[foot].append(centre[2])   # height

    travel = 0.0
    for i in range(SAMPLES):
        # The planted foot is the lower one; it is the one carrying the body.
        lower = "shoe_L" if feet_z["shoe_L"][i] <= feet_z["shoe_R"][i] else "shoe_R"
        travel += abs(feet_y[lower][i + 1] - feet_y[lower][i])

    speed = travel / duration if duration > 0 else 0.0
    lift = max(max(feet_z["shoe_L"]) - min(feet_z["shoe_L"]),
               max(feet_z["shoe_R"]) - min(feet_z["shoe_R"]))
    return {"duration": round(duration, 3),
            "distance_per_cycle_m": round(travel, 4),
            "speed_mps": round(speed, 4),
            "foot_lift_m": round(lift, 4)}


def main() -> dict:
    parts = build_parts()
    results = {}
    print(f"{'CLIP':<22}{'DUR':>7}{'DIST/CYCLE':>13}{'SPEED m/s':>12}{'FOOT LIFT':>12}")
    for clip_name in LOCOMOTION_CLIPS:
        data = measure(clip_name, parts)
        results[clip_name] = data
        print(f"{clip_name:<22}{data['duration']:>7.2f}{data['distance_per_cycle_m']:>13.3f}"
              f"{data['speed_mps']:>12.3f}{data['foot_lift_m']:>12.3f}")
    return results


if __name__ == "__main__":
    main()
