"""Structural validation for Elliot's generated GLB and review artifacts."""

from __future__ import annotations

import json
from pathlib import Path
import struct

from PIL import Image


ROOT = Path(__file__).resolve().parent
GLB = ROOT / "Characters" / "Elliot" / "Model" / "elliot_rigged.glb"


def main():
    raw = GLB.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF" and version == 2 and total == len(raw)
    json_len, json_type = struct.unpack_from("<I4s", raw, 12)
    assert json_type == b"JSON"
    json_start = 20
    doc = json.loads(raw[json_start:json_start + json_len])
    bin_header = json_start + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", raw, bin_header)
    assert bin_type == b"BIN\0"
    bin_start = bin_header + 8
    assert bin_start + bin_len == len(raw)
    assert doc["buffers"][0]["byteLength"] <= bin_len

    for view in doc["bufferViews"]:
        start = view.get("byteOffset", 0)
        assert start >= 0 and start + view["byteLength"] <= bin_len
    for accessor in doc["accessors"]:
        assert 0 <= accessor["bufferView"] < len(doc["bufferViews"])
        assert accessor["count"] > 0

    required_bones = {"Hips", "Spine", "Chest", "Neck", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"}
    node_names = {node.get("name") for node in doc["nodes"]}
    assert required_bones <= node_names
    assert len(doc["skins"][0]["joints"]) == 17
    animation_names = {a["name"] for a in doc["animations"]}
    # The original four must survive: the perception/presence layers call them
    # by name, so losing one silently breaks behaviour rather than the build.
    legacy = {"NERVOUS_IDLE", "GLANCE_AWAY", "STEP_BACK", "NERVOUS_WARNING"}
    assert legacy <= animation_names, f"legacy clips missing: {legacy - animation_names}"
    assert len(animation_names) >= 40, f"expected the expanded library, found {len(animation_names)}"
    assert len(doc["meshes"][0]["primitives"]) == 47

    # Every animated node must be a real bone, or the clip silently does nothing.
    joint_nodes = {doc["nodes"][j].get("name") for j in doc["skins"][0]["joints"]}
    for animation in doc["animations"]:
        for channel in animation["channels"]:
            target = doc["nodes"][channel["target"]["node"]].get("name")
            assert target in joint_nodes, f"{animation['name']} targets non-bone {target}"

    # Manifest must describe exactly the clips that were exported.
    manifest_path = ROOT / "Characters" / "Elliot" / "Model" / "elliot_animations.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert set(manifest["clips"]) == animation_names, "manifest and GLB disagree"
        assert not manifest.get("uncategorised"), manifest.get("uncategorised")

    phone = ROOT / "Characters" / "Elliot" / "Model" / "elliot_phone.glb"
    assert phone.exists() and phone.stat().st_size > 512, "phone prop missing"

    gif = Image.open(ROOT / "Characters" / "Elliot" / "Model" / "elliot_animation_preview.gif")
    assert getattr(gif, "n_frames", 1) >= 30
    print("ELLIOT_RIG_VALID")
    print(f"glb_bytes={len(raw):,} nodes={len(doc['nodes'])} bones=17 primitives=47 "
          f"animations={len(animation_names)} gif_frames={gif.n_frames}")


if __name__ == "__main__":
    main()
