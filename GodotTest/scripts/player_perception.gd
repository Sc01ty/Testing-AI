class_name PlayerPerception
extends Node

signal perception_event(event_name: StringName, context: Dictionary)
signal snapshot_updated(snapshot: Dictionary)

@export var observer: Node3D
@export var target: Node3D
@export var event_bus: BehaviourEventBus
@export_file("*.json") var config_path: String = "res://config/elliot_behavior_spec.json"
@export_flags_3d_physics var visibility_mask: int = 1

var config: Dictionary = {}
var distance: float = INF
var smoothed_distance: float = INF
var distance_velocity: float = 0.0 # Positive means approaching Elliot.
var can_see_player: bool = false
var aware: bool = false
var looking_at_elliot: bool = false
var staring_time: float = 0.0
var close_time: float = 0.0
var in_personal_space: bool = false
var approaching: bool = false
var moving_away: bool = false
var nervousness: float = 0.0
var recent_violations: float = 0.0
var followed_after_step_back: bool = false
var time_since_incident: float = 999.0

var _notice_dwell: float = 0.0
var _noticed_this_visit: bool = false
var _long_stare_emitted: bool = false
var _step_back_active: bool = false
var _step_back_elapsed: float = 0.0
var _step_back_start_distance: float = 0.0
var _follow_memory_remaining: float = 0.0


func _ready() -> void:
	config = _load_json(config_path)
	if observer and target:
		distance = _horizontal_distance(observer.global_position, target.global_position)
		smoothed_distance = distance


func _physics_process(delta: float) -> void:
	if not observer or not target or config.is_empty():
		return
	var ranges: Dictionary = config["ranges"]
	var timing: Dictionary = config["timing"]
	var motion: Dictionary = config["motion"]
	var nerves: Dictionary = config["nervousness"]

	var previous_distance: float = smoothed_distance
	distance = _horizontal_distance(observer.global_position, target.global_position)
	var smoothing: float = 1.0 - exp(-float(motion["distance_smoothing_hz"]) * delta)
	smoothed_distance = lerpf(smoothed_distance, distance, smoothing)
	distance_velocity = (previous_distance - smoothed_distance) / maxf(delta, 0.001)
	approaching = distance_velocity > float(motion["approach_speed_mps"])
	moving_away = distance_velocity < -float(motion["moving_away_speed_mps"])

	can_see_player = _can_observer_see_target(float(ranges["field_of_view_degrees"]))
	var sensed: bool = can_see_player or distance <= float(ranges["emergency_presence_m"])
	if aware:
		aware = sensed and distance <= float(ranges["awareness_exit_m"])
	else:
		aware = sensed and distance <= float(ranges["awareness_enter_m"])

	looking_at_elliot = aware and can_see_player and _is_target_looking(float(ranges["player_gaze_degrees"]))
	staring_time = staring_time + delta if looking_at_elliot else maxf(0.0, staring_time - delta * 1.8)

	var was_personal: bool = in_personal_space
	if in_personal_space:
		in_personal_space = distance < float(ranges["personal_exit_m"])
	else:
		in_personal_space = distance < float(ranges["personal_enter_m"])
	close_time = close_time + delta if in_personal_space else maxf(0.0, close_time - delta * 2.0)

	if in_personal_space and not was_personal:
		recent_violations += 1.0
		_mark_incident()
		_emit_event(&"OnPlayerTooClose")
		if recent_violations >= 2.0:
			_emit_event(&"OnRepeatedBoundaryViolation")
	elif was_personal and not in_personal_space and moving_away:
		_emit_event(&"OnPlayerBackedOff")

	if aware:
		_notice_dwell += delta
		if not _noticed_this_visit and _notice_dwell >= float(timing["notice_dwell_s"]):
			_noticed_this_visit = true
			_emit_event(&"OnPlayerNoticed")
	else:
		_notice_dwell = 0.0
		_noticed_this_visit = false

	if staring_time >= float(timing["long_stare_s"]) and not _long_stare_emitted:
		_long_stare_emitted = true
		_mark_incident()
		_emit_event(&"OnLongStare")
	elif staring_time < float(timing["glance_stare_s"]) * 0.55:
		_long_stare_emitted = false

	_update_step_back_memory(delta, timing, motion)
	time_since_incident += delta
	var half_life: float = float(nerves["violation_half_life_s"])
	recent_violations *= pow(0.5, delta / half_life)
	_follow_memory_remaining = maxf(0.0, _follow_memory_remaining - delta)
	if _follow_memory_remaining <= 0.0:
		followed_after_step_back = false

	var proximity: float = clampf(inverse_lerp(float(ranges["awareness_exit_m"]), float(ranges["personal_enter_m"]), distance), 0.0, 1.0)
	var pressure: float = proximity * 0.34
	pressure += clampf(staring_time / float(timing["long_stare_s"]), 0.0, 1.0) * 0.28
	pressure += 0.13 if approaching and aware else 0.0
	pressure += minf(recent_violations / 3.0, 1.0) * 0.22
	pressure += 0.24 if followed_after_step_back else 0.0
	pressure += 0.18 if in_personal_space else 0.0
	pressure = clampf(pressure, 0.0, 1.0)
	var rate: float = float(nerves["rise_hz"]) if pressure > nervousness else float(nerves["fall_hz"])
	nervousness = lerpf(nervousness, pressure, 1.0 - exp(-rate * delta))
	snapshot_updated.emit(snapshot())


func notify_step_back() -> void:
	_step_back_active = true
	_step_back_elapsed = 0.0
	_step_back_start_distance = distance
	_emit_event(&"OnStepBack")


func snapshot() -> Dictionary:
	return {
		"distance": distance,
		"smoothed_distance": smoothed_distance,
		"distance_velocity": distance_velocity,
		"can_see_player": can_see_player,
		"aware": aware,
		"looking_at_elliot": looking_at_elliot,
		"stare_time": staring_time,
		"approaching": approaching,
		"moving_away": moving_away,
		"in_personal_space": in_personal_space,
		"close_time": close_time,
		"followed_after_step_back": followed_after_step_back,
		"nervousness": nervousness,
		"recent_violations": int(ceil(recent_violations)),
		"time_since_incident": time_since_incident,
	}


func _update_step_back_memory(delta: float, timing: Dictionary, motion: Dictionary) -> void:
	if not _step_back_active:
		return
	_step_back_elapsed += delta
	if _step_back_elapsed >= float(timing["follow_window_s"]):
		_step_back_active = false
		return
	if _step_back_elapsed < float(timing["follow_check_delay_s"]):
		return
	var gained_distance: float = distance - _step_back_start_distance
	if gained_distance <= float(motion["followed_distance_gain_m"]) or approaching:
		_step_back_active = false
		followed_after_step_back = true
		_follow_memory_remaining = float(config["nervousness"]["follow_memory_s"])
		recent_violations += 1.0
		_mark_incident()
		_emit_event(&"OnPlayerFollowed")


func _can_observer_see_target(fov_degrees: float) -> bool:
	var eye: Vector3 = observer.global_position + Vector3.UP * 1.58
	var to_player: Vector3 = target.global_position - eye
	if to_player.length_squared() < 0.0001:
		return true
	var forward: Vector3 = -observer.global_basis.z.normalized()
	var within_fov: bool = forward.dot(to_player.normalized()) >= cos(deg_to_rad(fov_degrees * 0.5))
	return within_fov and _line_of_sight_clear(eye, target.global_position)


func _is_target_looking(gaze_degrees: float) -> bool:
	var target_forward: Vector3 = -target.global_basis.z.normalized()
	var to_elliot: Vector3 = (observer.global_position + Vector3.UP * 1.58 - target.global_position).normalized()
	return target_forward.dot(to_elliot) >= cos(deg_to_rad(gaze_degrees))


func _line_of_sight_clear(from: Vector3, to: Vector3) -> bool:
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, visibility_mask)
	var hit: Dictionary = observer.get_world_3d().direct_space_state.intersect_ray(query)
	return hit.is_empty()


func _horizontal_distance(a: Vector3, b: Vector3) -> float:
	var delta: Vector3 = b - a
	delta.y = 0.0
	return delta.length()


func _mark_incident() -> void:
	time_since_incident = 0.0


func _emit_event(event_name: StringName) -> void:
	var context: Dictionary = snapshot()
	perception_event.emit(event_name, context)
	if event_bus:
		event_bus.emit_behaviour(event_name, context)


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing perception config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
