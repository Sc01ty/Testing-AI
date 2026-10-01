"""Determine the rig's rotation sign conventions empirically.

Renders isolated single-bone poses from a fixed side view so the direction of a
positive rotation can be read off rather than assumed. Run once; the answer is
baked into elliot_animations.SIGN_* constants.
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_elliot_model import build_parts  # noqa: E402
from elliot_animations import curve, qxyz  # noqa: E402
from rig_elliot import OUT, posed_parts, render_parts  # noqa: E402


def pose(bone: str, x=0.0, y=0.0, z=0.0):
    return [curve(bone, "rotation", [0.0, 1.0], [qxyz(x, y, z), qxyz(x, y, z)])]


CASES = [
    ("REST", []),
    ("Chest X +20", pose("Chest", x=+20)),
    ("Chest X -20", pose("Chest", x=-20)),
    ("R UpperArm X +40", pose("RightUpperArm", x=+40)),
    ("R UpperArm X -40", pose("RightUpperArm", x=-40)),
    ("R UpperLeg X +30", pose("RightUpperLeg", x=+30)),
    ("R LowerLeg X -40", pose("RightLowerLeg", x=-40)),
]

# Roll / abduction axis, needed to get a hand up to the ear. Rendered from the
# front, where sideways arm movement is unambiguous.
ROLL_CASES = [
    ("REST", []),
    ("R UpperArm Z +50", pose("RightUpperArm", z=+50)),
    ("R UpperArm Z -50", pose("RightUpperArm", z=-50)),
    ("R LowerArm X +100", pose("RightLowerArm", x=+100)),
    ("R LowerArm X -100", pose("RightLowerArm", x=-100)),
    ("ear D  20/0/70 +120", pose("RightUpperArm", x=20, z=+70) + pose("RightLowerArm", x=+120)),
    ("ear E  20/-35/60 +120", pose("RightUpperArm", x=20, y=-35, z=+60) + pose("RightLowerArm", x=+120)),
    ("ear F  35/0/55 +130", pose("RightUpperArm", x=35, z=+55) + pose("RightLowerArm", x=+130)),
    ("ear G  10/-55/72 +125", pose("RightUpperArm", x=10, y=-55, z=+72) + pose("RightLowerArm", x=+125)),
]


def main() -> None:
    parts = build_parts()
    # azim=0 looks along +Y, i.e. straight at the character's side, so forward
    # and backward are unambiguous.
    fig = plt.figure(figsize=(len(CASES) * 2.6, 6.4), facecolor="#111416")
    for i, (label, curves) in enumerate(CASES, 1):
        ax = fig.add_subplot(1, len(CASES), i, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        render_parts(ax, posed_parts(parts, curves, 0.5) if curves else parts, elev=4, azim=0)
        ax.text2D(.5, .02, label, transform=ax.transAxes, ha="center",
                  color="#9fb4bd", fontsize=9, fontweight="bold")
    fig.suptitle("SIGN CHECK  —  side view, character faces LEFT (-Y is forward in this view)",
                 color="#f1f5f6", fontsize=13, fontweight="bold", y=.97)
    out = OUT / "sign_check.png"
    plt.subplots_adjust(left=.004, right=.996, top=.9, bottom=.02, wspace=0)
    fig.savefig(out, dpi=115, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"wrote {out}")

    # Front view for the roll axis and the hand-to-ear candidates.
    fig = plt.figure(figsize=(len(ROLL_CASES) * 2.6, 6.4), facecolor="#111416")
    for i, (label, curves) in enumerate(ROLL_CASES, 1):
        ax = fig.add_subplot(1, len(ROLL_CASES), i, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        render_parts(ax, posed_parts(parts, curves, 0.5) if curves else parts, elev=4, azim=-90)
        ax.text2D(.5, .02, label, transform=ax.transAxes, ha="center",
                  color="#9fb4bd", fontsize=9, fontweight="bold")
    fig.suptitle("ROLL / HAND-TO-EAR CHECK  —  front view (his right is screen LEFT)",
                 color="#f1f5f6", fontsize=13, fontweight="bold", y=.97)
    out2 = OUT / "sign_check_roll.png"
    plt.subplots_adjust(left=.004, right=.996, top=.9, bottom=.02, wspace=0)
    fig.savefig(out2, dpi=115, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"wrote {out2}")


if __name__ == "__main__":
    main()
