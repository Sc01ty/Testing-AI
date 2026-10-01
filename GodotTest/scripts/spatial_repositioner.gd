class_name SpatialRepositioner
extends Node

signal movement_started(destination: Vector3)
signal movement_finished(destination: Vector3, blocked: bool)

@export var actor: Node3D
@export var target: Node3D
@export_flags_3d_physics var collision_mask: int = 1
@export_file("*.json") var config_path: String = "res://config/elliot_presence_spec.json"

var moving: bool = false
var blocked: bool = false
var start_position: Vector3 = Vector3.ZERO
var destination: Vector3 = Vector3.ZERO
var elapsed: float = 0.0
var duration: float = 0.72
var settings: Dictionary = {}


func _ready() -> void:
	var config: Dictionary = _load_json(config_path)
	settings = config.get("reposition", {})
	duration = float(settings.get("step_duration_s", 0.72))


func _physics_process(delta: float) -> void:
	if not moving or not actor:
		return
	elapsed += delta
	var progress: float = clampf(elapsed / duration, 0.0, 1.0)
	var eased: float = progress * progress * (3.0 - 2.0 * progress)
	actor.global_position = start_position.lerp(destination, eased)
	if progress >= 1.0:
		moving = false
		movement_finished.emit(destination, blocked)


func request_space() -> bool:
	if moving or not actor or not target:
		return false
	start_position = actor.global_position
	var away: Vector3 = actor.global_position - target.global_position
	away.y = 0.0
	if away.length_squared() < 0.001:
		away = actor.global_basis.z
	away = away.normalized()
	var step_distance: float = float(settings.get("step_distance_m", 0.28))
	var margin: float = float(settings.get("collision_margin_m", 0.12))
	var angles: Array = settings.get("candidate_angles_degrees", [0.0])
	var best_distance: float = 0.0
	var best_destination: Vector3 = start_position
	for angle_value: Variant in angles:
		var candidate_direction: Vector3 = away.rotated(Vector3.UP, deg_to_rad(float(angle_value)))
		var candidate: Vector3 = start_position + candidate_direction * step_distance
		var clear_distance: float = _available_distance(start_position, candidate, margin)
		if clear_distance > best_distance:
			best_distance = clear_distance
			best_destination = start_position + candidate_direction * clear_distance
	blocked = best_distance < step_distance * 0.8
	if best_distance < 0.08:
		movement_finished.emit(start_position, true)
		return false
	destination = best_destination
	elapsed = 0.0
	moving = true
	movement_started.emit(destination)
	return true


func _available_distance(from: Vector3, to: Vector3, margin: float) -> float:
	var origin: Vector3 = from + Vector3.UP * 0.7
	var end: Vector3 = to + Vector3.UP * 0.7
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(origin, end, collision_mask)
	var hit: Dictionary = actor.get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return from.distance_to(to)
	var hit_position: Vector3 = hit.get("position", origin)
	return maxf(0.0, origin.distance_to(hit_position) - margin)


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing reposition config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
