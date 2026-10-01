"""Deterministic reference simulation for Elliot's perception/state rules.

This does not claim Godot runtime coverage. It exercises the shared JSON values
and the same hysteresis, decay, escalation, and transition ideas headlessly.
"""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "GodotTest/config/elliot_behavior_spec.json").read_text())


class Sim:
    def __init__(self):
        self.distance = 8.0
        self.smoothed = 8.0
        self.stare = 0.0
        self.personal = False
        self.close = 0.0
        self.violations = 0.0
        self.nervous = 0.0
        self.aware = False
        self.followed = False
        self.follow_memory = 0.0
        self.step_timer = -1.0
        self.step_distance = 0.0
        self.state = "CALM_IDLE"
        self.elapsed = 0.0
        self.trace = [self.state]
        self.cooldowns = {"GLANCE_AWAY": 0.0, "STEP_BACK": 0.0, "NERVOUS_WARNING": 0.0}
        self.warning_latched = False
        self.boundary_response_latched = False

    def tick(self, distance, looking, dt=0.05, visible=True):
        r, t, m, n = CFG["ranges"], CFG["timing"], CFG["motion"], CFG["nervousness"]
        previous = self.smoothed
        self.distance = distance
        a = 1 - math.exp(-m["distance_smoothing_hz"] * dt)
        self.smoothed += (distance - self.smoothed) * a
        velocity = (previous - self.smoothed) / dt
        approaching = velocity > m["approach_speed_mps"]
        sensed = visible or distance <= r["emergency_presence_m"]
        self.aware = sensed and distance <= (r["awareness_exit_m"] if self.aware else r["awareness_enter_m"])
        self.stare = self.stare + dt if looking and self.aware else max(0.0, self.stare - dt * 1.8)

        was_personal = self.personal
        self.personal = distance < (r["personal_exit_m"] if self.personal else r["personal_enter_m"])
        self.close = self.close + dt if self.personal else max(0.0, self.close - dt * 2)
        if self.personal and not was_personal:
            self.violations += 1

        self.violations *= 0.5 ** (dt / n["violation_half_life_s"])
        if self.step_timer >= 0:
            self.step_timer += dt
            if self.step_timer >= t["follow_check_delay_s"] and distance - self.step_distance <= m["followed_distance_gain_m"]:
                self.followed = True
                self.follow_memory = n["follow_memory_s"]
                self.violations += 1
                self.step_timer = -1
            elif self.step_timer >= t["follow_window_s"]:
                self.step_timer = -1
        self.follow_memory = max(0, self.follow_memory - dt)
        if self.follow_memory == 0:
            self.followed = False

        proximity = max(0.0, min(1.0, (distance-r["awareness_exit_m"])/(r["personal_enter_m"]-r["awareness_exit_m"])))
        pressure = proximity*.34 + min(self.stare/t["long_stare_s"], 1)*.28
        pressure += .13 if approaching and self.aware else 0
        pressure += min(self.violations/3, 1)*.22
        pressure += .24 if self.followed else 0
        pressure += .18 if self.personal else 0
        pressure = min(1.0, pressure)
        rate = n["rise_hz"] if pressure > self.nervous else n["fall_hz"]
        self.nervous += (pressure-self.nervous) * (1-math.exp(-rate*dt))
        self.elapsed += dt
        if not self.personal:
            self.boundary_response_latched = False
        for key in self.cooldowns:
            self.cooldowns[key] = max(0.0, self.cooldowns[key] - dt)
        self._transition(t, n)

    def run(self, seconds, distance, looking, visible=True):
        for _ in range(round(seconds/.05)):
            self.tick(distance, looking, visible=visible)

    def _set(self, state):
        if state != self.state:
            self.state, self.elapsed = state, 0.0
            self.trace.append(state)
            if state in self.cooldowns:
                self.cooldowns[state] = CFG["animation"][state]["cooldown_s"]
            if state == "WARNING":
                self.warning_latched = True
            elif state == "CALM_IDLE":
                self.warning_latched = False
            if state == "STEP_BACK":
                self.boundary_response_latched = True
                self.step_timer, self.step_distance = 0.0, self.distance

    def _transition(self, t, n):
        if self.state not in {"STEP_BACK", "WARNING"}:
            if (not self.warning_latched and self.cooldowns["NERVOUS_WARNING"] <= 0
                    and ((self.followed and self.nervous >= .42)
                         or (math.ceil(self.violations) >= 2 and self.nervous >= .5))):
                return self._set("WARNING")
            if (not self.warning_latched and not self.boundary_response_latched
                    and self.cooldowns["STEP_BACK"] <= 0 and self.personal
                    and self.close >= t["close_dwell_s"]):
                return self._set("STEP_BACK")
        if self.state == "CALM_IDLE" and self.aware and self.nervous >= n["watching_threshold"]:
            self._set("WATCHING_PLAYER")
        elif self.state == "WATCHING_PLAYER":
            if self.cooldowns["GLANCE_AWAY"] <= 0 and self.stare >= t["glance_stare_s"]: self._set("GLANCE_AWAY")
            elif self.nervous >= n["nervous_idle_threshold"]: self._set("NERVOUS_IDLE")
        elif self.state == "NERVOUS_IDLE" and self.cooldowns["GLANCE_AWAY"] <= 0 and self.stare >= t["glance_stare_s"]:
            self._set("GLANCE_AWAY")
        elif self.state == "GLANCE_AWAY" and self.elapsed >= CFG["animation"]["GLANCE_AWAY"]["duration_s"]:
            self._set("NERVOUS_IDLE")
        elif self.state == "STEP_BACK" and self.elapsed >= CFG["animation"]["STEP_BACK"]["duration_s"]:
            self._set("WARNING" if self.followed or math.ceil(self.violations) >= 2 else "NERVOUS_IDLE")
        elif self.state == "WARNING" and self.elapsed >= CFG["animation"]["NERVOUS_WARNING"]["duration_s"]:
            self._set("NERVOUS_IDLE")
        elif self.state in {"WATCHING_PLAYER", "NERVOUS_IDLE"} and not self.aware and self.nervous < n["recovery_threshold"]:
            self._set("RECOVERING")
        elif self.state == "RECOVERING" and self.elapsed >= t["recover_state_s"]:
            self._set("CALM_IDLE")


def main():
    calm = Sim(); calm.run(3, 5.0, False)
    assert "GLANCE_AWAY" not in calm.trace and "STEP_BACK" not in calm.trace

    stare = Sim(); stare.run(3.4, 2.8, True)
    assert "WATCHING_PLAYER" in stare.trace and "GLANCE_AWAY" in stare.trace
    assert stare.trace.count("GLANCE_AWAY") == 1

    boundary = Sim(); boundary.run(.8, 1.3, False)
    assert "STEP_BACK" in boundary.trace

    hysteresis = Sim(); hysteresis.run(.4, 1.4, False)
    initial = math.ceil(hysteresis.violations)
    for d in [1.68, 1.48] * 8: hysteresis.tick(d, False)
    assert hysteresis.personal and math.ceil(hysteresis.violations) == initial

    followed = Sim(); followed.run(.8, 1.25, False); followed.run(2.0, 1.25, False)
    assert followed.followed and "WARNING" in followed.trace

    sustained = Sim(); sustained.run(15, 1.25, False)
    assert sustained.trace.count("STEP_BACK") == 1 and sustained.trace.count("WARNING") == 1

    recovery = Sim(); recovery.run(.8, 1.3, False); recovery.run(28, 7.2, False, visible=False)
    assert recovery.state in {"RECOVERING", "CALM_IDLE"}
    assert recovery.trace.count("WARNING") <= 2

    print("PERCEPTION_BEHAVIOUR_SIM_OK")
    print("calm:", " -> ".join(calm.trace))
    print("stare:", " -> ".join(stare.trace))
    print("boundary:", " -> ".join(boundary.trace))
    print("followed:", " -> ".join(followed.trace))
    print("sustained:", " -> ".join(sustained.trace))
    print("recovery:", " -> ".join(recovery.trace))


if __name__ == "__main__":
    main()
