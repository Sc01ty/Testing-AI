"""Rig Elliot, export GLB animations, and render visual QA poses.

No Blender dependency is required. The script consumes the same procedural mesh
source as build_elliot_model.py, adds a reusable humanoid skeleton, rigid skin
weights appropriate to the segmented low-poly mesh, and four animation clips.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
from pathlib import Path

import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
from PIL import Image

from build_elliot_model import MATERIALS, OUT, Part, build_parts
from elliot_animations import LOOPING, ROOT_MOTION, build_library


ROOT = Path(__file__).resolve().parent
GLB_PATH = OUT / "elliot_rigged.glb"
PREVIEW_PATH = OUT / "elliot_rig_preview.png"
SKELETON_PREVIEW_PATH = OUT / "elliot_skeleton.png"
ANIMATION_PREVIEW_PATH = OUT / "elliot_animation_preview.gif"


def to_gltf(v):
    """Z-up source -> Y-up glTF, with -Z as character forward."""
    a = np.asarray(v, dtype=float)
    return np.stack((a[..., 0], a[..., 2], a[..., 1]), axis=-1)


def from_gltf(v):
    a = np.asarray(v, dtype=float)
    return np.stack((a[..., 0], a[..., 2], a[..., 1]), axis=-1)


BONES_SOURCE = [
    ("Hips", None, (0.0, 0.0, 0.98)),
    ("Spine", "Hips", (0.0, 0.0, 1.10)),
    ("Chest", "Spine", (0.0, 0.0, 1.32)),
    ("Neck", "Chest", (0.0, 0.0, 1.49)),
    ("Head", "Neck", (0.0, -0.004, 1.61)),
    ("LeftUpperArm", "Chest", (-0.25, 0.0, 1.39)),
    ("LeftLowerArm", "LeftUpperArm", (-0.325, -0.005, 1.12)),
    ("LeftHand", "LeftLowerArm", (-0.27, -0.055, 0.85)),
    ("RightUpperArm", "Chest", (0.25, 0.0, 1.39)),
    ("RightLowerArm", "RightUpperArm", (0.325, -0.005, 1.12)),
    ("RightHand", "RightLowerArm", (0.27, -0.055, 0.85)),
    ("LeftUpperLeg", "Hips", (-0.105, 0.0, 0.95)),
    ("LeftLowerLeg", "LeftUpperLeg", (-0.101, 0.008, 0.59)),
    ("LeftFoot", "LeftLowerLeg", (-0.105, -0.035, 0.12)),
    ("RightUpperLeg", "Hips", (0.105, 0.0, 0.95)),
    ("RightLowerLeg", "RightUpperLeg", (0.101, 0.008, 0.59)),
    ("RightFoot", "RightLowerLeg", (0.105, -0.035, 0.12)),
]

BONE_NAMES = [b[0] for b in BONES_SOURCE]
BONE_INDEX = {name: i for i, name in enumerate(BONE_NAMES)}
BONE_PARENT = {name: parent for name, parent, _ in BONES_SOURCE}
BONE_POS = {name: to_gltf(pos) for name, _, pos in BONES_SOURCE}


def part_bone(name: str) -> str:
    side = "Left" if name.endswith("_L") else "Right"
    if name.startswith(("shoe_", "sole_")):
        return side + "Foot"
    if name.startswith(("shin_", "knee_")):
        return side + "LowerLeg"
    if name.startswith("thigh_"):
        return side + "UpperLeg"
    if name in {"hips", "shirt_hem"}:
        return "Hips"
    if name == "neck":
        return "Neck"
    if name.startswith(("shoulder_", "upper_arm_")):
        return side + "UpperArm"
    if name.startswith(("elbow_", "forearm_")):
        return side + "LowerArm"
    if name.startswith("hand_"):
        return side + "Hand"
    if name in {"torso", "hood", "pocket", "drawstring_L", "drawstring_R"}:
        return "Chest"
    return "Head"


def quat_axis(axis, degrees):
    axis = np.asarray(axis, dtype=float)
    axis /= np.linalg.norm(axis)
    a = math.radians(degrees) / 2.0
    return np.array((*axis * math.sin(a), math.cos(a)), dtype=np.float32)


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array((
        aw*bx + ax*bw + ay*bz - az*by,
        aw*by - ax*bz + ay*bw + az*bx,
        aw*bz + ax*by - ay*bx + az*bw,
        aw*bw - ax*bx - ay*by - az*bz,
    ), dtype=np.float32)


def qxyz(x=0, y=0, z=0):
    return quat_mul(quat_mul(quat_axis((1, 0, 0), x), quat_axis((0, 1, 0), y)), quat_axis((0, 0, 1), z))


IDENTITY_Q = qxyz()


def curve(node, path, times, values):
    return {"node": node, "path": path, "times": np.array(times, np.float32), "values": np.array(values, np.float32)}


def animation_clips():
    """Full library: the expanded vocabulary plus the original four clips.

    The originals are preserved byte-for-byte because the existing perception,
    presence and behaviour layers reference them by name.
    """
    hips = BONE_POS["Hips"].astype(np.float32)
    return build_library(hips, legacy_clips=legacy_animation_clips())


def legacy_animation_clips():
    hips = BONE_POS["Hips"].astype(np.float32)
    return {
        "NERVOUS_IDLE": [
            curve("Chest", "rotation", [0, .6, 1.2, 1.8, 2.4],
                  [qxyz(), qxyz(1.0, 0, -1.2), qxyz(-.5, 0, .7), qxyz(.8, 0, -.5), qxyz()]),
            curve("Head", "rotation", [0, .6, 1.2, 1.8, 2.4],
                  [qxyz(1.5, -3, 0), qxyz(4, 5, -1), qxyz(6, -8, 1), qxyz(3, 3, 0), qxyz(1.5, -3, 0)]),
            curve("LeftUpperArm", "rotation", [0, 1.2, 2.4], [qxyz(), qxyz(0, 0, -1.6), qxyz()]),
            curve("RightUpperArm", "rotation", [0, 1.2, 2.4], [qxyz(), qxyz(0, 0, 1.0), qxyz()]),
        ],
        "GLANCE_AWAY": [
            curve("Head", "rotation", [0, .22, .55, 1.20, 1.65],
                  [qxyz(2, -5, 0), qxyz(0, -8, 0), qxyz(5, 24, 1), qxyz(5, 24, 1), qxyz(2, -4, 0)]),
            curve("Chest", "rotation", [0, .55, 1.20, 1.65],
                  [qxyz(), qxyz(1.5, 4, 0), qxyz(1.5, 4, 0), qxyz()]),
        ],
        "STEP_BACK": [
            curve("Hips", "translation", [0, .18, .52, .86, 1.20],
                  [hips, hips + (0, 0, .015), hips + (0, 0, .035), hips + (0, 0, .012), hips]),
            curve("Chest", "rotation", [0, .18, .52, 1.20],
                  [qxyz(), qxyz(-4, 0, 0), qxyz(-2, 0, 0), qxyz(0, 0, 0)]),
            curve("Head", "rotation", [0, .25, .70, 1.20],
                  [qxyz(0, 0, 0), qxyz(-2, -4, 0), qxyz(0, -6, 0), qxyz(1, -4, 0)]),
            curve("LeftUpperLeg", "rotation", [0, .25, .62, 1.20],
                  [qxyz(), qxyz(8, 0, 0), qxyz(-5, 0, 0), qxyz()]),
            curve("LeftLowerLeg", "rotation", [0, .25, .62, 1.20],
                  [qxyz(), qxyz(-12, 0, 0), qxyz(7, 0, 0), qxyz()]),
            curve("RightUpperLeg", "rotation", [0, .25, .62, 1.20],
                  [qxyz(), qxyz(-5, 0, 0), qxyz(5, 0, 0), qxyz()]),
        ],
        "NERVOUS_WARNING": [
            curve("Head", "rotation", [0, .25, .75, 1.35],
                  [qxyz(2, -4, 0), qxyz(0, 0, 0), qxyz(3, 12, 0), qxyz(2, -4, 0)]),
            curve("Chest", "rotation", [0, .35, .90, 1.35],
                  [qxyz(), qxyz(-3, 0, 0), qxyz(-2, 0, 0), qxyz()]),
            curve("LeftUpperArm", "rotation", [0, .35, .80, 1.35],
                  [qxyz(), qxyz(-20, 0, 8), qxyz(-20, 0, 8), qxyz()]),
            curve("LeftLowerArm", "rotation", [0, .35, .80, 1.35],
                  [qxyz(), qxyz(-35, 0, -5), qxyz(-35, 0, -5), qxyz()]),
        ],
    }


def compute_normals(part: Part):
    normals = np.zeros_like(part.vertices)
    for a, b, c in part.faces:
        n = np.cross(part.vertices[b] - part.vertices[a], part.vertices[c] - part.vertices[a])
        length = np.linalg.norm(n)
        if length > 1e-9:
            n /= length
        normals[a] += n; normals[b] += n; normals[c] += n
    lengths = np.linalg.norm(normals, axis=1)
    lengths[lengths < 1e-9] = 1
    return normals / lengths[:, None]


class BufferBuilder:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add_view(self, blob, target=None):
        while len(self.data) % 4:
            self.data.append(0)
        offset = len(self.data)
        self.data.extend(blob)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
        if target:
            view["target"] = target
        self.views.append(view)
        return len(self.views) - 1

    def add_accessor(self, array, component_type, kind, target=None, include_bounds=False):
        array = np.ascontiguousarray(array)
        view = self.add_view(array.tobytes(), target)
        acc = {"bufferView": view, "componentType": component_type, "count": len(array), "type": kind}
        if include_bounds:
            acc["min"] = np.min(array, axis=0).astype(float).tolist()
            acc["max"] = np.max(array, axis=0).astype(float).tolist()
        self.accessors.append(acc)
        return len(self.accessors) - 1


def global_rest_matrices():
    result = {}
    for name, parent, _ in BONES_SOURCE:
        m = np.eye(4)
        m[:3, 3] = BONE_POS[name]
        result[name] = m
    return result


def build_glb(parts, clips):
    buf = BufferBuilder()
    material_names = list(MATERIALS)
    materials = []
    for name in material_names:
        rgb = MATERIALS[name]
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [*rgb, 1.0], "metallicFactor": 0.0, "roughnessFactor": .82
            },
        })

    primitives = []
    for part in parts:
        positions = to_gltf(part.vertices).astype(np.float32)
        normals = to_gltf(compute_normals(part)).astype(np.float32)
        # Axis conversion changes handedness; reverse face winding.
        indices = np.array([(a, c, b) for a, b, c in part.faces], dtype=np.uint16).reshape(-1)
        joint_id = BONE_INDEX[part_bone(part.name)]
        joints = np.zeros((len(positions), 4), dtype=np.uint16)
        joints[:, 0] = joint_id
        weights = np.zeros((len(positions), 4), dtype=np.float32)
        weights[:, 0] = 1.0
        primitives.append({
            "attributes": {
                "POSITION": buf.add_accessor(positions, 5126, "VEC3", 34962, True),
                "NORMAL": buf.add_accessor(normals, 5126, "VEC3", 34962),
                "JOINTS_0": buf.add_accessor(joints, 5123, "VEC4", 34962),
                "WEIGHTS_0": buf.add_accessor(weights, 5126, "VEC4", 34962),
            },
            "indices": buf.add_accessor(indices, 5123, "SCALAR", 34963),
            "material": material_names.index(part.material),
        })

    nodes = [{"name": "ElliotRig", "children": [1]}]
    bone_node_index = {}
    for i, (name, parent, _) in enumerate(BONES_SOURCE, start=1):
        bone_node_index[name] = i
        local = BONE_POS[name] if parent is None else BONE_POS[name] - BONE_POS[parent]
        nodes.append({"name": name, "translation": local.astype(float).tolist()})
    for name, parent, _ in BONES_SOURCE:
        children = [bone_node_index[n] for n, p, _ in BONES_SOURCE if p == name]
        if children:
            nodes[bone_node_index[name]]["children"] = children

    rest = global_rest_matrices()
    ibms = []
    for name in BONE_NAMES:
        inv = np.linalg.inv(rest[name]).astype(np.float32)
        ibms.append(inv.T.reshape(-1))  # glTF matrices are column-major.
    ibm_accessor = buf.add_accessor(np.array(ibms, np.float32), 5126, "MAT4")

    mesh_node = len(nodes)
    nodes.append({"name": "ElliotMesh", "mesh": 0, "skin": 0})
    animations = []
    for clip_name, curves in clips.items():
        samplers, channels = [], []
        for c in curves:
            input_acc = buf.add_accessor(c["times"], 5126, "SCALAR", include_bounds=True)
            kind = "VEC4" if c["path"] == "rotation" else "VEC3"
            output_acc = buf.add_accessor(c["values"], 5126, kind)
            sampler_id = len(samplers)
            samplers.append({"input": input_acc, "output": output_acc, "interpolation": "LINEAR"})
            channels.append({"sampler": sampler_id, "target": {"node": bone_node_index[c["node"]], "path": c["path"]}})
        animations.append({"name": clip_name, "samplers": samplers, "channels": channels})

    doc = {
        "asset": {"version": "2.0", "generator": "Scotty NPC Package procedural rig v1"},
        "scene": 0,
        "scenes": [{"name": "Elliot", "nodes": [0, mesh_node]}],
        "nodes": nodes,
        "meshes": [{"name": "Elliot", "primitives": primitives}],
        "skins": [{"name": "ElliotHumanoidRig", "inverseBindMatrices": ibm_accessor,
                   "skeleton": bone_node_index["Hips"], "joints": [bone_node_index[n] for n in BONE_NAMES]}],
        "animations": animations,
        "materials": materials,
        "buffers": [{"byteLength": len(buf.data)}],
        "bufferViews": buf.views,
        "accessors": buf.accessors,
    }
    json_blob = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_blob += b" " * ((4 - len(json_blob) % 4) % 4)
    bin_blob = bytes(buf.data)
    bin_blob += b"\0" * ((4 - len(bin_blob) % 4) % 4)
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with GLB_PATH.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_blob), b"JSON")); f.write(json_blob)
        f.write(struct.pack("<I4s", len(bin_blob), b"BIN\0")); f.write(bin_blob)
    return doc


def q_to_matrix(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0],
        [0, 0, 0, 1],
    ])


def sample_curve(c, t):
    times, values = c["times"], c["values"]
    if t <= times[0]: return values[0]
    if t >= times[-1]: return values[-1]
    i = int(np.searchsorted(times, t) - 1)
    alpha = float((t - times[i]) / (times[i+1] - times[i]))
    value = values[i] * (1-alpha) + values[i+1] * alpha
    if c["path"] == "rotation":
        value /= np.linalg.norm(value)
    return value


def pose_matrices(curves, t):
    curve_map = {(c["node"], c["path"]): c for c in curves}
    global_mats = {}
    for name, parent, _ in BONES_SOURCE:
        rest_local = BONE_POS[name] if parent is None else BONE_POS[name] - BONE_POS[parent]
        translation = sample_curve(curve_map[(name, "translation")], t) if (name, "translation") in curve_map else rest_local
        rotation = sample_curve(curve_map[(name, "rotation")], t) if (name, "rotation") in curve_map else IDENTITY_Q
        local = q_to_matrix(rotation)
        local[:3, 3] = translation
        global_mats[name] = local if parent is None else global_mats[parent] @ local
    return global_mats


def posed_parts(parts, curves, t):
    rest = global_rest_matrices()
    posed = pose_matrices(curves, t)
    result = []
    for part in parts:
        bone = part_bone(part.name)
        skin = posed[bone] @ np.linalg.inv(rest[bone])
        verts = to_gltf(part.vertices)
        hom = np.column_stack((verts, np.ones(len(verts))))
        transformed = (skin @ hom.T).T[:, :3]
        result.append(Part(part.name, part.material, from_gltf(transformed), part.faces))
    return result


def render_parts(ax, parts, elev=10, azim=-90):
    for part in parts:
        tris = [[part.vertices[a], part.vertices[b], part.vertices[c]] for a, b, c in part.faces]
        poly = Poly3DCollection(tris, facecolor=MATERIALS[part.material], edgecolor=(0,0,0,.055), linewidth=.1)
        poly.set_zsort("average"); ax.add_collection3d(poly)
    # A ground marker makes vertical contact and backward root motion readable.
    t = np.linspace(0, 2*np.pi, 48)
    ground = [list(zip(.29*np.cos(t), .22*np.sin(t)+.02, np.zeros_like(t)))]
    ax.add_collection3d(Poly3DCollection(ground, facecolor=(0,0,0,.36), edgecolor="none"))
    ax.set_xlim(-.55, .55); ax.set_ylim(-.62, .62); ax.set_zlim(0, 1.95)
    ax.set_box_aspect((1.1, 1.24, 1.95)); ax.view_init(elev=elev, azim=azim); ax.set_proj_type("ortho"); ax.axis("off")


def render_pose_preview(parts, clips):
    samples = [("BIND POSE", [], 0, -78), ("NERVOUS IDLE", clips["NERVOUS_IDLE"], 1.2, -72),
               ("GLANCE AWAY", clips["GLANCE_AWAY"], .72, -68), ("STEP BACK", clips["STEP_BACK"], .82, -45),
               ("NERVOUS WARNING", clips["NERVOUS_WARNING"], .70, -66)]
    fig = plt.figure(figsize=(18, 7.2), facecolor="#111416")
    for i, (label, curves, t, azim) in enumerate(samples, 1):
        ax = fig.add_subplot(1, len(samples), i, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        render_parts(ax, posed_parts(parts, curves, t) if curves else parts, azim=azim)
        ax.text2D(.5, .03, label, transform=ax.transAxes, ha="center", color="#c5d0d5", fontsize=9, fontweight="bold")
    fig.suptitle("ELLIOT — RIG & BODY-LANGUAGE CHECK", color="#f1f5f6", fontsize=18, fontweight="bold", y=.95)
    fig.text(.5, .905, "actual skinned poses exported in elliot_rigged.glb", ha="center", color="#7f929b", fontsize=10)
    plt.subplots_adjust(left=.01, right=.99, top=.88, bottom=.01, wspace=0)
    fig.savefig(PREVIEW_PATH, dpi=160, facecolor=fig.get_facecolor()); plt.close(fig)


def render_clip_sheet(parts, clips):
    """Contact sheet of every clip at its most expressive frame.

    This exists to be looked at. Adding 40 clips without rendering them is how
    you end up shipping animations that read badly in engine.
    """
    names = list(clips)
    cols = 8
    rows = math.ceil(len(names) / cols)
    fig = plt.figure(figsize=(cols * 2.05, rows * 3.0), facecolor="#111416")

    for i, name in enumerate(names, 1):
        curves = clips[name]
        duration = max(float(c["times"][-1]) for c in curves)
        # 55% through a clip is usually its extreme; idles read better mid-cycle.
        t = duration * (0.5 if name.startswith(("IDLE", "WALK", "PHONE_TALK", "PHONE_LISTEN")) else 0.55)
        ax = fig.add_subplot(rows, cols, i, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        azim = -52 if ("STEP" in name or "STUMBLE" in name or "WALK" in name or "IMPACT" in name) else -74
        render_parts(ax, posed_parts(parts, curves, t), elev=9, azim=azim)
        ax.text2D(.5, .02, name.replace("_", " "), transform=ax.transAxes, ha="center",
                  color="#9fb4bd", fontsize=6.4, fontweight="bold")

    fig.suptitle(f"ELLIOT — ANIMATION VOCABULARY ({len(names)} clips)",
                 color="#f1f5f6", fontsize=20, fontweight="bold", y=.995)
    plt.subplots_adjust(left=.004, right=.996, top=.965, bottom=.004, wspace=0, hspace=.06)
    fig.savefig(OUT / "elliot_clip_sheet.png", dpi=110, facecolor=fig.get_facecolor())
    plt.close(fig)


def render_motion_strip(parts, clips, clip_name, frames=7, azim=-52):
    """Left-to-right frame strip of one clip, for checking movement mechanics."""
    curves = clips[clip_name]
    duration = max(float(c["times"][-1]) for c in curves)
    fig = plt.figure(figsize=(frames * 2.4, 6.2), facecolor="#111416")
    for i in range(frames):
        t = duration * i / (frames - 1)
        ax = fig.add_subplot(1, frames, i + 1, projection="3d", computed_zorder=False)
        ax.set_facecolor("#111416")
        render_parts(ax, posed_parts(parts, curves, float(t)), elev=8, azim=azim)
        ax.text2D(.5, .02, f"{t:.2f}s", transform=ax.transAxes, ha="center", color="#7f929b", fontsize=9)
    fig.suptitle(clip_name.replace("_", " "), color="#67d4ff", fontsize=13, fontweight="bold", y=.97)
    plt.subplots_adjust(left=.004, right=.996, top=.88, bottom=.02, wspace=0)
    path = OUT / f"strip_{clip_name.lower()}.png"
    fig.savefig(path, dpi=115, facecolor=fig.get_facecolor())
    plt.close(fig)
    return path


def render_skeleton(parts):
    fig = plt.figure(figsize=(7, 8), facecolor="#111416")
    ax = fig.add_subplot(111, projection="3d", computed_zorder=False); ax.set_facecolor("#111416")
    render_parts(ax, parts, elev=8, azim=-90)
    for name, parent, _ in BONES_SOURCE:
        p = from_gltf(BONE_POS[name])
        ax.scatter(*p, color="#54d2ff", s=18, depthshade=False)
        if parent:
            q = from_gltf(BONE_POS[parent])
            ax.plot([p[0], q[0]], [p[1], q[1]], [p[2], q[2]], color="#54d2ff", linewidth=2.2)
    fig.suptitle("ELLIOT HUMANOID RIG", color="#f1f5f6", fontsize=17, fontweight="bold", y=.96)
    fig.savefig(SKELETON_PREVIEW_PATH, dpi=170, facecolor=fig.get_facecolor()); plt.close(fig)


def render_animation_preview(parts, clips):
    """Small review GIF generated from the exact exported animation curves."""
    frames = []
    fig = plt.figure(figsize=(4.4, 6.2), facecolor="#111416", dpi=100)
    for clip_name in ("NERVOUS_IDLE", "GLANCE_AWAY", "STEP_BACK", "NERVOUS_WARNING"):
        curves = clips[clip_name]
        duration = max(float(c["times"][-1]) for c in curves)
        sample_times = np.linspace(0, duration, max(7, int(duration * 6)))
        for t in sample_times:
            fig.clear()
            ax = fig.add_subplot(111, projection="3d", computed_zorder=False)
            ax.set_facecolor("#111416")
            render_parts(ax, posed_parts(parts, curves, float(t)), elev=9, azim=-58)
            fig.suptitle("ELLIOT", color="#f1f5f6", fontsize=16, fontweight="bold", y=.965)
            fig.text(.5, .91, clip_name.replace("_", " "), ha="center", color="#67d4ff", fontsize=10, fontweight="bold")
            fig.canvas.draw()
            rgba = np.asarray(fig.canvas.buffer_rgba()).copy()
            frames.append(Image.fromarray(rgba).convert("P", palette=Image.Palette.ADAPTIVE))
        frames.extend([frames[-1].copy(), frames[-1].copy()])
    plt.close(fig)
    frames[0].save(ANIMATION_PREVIEW_PATH, save_all=True, append_images=frames[1:], duration=145, loop=0, optimize=True)


def write_docs(parts, clips):
    hierarchy = []
    for name, parent, _ in BONES_SOURCE:
        depth = 0; p = parent
        while p:
            depth += 1; p = BONE_PARENT[p]
        hierarchy.append("  " * depth + f"- {name}")
    text = f"""# Elliot rig\n\n`elliot_rigged.glb` is the portable, Y-up, -Z-forward animated character.\nThe original OBJ/MTL remain the static modelling checkpoint.\n\n## Skeleton\n\n{chr(10).join(hierarchy)}\n\n## Animation clips\n\n""" + "\n".join(f"- `{name}` ({max(float(c['times'][-1]) for c in curves):.2f}s)" for name, curves in clips.items()) + f"""\n\n## Godot import\n\n1. Copy or drag the GLB into the Godot project.\n2. Leave scale at `1.0`; the asset is authored in metres.\n3. Keep animation import enabled and loop `NERVOUS_IDLE` only.\n4. The example project uses uppercase animation names exactly as listed above.\n5. If Godot adds a name prefix, select the imported AnimationPlayer and confirm the generated library names.\n\n## Reuse\n\nThe 17-bone hierarchy and animation names are character-independent. A later\ncharacter can reuse it by mapping mesh sections/weights to the same bone names.\n\n## Geometry\n\n- {sum(len(p.vertices) for p in parts):,} vertices across {len(parts)} named mesh sections\n- {sum(len(p.faces) for p in parts):,} triangles\n- Rigid weights (one joint per vertex), chosen for this segmented low-poly prototype\n\n## Limitations\n\n- No facial blendshapes or separate eye bones yet; gaze is communicated by head direction.\n- Rigid weights suit this model but elbows/shoulders will need blended weights on a continuous future mesh.\n- `STEP_BACK` contains 0.28 m of hip/root displacement. Confirm root-motion handling in the target engine.\n- The GLB and poses were structurally validated and rendered from their skin transforms, but no local Godot executable was available for an engine playtest.\n"""
    text = text.replace(
        "`STEP_BACK` contains 0.28 m of hip/root displacement. Confirm root-motion handling in the target engine.",
        "`STEP_BACK` is in-place. The behaviour controller moves the entity 0.28 m so perception and navigation share one world position.",
    )
    (OUT / "RIG.md").write_text(text, encoding="utf-8")


def copy_to_example():
    target = ROOT / "GodotTest" / "assets" / "elliot_rigged.glb"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(GLB_PATH, target)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    parts = build_parts(); clips = animation_clips()
    doc = build_glb(parts, clips)
    render_pose_preview(parts, clips); render_skeleton(parts); render_animation_preview(parts, clips)
    render_clip_sheet(parts, clips)
    for clip_name in ("STEP_BACK_SMALL", "STUMBLE_BACK", "WALK_FORWARD",
                      "SHOULDER_IMPACT_LEFT", "PHONE_PULL_OUT", "PHONE_RAISE_TO_EAR"):
        render_motion_strip(parts, clips, clip_name)
    write_docs(parts, clips); copy_to_example()
    print(f"Built {GLB_PATH} ({GLB_PATH.stat().st_size:,} bytes)")
    print(f"Skeleton: {len(BONE_NAMES)} bones; {len(clips)} animation clips")
    print(f"  looping: {len(LOOPING)}; root-motion: {len(ROOT_MOTION)}")
    print(f"GLB nodes={len(doc['nodes'])}, primitives={len(doc['meshes'][0]['primitives'])}")


if __name__ == "__main__":
    main()
