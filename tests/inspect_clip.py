"""Numeric inspection of a clip's actual motion.

Renders are easy to misjudge at small scale, so this reports the real angular
range per bone and how far the skinned feet/hands actually travel.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_elliot_model import build_parts  # noqa: E402
from rig_elliot import animation_clips, posed_parts  # noqa: E402


def quat_angle_deg(q) -> float:
    w = min(1.0, abs(float(q[3])))
    return 2.0 * np.degrees(np.arccos(w))


def inspect(clip_name: str) -> None:
    clips = animation_clips()
    if clip_name not in clips:
        print(f"unknown clip {clip_name}")
        return
    curves = clips[clip_name]
    duration = max(float(c["times"][-1]) for c in curves)
    print(f"=== {clip_name}  ({duration:.2f}s, {len(curves)} curves) ===")

    for c in sorted(curves, key=lambda c: c["node"]):
        if c["path"] == "rotation":
            angles = [quat_angle_deg(v) for v in c["values"]]
            print(f"  {c['node']:<16} rotation   peak {max(angles):6.1f} deg")
        else:
            span = np.ptp(c["values"], axis=0)
            print(f"  {c['node']:<16} {c['path']:<10} span x={span[0]:+.3f} y={span[1]:+.3f} z={span[2]:+.3f}")

    parts = build_parts()
    names = {p.name for p in parts}
    track = [n for n in ("shoe_L", "shoe_R", "hand_L", "hand_R", "head") if n in names]
    print(f"\n  skinned travel (world metres), tracking {track}:")
    baseline = {}
    for t in np.linspace(0, duration, 6):
        posed = {p.name: p for p in posed_parts(parts, curves, float(t))}
        row = []
        for n in track:
            centre = posed[n].vertices.mean(axis=0)
            if t == 0:
                baseline[n] = centre
            delta = centre - baseline[n]
            row.append(f"{n}=({delta[0]:+.3f},{delta[1]:+.3f},{delta[2]:+.3f})")
        print(f"    t={t:.2f}  " + "  ".join(row))


if __name__ == "__main__":
    for name in (sys.argv[1:] or ["STEP_BACK_SMALL"]):
        inspect(name)
        print()
