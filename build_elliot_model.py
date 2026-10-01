"""Build Elliot, the first NPC Package character, as an engine-neutral OBJ.

The model is deliberately dependency-light: NumPy and Matplotlib are used only
for geometry generation and preview rendering. Godot, Unity, Blender, and most
DCC tools can import the generated OBJ/MTL pair directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math

import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "Characters" / "Elliot" / "Model"


MATERIALS = {
    "skin": (0.72, 0.52, 0.40),
    "skin_shadow": (0.57, 0.37, 0.27),
    "hair": (0.055, 0.040, 0.032),
    "hoodie": (0.18, 0.22, 0.24),
    "hoodie_dark": (0.105, 0.13, 0.15),
    "shirt": (0.42, 0.33, 0.26),
    "trousers": (0.085, 0.10, 0.12),
    "shoes": (0.035, 0.04, 0.045),
    "sole": (0.13, 0.14, 0.14),
    "eye_white": (0.84, 0.82, 0.76),
    "iris": (0.19, 0.28, 0.25),
    "pupil": (0.015, 0.012, 0.010),
    "lip": (0.38, 0.19, 0.17),
}


@dataclass
class Part:
    name: str
    material: str
    vertices: np.ndarray
    faces: list[tuple[int, int, int]]


def ellipsoid(name, material, center, radii, rings=12, segments=18, squash=None):
    """UV ellipsoid with optional per-angle shaping for less toy-like forms."""
    cx, cy, cz = center
    rx, ry, rz = radii
    verts = []
    for i in range(rings + 1):
        phi = math.pi * i / rings
        for j in range(segments):
            theta = 2 * math.pi * j / segments
            s = math.sin(phi)
            shape = 1.0 if squash is None else squash(phi, theta)
            verts.append((
                cx + rx * s * math.cos(theta) * shape,
                cy + ry * s * math.sin(theta) * shape,
                cz + rz * math.cos(phi),
            ))
    faces = []
    for i in range(rings):
        for j in range(segments):
            a = i * segments + j
            b = i * segments + (j + 1) % segments
            c = (i + 1) * segments + (j + 1) % segments
            d = (i + 1) * segments + j
            if i > 0:
                faces.append((a, b, d))
            if i < rings - 1:
                faces.append((b, c, d))
    return Part(name, material, np.array(verts, dtype=float), faces)


def frustum(name, material, z0, z1, lower_xy, upper_xy, center=(0, 0), segments=16):
    cx, cy = center
    verts = []
    for z, (rx, ry) in ((z0, lower_xy), (z1, upper_xy)):
        for i in range(segments):
            a = 2 * math.pi * i / segments
            verts.append((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
    verts += [(cx, cy, z0), (cx, cy, z1)]
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces += [(i, j, segments + i), (j, segments + j, segments + i)]
        faces += [(2 * segments, j, i), (2 * segments + 1, segments + i, segments + j)]
    return Part(name, material, np.array(verts, dtype=float), faces)


def segment(name, material, p0, p1, r0, r1, sides=12):
    """Oriented tapered limb segment."""
    p0 = np.array(p0, dtype=float)
    p1 = np.array(p1, dtype=float)
    axis = p1 - p0
    axis /= np.linalg.norm(axis)
    helper = np.array((0.0, 0.0, 1.0))
    if abs(np.dot(axis, helper)) > 0.9:
        helper = np.array((0.0, 1.0, 0.0))
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    verts = []
    for p, r in ((p0, r0), (p1, r1)):
        for i in range(sides):
            a = 2 * math.pi * i / sides
            verts.append(p + r * (math.cos(a) * u + math.sin(a) * v))
    verts += [p0, p1]
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces += [(i, j, sides + i), (j, sides + j, sides + i)]
        faces += [(2 * sides, i, j), (2 * sides + 1, sides + j, sides + i)]
    return Part(name, material, np.array(verts), faces)


def box(name, material, center, size, bevel=False):
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    verts = np.array([
        (cx-sx, cy-sy, cz-sz), (cx+sx, cy-sy, cz-sz),
        (cx+sx, cy+sy, cz-sz), (cx-sx, cy+sy, cz-sz),
        (cx-sx, cy-sy, cz+sz), (cx+sx, cy-sy, cz+sz),
        (cx+sx, cy+sy, cz+sz), (cx-sx, cy+sy, cz+sz),
    ], dtype=float)
    faces = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
             (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    return Part(name, material, verts, faces)


def build_parts():
    p: list[Part] = []

    # Shoes and legs: slightly pigeon-toed and narrow stance subtly sell Elliot's character.
    for side, x, toe in (("L", -0.105, -0.012), ("R", 0.105, 0.012)):
        p.append(box(f"shoe_{side}", "shoes", (x + toe, -0.035, 0.075), (0.19, 0.34, 0.13)))
        p.append(box(f"sole_{side}", "sole", (x + toe, -0.035, 0.025), (0.195, 0.35, 0.035)))
        p.append(segment(f"shin_{side}", "trousers", (x, 0, 0.14), (x*0.96, 0.008, 0.57), 0.075, 0.092))
        p.append(ellipsoid(f"knee_{side}", "trousers", (x*0.96, 0.008, 0.59), (0.092, 0.09, 0.11), 8, 12))
        p.append(segment(f"thigh_{side}", "trousers", (x*0.96, 0.008, 0.61), (x*0.92, 0.0, 0.98), 0.112, 0.145))

    p.append(frustum("hips", "trousers", 0.88, 1.06, (0.20, 0.14), (0.22, 0.15)))
    p.append(frustum("shirt_hem", "shirt", 1.00, 1.11, (0.225, 0.15), (0.23, 0.15)))
    p.append(frustum("torso", "hoodie", 1.07, 1.46, (0.215, 0.14), (0.25, 0.155)))
    p.append(ellipsoid("hood", "hoodie_dark", (0, 0.075, 1.43), (0.20, 0.105, 0.17), 9, 14))
    p.append(segment("neck", "skin_shadow", (0, 0, 1.43), (0, 0, 1.55), 0.085, 0.075))

    # Sloped shoulders, bent forearms, and hands held slightly inward: readable but not caricatured.
    for side, s in (("L", -1), ("R", 1)):
        shoulder = (s*0.25, 0.0, 1.39)
        elbow = (s*0.325, -0.005, 1.12)
        wrist = (s*0.27, -0.055, 0.91)
        p.append(ellipsoid(f"shoulder_{side}", "hoodie", shoulder, (0.105, 0.12, 0.12), 9, 12))
        p.append(segment(f"upper_arm_{side}", "hoodie", shoulder, elbow, 0.087, 0.073))
        p.append(ellipsoid(f"elbow_{side}", "hoodie", elbow, (0.072, 0.07, 0.078), 7, 10))
        p.append(segment(f"forearm_{side}", "hoodie", elbow, wrist, 0.070, 0.056))
        p.append(ellipsoid(f"hand_{side}", "skin", (wrist[0], wrist[1]-0.005, wrist[2]-0.060), (0.055, 0.036, 0.095), 8, 12))

    # Head and facial planes.
    p.append(ellipsoid("head", "skin", (0, -0.004, 1.68), (0.135, 0.115, 0.188), 14, 20,
                       lambda phi, theta: 1.0 - 0.08 * max(0, math.cos(phi))))
    p.append(ellipsoid("nose", "skin_shadow", (0, -0.117, 1.69), (0.022, 0.030, 0.052), 7, 10))
    p.append(ellipsoid("left_ear", "skin_shadow", (-0.145, -0.002, 1.69), (0.025, 0.018, 0.052), 7, 10))
    p.append(ellipsoid("right_ear", "skin_shadow", (0.145, -0.002, 1.69), (0.025, 0.018, 0.052), 7, 10))

    # Eyes look very slightly down and aside, matching the socially awkward baseline.
    for side, x, dx in (("L", -0.052, -0.006), ("R", 0.052, -0.002)):
        p.append(ellipsoid(f"eye_{side}", "eye_white", (x, -0.111, 1.725), (0.030, 0.008, 0.015), 6, 10))
        p.append(ellipsoid(f"iris_{side}", "iris", (x+dx, -0.120, 1.722), (0.010, 0.005, 0.010), 5, 8))
        p.append(ellipsoid(f"pupil_{side}", "pupil", (x+dx, -0.125, 1.722), (0.0045, 0.0025, 0.005), 4, 8))
        brow_z = 1.763 if side == "L" else 1.758
        p.append(segment(f"brow_{side}", "hair", (x-0.036, -0.131, brow_z+0.004), (x+0.033, -0.132, brow_z-0.003), 0.006, 0.005, 8))

    p.append(segment("mouth", "lip", (-0.040, -0.124, 1.635), (0.038, -0.125, 1.632), 0.0045, 0.0045, 8))

    # Layered hair cap and irregular fringe break the mannequin look.
    p.append(ellipsoid("hair_cap", "hair", (0, 0.030, 1.815), (0.141, 0.102, 0.105), 10, 18))
    fringe = [(-0.105, -0.104, 1.805), (-0.058, -0.118, 1.790), (-0.015, -0.122, 1.805),
              (0.035, -0.118, 1.790), (0.085, -0.106, 1.805)]
    for i, pos in enumerate(fringe):
        p.append(ellipsoid(f"fringe_{i}", "hair", pos, (0.042, 0.022, 0.045), 6, 9))

    # Hoodie details.
    p.append(segment("drawstring_L", "sole", (-0.045, -0.162, 1.38), (-0.055, -0.17, 1.24), 0.007, 0.007, 8))
    p.append(segment("drawstring_R", "sole", (0.045, -0.162, 1.38), (0.055, -0.17, 1.24), 0.007, 0.007, 8))
    p.append(ellipsoid("pocket", "hoodie_dark", (0, -0.151, 1.145), (0.14, 0.015, 0.07), 7, 14))
    return p


def write_obj(parts):
    OUT.mkdir(parents=True, exist_ok=True)
    mtl_path = OUT / "elliot.mtl"
    with mtl_path.open("w", encoding="utf-8") as f:
        f.write("# Elliot materials - NPC Package prototype\n")
        for name, rgb in MATERIALS.items():
            f.write(f"newmtl {name}\nKd {rgb[0]:.4f} {rgb[1]:.4f} {rgb[2]:.4f}\n")
            f.write("Ka 0.0400 0.0400 0.0400\nKs 0.0800 0.0800 0.0800\nNs 24.0\nillum 2\n\n")

    obj_path = OUT / "elliot.obj"
    with obj_path.open("w", encoding="utf-8") as f:
        f.write("# Elliot - believable low-poly NPC Package prototype\n")
        f.write("# Units: metres. Up axis: Z. Front: -Y.\n")
        f.write("mtllib elliot.mtl\n")
        offset = 1
        for part in parts:
            f.write(f"\no {part.name}\nusemtl {part.material}\ns 1\n")
            for x, y, z in part.vertices:
                f.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
            for a, b, c in part.faces:
                f.write(f"f {a+offset} {b+offset} {c+offset}\n")
            offset += len(part.vertices)
    return obj_path


def render(parts):
    preview = OUT / "elliot_preview.png"
    fig = plt.figure(figsize=(16, 7.5), facecolor="#111416")
    views = [(12, -90, "FRONT"), (10, -68, "FRONT 3/4"), (8, 0, "PROFILE"), (8, 90, "BACK")]
    all_verts = np.concatenate([p.vertices for p in parts], axis=0)
    for idx, (elev, azim, label) in enumerate(views, 1):
        ax = fig.add_subplot(1, 4, idx, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        for part in parts:
            tris = [[part.vertices[a], part.vertices[b], part.vertices[c]] for a, b, c in part.faces]
            color = MATERIALS[part.material]
            poly = Poly3DCollection(tris, facecolor=color, edgecolor=(0,0,0,0.06), linewidth=0.12)
            poly.set_zsort("average")
            ax.add_collection3d(poly)
        # Ground disc/shadow.
        t = np.linspace(0, 2*np.pi, 48)
        ground = [list(zip(0.31*np.cos(t), 0.24*np.sin(t)+0.02, np.zeros_like(t)))]
        ax.add_collection3d(Poly3DCollection(ground, facecolor=(0,0,0,0.32), edgecolor="none"))
        ax.set_xlim(-0.48, 0.48); ax.set_ylim(-0.48, 0.48); ax.set_zlim(0, 1.92)
        ax.set_box_aspect((0.96, 0.96, 1.92))
        ax.view_init(elev=elev, azim=azim)
        ax.set_proj_type("ortho")
        ax.axis("off")
        ax.text2D(0.5, 0.02, label, transform=ax.transAxes, ha="center", color="#b8c2c8", fontsize=10, fontweight="bold")
    fig.suptitle("ELLIOT — NPC PACKAGE / CHARACTER 01", color="#ecf2f4", fontsize=18, fontweight="bold", y=0.965)
    fig.text(0.5, 0.925, "socially awkward · nervous · observant", ha="center", color="#7f929b", fontsize=11)
    plt.subplots_adjust(left=0.01, right=0.99, top=0.90, bottom=0.02, wspace=0.0)
    fig.savefig(preview, dpi=170, facecolor=fig.get_facecolor())
    plt.close(fig)
    return preview


def write_manifest(parts):
    tri_count = sum(len(p.faces) for p in parts)
    vert_count = sum(len(p.vertices) for p in parts)
    text = f"""# Elliot model\n\nFirst visual prototype for NPC Package.\n\n- Height: 1.87 m including hair (human body ~1.82 m)\n- Scale: metres\n- Up axis: Z\n- Facing: -Y\n- Mesh parts: {len(parts)}\n- Vertices: {vert_count:,}\n- Triangles: {tri_count:,}\n- Materials: {len(MATERIALS)}\n- Pose: neutral/nervous relaxed stance\n\n`elliot.obj` and `elliot.mtl` are engine-neutral source assets. The separated named\nparts preserve clean material boundaries and make the next rigging pass easier.\nThis is a visual prototype, not yet rigged or animated.\n"""
    (OUT / "README.md").write_text(text, encoding="utf-8")


def main():
    parts = build_parts()
    obj = write_obj(parts)
    preview = render(parts)
    write_manifest(parts)
    print(f"Built {obj}")
    print(f"Rendered {preview}")
    print(f"Parts={len(parts)}, vertices={sum(len(p.vertices) for p in parts)}, triangles={sum(len(p.faces) for p in parts)}")


if __name__ == "__main__":
    main()
