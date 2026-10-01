"""Cross-check the GDScript clip wiring against the exported manifest.

Three ways this can silently break:
  1. a pool lists a clip that was renamed or never authored
  2. a controller asks for a pool that does not exist
  3. the manifest and the GLB disagree

All three produce a character that plays nothing and logs a warning nobody
reads, so they are checked here instead.
"""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GODOT = ROOT / "GodotTest"
MANIFEST = GODOT / "config" / "elliot_animations.json"
GLB = GODOT / "assets" / "elliot_rigged.glb"


def parse_dict_block(text: str, name: str) -> dict[str, list[str]]:
    """Pull a `const NAME: Dictionary = { ... }` block out of GDScript."""
    match = re.search(rf"const {name}: Dictionary = \{{(.*?)\n\}}", text, re.S)
    if not match:
        return {}
    body = match.group(1)
    result: dict[str, list[str]] = {}
    for line in body.splitlines():
        entry = re.match(r'\s*&?"([^"]+)":\s*(.+?),?\s*$', line)
        if not entry:
            continue
        key, value = entry.group(1), entry.group(2).rstrip(",")
        members = re.findall(r'"([^"]+)"', value)
        result[key] = members
    return result


def main() -> int:
    failures: list[str] = []

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest_clips = set(manifest["clips"])

    raw = GLB.read_bytes()
    json_len = struct.unpack("<I", raw[12:16])[0]
    doc = json.loads(raw[20:20 + json_len])
    glb_clips = {a["name"] for a in doc["animations"]}

    if manifest_clips != glb_clips:
        failures.append(
            f"manifest/GLB mismatch: only in manifest {sorted(manifest_clips - glb_clips)}, "
            f"only in GLB {sorted(glb_clips - manifest_clips)}")

    library_text = (GODOT / "scripts" / "clip_library.gd").read_text(encoding="utf-8")
    pools = parse_dict_block(library_text, "POOLS")
    if not pools:
        failures.append("could not parse POOLS from clip_library.gd")

    for pool_name, members in pools.items():
        missing = [m for m in members if m not in manifest_clips]
        if missing:
            failures.append(f"pool {pool_name} references unknown clips: {missing}")
        if not members:
            failures.append(f"pool {pool_name} is empty")

    presence_text = (GODOT / "scripts" / "presence_controller.gd").read_text(encoding="utf-8")
    action_pools = parse_dict_block(presence_text, "ACTION_POOLS")
    for action, targets in action_pools.items():
        for target in targets:
            if target not in pools:
                failures.append(f"presence action {action} maps to unknown pool {target}")

    # Pools requested directly by the behaviour controller.
    behaviour_text = (GODOT / "scripts" / "npc_behaviour_controller.gd").read_text(encoding="utf-8")
    requested = set(re.findall(r'_request_animation\("([A-Z_]+)"', behaviour_text))
    requested |= set(re.findall(r'set_idle_fallback\("([A-Z_]+)"\)', behaviour_text))
    requested |= set(re.findall(r'step_pool: String = "([A-Z_]+)" if .* else "([A-Z_]+)"',
                               behaviour_text)[0] if re.search(r'step_pool: String', behaviour_text) else [])
    for pool_name in sorted(requested):
        if pool_name not in pools and pool_name not in manifest_clips:
            failures.append(f"behaviour controller requests unknown pool/clip {pool_name}")

    # Quick-play keys in main.gd must also resolve.
    main_text = (GODOT / "scripts" / "main.gd").read_text(encoding="utf-8")
    for played in set(re.findall(r'animator\.play\("([A-Z_0-9]+)"\)', main_text)):
        if played not in pools and played not in manifest_clips:
            failures.append(f"main.gd quick key plays unknown pool/clip {played}")

    # Every clip should be reachable, or it is dead weight in the GLB.
    reachable: set[str] = set()
    for members in pools.values():
        reachable.update(members)

    # The locomotion controller names clips directly in its STYLES table and its
    # turn requests; those count as reachable too.
    locomotion_text = (GODOT / "scripts" / "locomotion_controller.gd").read_text(encoding="utf-8")
    reachable |= set(re.findall(r'"clip": "([A-Z_]+)"', locomotion_text))
    reachable |= set(re.findall(r'animator\.request\("([A-Z_]+)"', locomotion_text))

    # Clips explicitly marked as not production-driven are allowed to be orphans.
    declared = {name for name, entry in manifest["clips"].items()
                if entry.get("usage", "PRODUCTION") != "PRODUCTION"}

    unreachable = sorted(manifest_clips - reachable - declared)

    print(f"manifest clips     : {len(manifest_clips)}")
    print(f"GLB animations     : {len(glb_clips)}")
    print(f"pools              : {len(pools)}")
    print(f"presence actions   : {len(action_pools)}")
    print(f"clips reachable    : {len(reachable)}")
    print(f"declared non-production: {len(declared)} -> {sorted(declared)}")
    if unreachable:
        print(f"\nORPHANED production clips ({len(unreachable)}):")
        for name in unreachable:
            print(f"    {name}")
        failures.append(f"{len(unreachable)} production clips are unreachable: {unreachable}")
    else:
        print("orphaned production clips: none")

    if failures:
        print("\nFAILURES:")
        for failure in failures:
            print(f"  - {failure}")
        print("CLIP_WIRING_INVALID")
        return 1

    print("\nCLIP_WIRING_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
