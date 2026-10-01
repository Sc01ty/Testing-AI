"""Static checks for the Godot example when the Godot executable is unavailable."""

from __future__ import annotations

import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1] / "GodotTest"


def main():
    scene = (ROOT / "main.tscn").read_text(encoding="utf-8")
    resources = re.findall(r'path="res://([^"]+)"', scene)
    missing = [p for p in resources if not (ROOT / p).exists()]
    assert not missing, f"Missing scene resources: {missing}"

    config = json.loads((ROOT / "config/elliot_behavior_spec.json").read_text(encoding="utf-8"))
    assert config["ranges"]["personal_enter_m"] < config["ranges"]["personal_exit_m"]
    assert config["ranges"]["awareness_enter_m"] < config["ranges"]["awareness_exit_m"]
    assert set(config["animation"]) == {"NERVOUS_IDLE", "GLANCE_AWAY", "STEP_BACK", "NERVOUS_WARNING"}

    presence_config = json.loads((ROOT / "config/elliot_presence_spec.json").read_text(encoding="utf-8"))
    assert set(presence_config) == {"profile", "latency", "procedural_limits", "reposition"}
    assert presence_config["latency"]["notice_min_s"] < presence_config["latency"]["notice_max_s"]
    assert presence_config["reposition"]["step_distance_m"] > 0

    perception = (ROOT / "scripts/player_perception.gd").read_text(encoding="utf-8")
    events = set(re.findall(r'&"(On[A-Za-z]+)"', perception))
    controller = (ROOT / "scripts/npc_behaviour_controller.gd").read_text(encoding="utf-8")
    events |= set(re.findall(r'&"(On[A-Za-z]+)"', controller))
    assert set(config["events"]) <= events

    required_nodes = {
        "BehaviourEvents", "PlayerPerception", "BehaviourController", "PerceptionDebug",
        "SocialState", "SpatialRepositioner", "PresenceController", "AttentionController",
    }
    scene_nodes = set(re.findall(r'\[node name="([^"]+)"', scene))
    assert required_nodes <= scene_nodes

    print("GODOT_SCAFFOLD_STATIC_OK")
    print(f"resources={len(resources)} scripts={len(list((ROOT/'scripts').glob('*.gd')))} events={len(events)} states=7")


if __name__ == "__main__":
    main()
