"""Phone prop + animation manifest.

The phone is exported as its OWN GLB rather than merged into Elliot's skinned
mesh. That keeps it hideable (a merged surface cannot be toggled), reusable by
other characters, and attachable through a normal bone attachment in any engine.

The manifest is the contract between the 59 authored clips and the behaviour
layer: category, duration, looping, interruption priority and whether a clip
carries root motion the locomotion controller must match.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

from build_elliot_model import OUT
from elliot_animations import LOOPING, ROOT_MOTION
from rig_elliot import animation_clips

ROOT = Path(__file__).resolve().parent
PHONE_GLB = OUT / "elliot_phone.glb"
MANIFEST = OUT / "elliot_animations.json"


# --- phone prop ---------------------------------------------------------------

def box(cx, cy, cz, sx, sy, sz):
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = np.array([
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
    ], dtype=np.float32)
    f = np.array([
        (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4), (2, 3, 7), (2, 7, 6),
        (1, 2, 6), (1, 6, 5), (0, 4, 7), (0, 7, 3),
    ], dtype=np.uint16)
    return v, f


def build_phone_glb() -> dict:
    """A phone is 147 x 71 x 8 mm. Built to real scale so it reads correctly."""
    body_v, body_f = box(0, 0, 0, 0.071, 0.147, 0.0082)
    # Screen sits just proud of the body face so it is visible from the front.
    screen_v, screen_f = box(0, 0.004, 0.0046, 0.063, 0.131, 0.0006)

    parts = [
        ("PhoneBody", body_v, body_f, [0.07, 0.075, 0.085, 1.0], 0.35),
        ("PhoneScreen", screen_v, screen_f, [0.32, 0.40, 0.46, 1.0], 0.12),
    ]

    blobs = bytearray()
    views, accessors, primitives, materials = [], [], [], []

    def add_view(blob, target):
        while len(blobs) % 4:
            blobs.append(0)
        offset = len(blobs)
        blobs.extend(blob)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blob), "target": target})
        return len(views) - 1

    def add_accessor(array, component_type, kind, target, bounds=False):
        array = np.ascontiguousarray(array)
        acc = {"bufferView": add_view(array.tobytes(), target),
               "componentType": component_type, "count": len(array), "type": kind}
        if bounds:
            acc["min"] = np.min(array, axis=0).astype(float).tolist()
            acc["max"] = np.max(array, axis=0).astype(float).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for name, verts, faces, colour, rough in parts:
        normals = np.zeros_like(verts)
        for a, b, c in faces:
            n = np.cross(verts[b] - verts[a], verts[c] - verts[a])
            length = np.linalg.norm(n)
            if length > 1e-9:
                n = n / length
            normals[a] += n
            normals[b] += n
            normals[c] += n
        lengths = np.linalg.norm(normals, axis=1)
        lengths[lengths < 1e-9] = 1
        normals = (normals / lengths[:, None]).astype(np.float32)

        materials.append({
            "name": name,
            "pbrMetallicRoughness": {"baseColorFactor": colour, "metallicFactor": 0.0,
                                     "roughnessFactor": rough},
            "emissiveFactor": [0.06, 0.09, 0.12] if name == "PhoneScreen" else [0, 0, 0],
        })
        primitives.append({
            "attributes": {
                "POSITION": add_accessor(verts.astype(np.float32), 5126, "VEC3", 34962, True),
                "NORMAL": add_accessor(normals, 5126, "VEC3", 34962),
            },
            "indices": add_accessor(faces.reshape(-1), 5123, "SCALAR", 34963),
            "material": len(materials) - 1,
        })

    doc = {
        "asset": {"version": "2.0", "generator": "Scotty NPC Package prop v1"},
        "scene": 0,
        "scenes": [{"name": "ElliotPhone", "nodes": [0]}],
        "nodes": [{"name": "Phone", "mesh": 0}],
        "meshes": [{"name": "Phone", "primitives": primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(blobs)}],
        "bufferViews": views,
        "accessors": accessors,
    }

    json_blob = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_blob += b" " * ((4 - len(json_blob) % 4) % 4)
    bin_blob = bytes(blobs) + b"\0" * ((4 - len(blobs) % 4) % 4)
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with PHONE_GLB.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_blob), b"JSON"))
        f.write(json_blob)
        f.write(struct.pack("<I4s", len(bin_blob), b"BIN\0"))
        f.write(bin_blob)
    return doc


# --- manifest -----------------------------------------------------------------

# Interruption priority. Higher wins. The behaviour layer uses these instead of
# hard-coding numbers next to every play() call.
PRIORITY = {
    "ambient": 10,     # idles, fidgets, looking around
    "phone_idle": 20,  # scrolling / on a call
    "attention": 30,   # noticing, glancing, breaking eye contact
    "reposition": 45,  # steps, side steps, walking away
    "warning": 60,     # boundary signals
    "impact": 80,      # being walked into - always interrupts
}

CATEGORY = {
    "ambient": [
        "IDLE_NEUTRAL_A", "IDLE_NEUTRAL_B", "IDLE_NERVOUS_A", "IDLE_NERVOUS_B", "NERVOUS_IDLE",
        "WEIGHT_SHIFT_LEFT", "WEIGHT_SHIFT_RIGHT", "ADJUST_SLEEVE", "RUB_HANDS",
        "TOUCH_FACE", "SCRATCH_NECK", "LOOK_AT_FLOOR", "LOOK_AROUND", "CHECK_BEHIND", "DEEP_BREATH",
    ],
    "attention": [
        "NOTICE_PLAYER", "QUICK_GLANCE", "LONG_GLANCE", "BREAK_EYE_CONTACT", "GLANCE_AWAY",
        "DOUBLE_TAKE", "LOOK_BACK_AT_PLAYER", "TURN_TOWARD_PLAYER_PARTIAL",
        "TURN_AWAY_FROM_PLAYER", "CLOSED_POSTURE", "CONFUSED_REACTION",
    ],
    "reposition": [
        "STEP_BACK", "STEP_BACK_SMALL", "STEP_BACK_FAST", "STEP_BACK_STARTLED",
        "BACKPEDAL_SHORT", "SIDE_STEP_LEFT", "SIDE_STEP_RIGHT", "TURN_AND_WALK_AWAY",
        "WALK_AWAY_NERVOUS", "STOP_AND_LOOK_BACK", "WALK_FORWARD", "WALK_BACKWARD",
        "TURN_LEFT", "TURN_RIGHT",
    ],
    "impact": [
        "BUMP_RECOIL_LIGHT", "BUMP_RECOIL_MEDIUM", "SHOULDER_IMPACT_LEFT",
        "SHOULDER_IMPACT_RIGHT", "STUMBLE_BACK", "REGAIN_BALANCE",
    ],
    "warning": [
        "NERVOUS_WARNING", "HAND_UP_BOUNDARY", "ANNOYED_REACTION",
    ],
    "phone_idle": [
        "PHONE_NOTICE", "PHONE_PULL_OUT", "PHONE_LOOK_AT", "PHONE_SCROLL",
        "PHONE_RAISE_TO_EAR", "PHONE_TALK_IDLE", "PHONE_LISTEN_IDLE",
        "PHONE_LOWER_SLIGHTLY", "PHONE_END_CALL", "PHONE_PUT_AWAY",
    ],
}

# Clips that are intentionally not driven by behaviour. Everything else must be
# reachable, and validate_clip_wiring.py fails if it is not.
USAGE: dict[str, str] = {
    # Superseded by STEP_BACK_SMALL/FAST/STARTLED, kept so the behaviour spec and
    # any saved references to the original four still resolve.
    "STEP_BACK": "LEGACY",
    "GLANCE_AWAY": "LEGACY",
    "NERVOUS_IDLE": "LEGACY",
    "NERVOUS_WARNING": "LEGACY",
}

# Clips during which the phone should be visible in Elliot's right hand.
PHONE_VISIBLE = {
    "PHONE_LOOK_AT", "PHONE_SCROLL", "PHONE_RAISE_TO_EAR", "PHONE_TALK_IDLE",
    "PHONE_LISTEN_IDLE", "PHONE_LOWER_SLIGHTLY", "PHONE_END_CALL",
}


def build_manifest(clips) -> dict:
    lookup = {}
    for category, names in CATEGORY.items():
        for name in names:
            lookup[name] = category

    entries = {}
    uncategorised = []
    for name, curves in clips.items():
        category = lookup.get(name)
        if category is None:
            uncategorised.append(name)
            category = "ambient"
        entries[name] = {
            "category": category,
            "priority": PRIORITY[category],
            "duration": round(max(float(c["times"][-1]) for c in curves), 3),
            "loop": name in LOOPING,
            "root_motion_m": ROOT_MOTION.get(name, 0.0),
            "phone_visible": name in PHONE_VISIBLE,
            "usage": USAGE.get(name, "PRODUCTION"),
            "bones_animated": sorted({c["node"] for c in curves}),
        }

    # Ground speed measured from the planted foot, so the locomotion controller
    # moves the body at exactly the rate the animation implies.
    locomotion: dict[str, dict] = {}
    try:
        from tests.measure_locomotion import LOCOMOTION_CLIPS, measure
        from build_elliot_model import build_parts as _build_parts
        parts = _build_parts()
        for clip_name in LOCOMOTION_CLIPS:
            locomotion[clip_name] = measure(clip_name, parts)
    except Exception as error:  # measurement is advisory, not load-bearing
        locomotion = {"error": str(error)}

    manifest = {
        "generator": "build_props_and_manifest.py",
        "clip_count": len(entries),
        "priorities": PRIORITY,
        "locomotion": locomotion,
        "phone": {
            "glb": "elliot_phone.glb",
            "attach_bone": "RightHand",
            # Offsets in metres/degrees, relative to the RightHand bone. Tuned so
            # the screen faces the character when reading and the body sits
            # against the ear during a call.
            "attach_offset_m": [0.0, -0.045, 0.012],
            "attach_rotation_deg": [12.0, 0.0, -8.0],
        },
        "clips": entries,
    }
    if uncategorised:
        manifest["uncategorised"] = sorted(uncategorised)
    return manifest


def main() -> None:
    doc = build_phone_glb()
    print(f"phone prop: {PHONE_GLB} ({PHONE_GLB.stat().st_size:,} bytes, "
          f"{len(doc['meshes'][0]['primitives'])} primitives)")

    clips = animation_clips()
    manifest = build_manifest(clips)
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    counts: dict[str, int] = {}
    for entry in manifest["clips"].values():
        counts[entry["category"]] = counts.get(entry["category"], 0) + 1
    print(f"manifest: {MANIFEST} ({manifest['clip_count']} clips)")
    for category in sorted(counts):
        print(f"  {category:<12} {counts[category]:>3}")
    if "uncategorised" in manifest:
        print(f"  UNCATEGORISED: {manifest['uncategorised']}")

    # mirror into the Godot project
    for target in (ROOT / "GodotTest" / "assets" / "elliot_phone.glb",):
        target.write_bytes(PHONE_GLB.read_bytes())
    (ROOT / "GodotTest" / "config" / "elliot_animations.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")
    print("copied prop + manifest into GodotTest/")


if __name__ == "__main__":
    main()
