class_name SocialState
extends Node

@export var perception: PlayerPerception
@export var event_bus: BehaviourEventBus
@export_file("*.json") var config_path: String = "res://config/elliot_presence_spec.json"

var nervousness: float = 0.0
var alertness: float = 0.08
var comfort: float = 0.72
var familiarity: float = 0.05
var irritation: float = 0.03
var profile: Dictionary = {}


func _ready() -> void:
	var config: Dictionary = _load_json(config_path)
	profile = config.get("profile", {})
	alertness = float(profile.get("baseline_alertness", 0.08))
	comfort = float(profile.get("baseline_comfort", 0.72))
	familiarity = float(profile.get("baseline_familiarity", 0.05))
	irritation = float(profile.get("baseline_irritation", 0.03))
	if event_bus:
		event_bus.behaviour_event.connect(_on_behaviour_event)


func _process(delta: float) -> void:
	if not perception:
		return
	var p: Dictionary = perception.snapshot()
	nervousness = float(p.get("nervousness", 0.0))
	var alert_target: float = nervousness * 0.72
	if bool(p.get("approaching", false)):
		alert_target += 0.16
	if bool(p.get("looking_at_elliot", false)):
		alert_target += 0.14
	if bool(p.get("in_personal_space", false)):
		alert_target += 0.22
	alert_target = clampf(alert_target, float(profile.get("baseline_alertness", 0.08)), 1.0)
	alertness = _approach_exp(alertness, alert_target, 2.5 if alert_target > alertness else 0.38, delta)

	var comfort_target: float = float(profile.get("baseline_comfort", 0.72))
	comfort_target -= nervousness * 0.48
	comfort_target -= irritation * 0.22
	comfort_target += familiarity * 0.08
	comfort = _approach_exp(comfort, clampf(comfort_target, 0.0, 1.0), 1.6 if comfort_target < comfort else 0.28, delta)

	var irritation_target: float = float(profile.get("baseline_irritation", 0.03))
	if bool(p.get("followed_after_step_back", false)):
		irritation_target += 0.46
	if int(p.get("recent_violations", 0)) >= 2:
		irritation_target += 0.24
	irritation = _approach_exp(irritation, clampf(irritation_target, 0.0, 1.0), 1.8 if irritation_target > irritation else 0.09, delta)

	if bool(p.get("aware", false)) and float(p.get("time_since_incident", 999.0)) > 4.0:
		familiarity = minf(0.45, familiarity + delta * 0.0015)


## Physical contact is a stronger boundary signal than proximity, and repeated
## contact reads as deliberate rather than accidental.
func apply_contact(strength: String, count: int) -> void:
	var magnitude: float = {"LIGHT": 0.08, "NORMAL": 0.22, "STRONG": 0.38}.get(strength, 0.15)
	var repetition: float = clampf(float(count - 1) * 0.06, 0.0, 0.30)
	nervousness = clampf(nervousness + magnitude + repetition, 0.0, 1.0)
	alertness = clampf(alertness + magnitude * 1.1, 0.0, 1.0)
	comfort = clampf(comfort - magnitude * 1.4, 0.0, 1.0)
	irritation = clampf(irritation + magnitude * 0.85 + repetition, 0.0, 1.0)


func snapshot() -> Dictionary:
	return {
		"nervousness": nervousness,
		"alertness": alertness,
		"comfort": comfort,
		"familiarity": familiarity,
		"irritation": irritation,
	}


func _on_behaviour_event(event_name: StringName, _context: Dictionary) -> void:
	match event_name:
		&"OnPlayerNoticed":
			alertness = minf(1.0, alertness + 0.1)
			familiarity = minf(0.45, familiarity + 0.006)
		&"OnLongStare":
			alertness = minf(1.0, alertness + 0.16)
			comfort = maxf(0.0, comfort - 0.08)
		&"OnPlayerTooClose":
			alertness = minf(1.0, alertness + 0.24)
			comfort = maxf(0.0, comfort - 0.2)
		&"OnPlayerFollowed":
			irritation = minf(1.0, irritation + 0.23)
			comfort = maxf(0.0, comfort - 0.2)
		&"OnRepeatedBoundaryViolation":
			irritation = minf(1.0, irritation + 0.16)
		&"OnPlayerBackedOff":
			comfort = minf(1.0, comfort + 0.16)
			irritation = maxf(0.0, irritation - 0.05)
		&"OnRecovered":
			comfort = minf(float(profile.get("baseline_comfort", 0.72)), comfort + 0.12)


func _approach_exp(value: float, target_value: float, rate: float, delta: float) -> float:
	return lerpf(value, target_value, 1.0 - exp(-rate * delta))


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing presence config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
