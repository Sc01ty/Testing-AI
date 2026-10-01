class_name AttentionController
extends Node

enum TargetMode { NONE, PLAYER_FACE, PLAYER_BODY, NEAR_PLAYER, FLOOR, SIDE, RANDOM_ENVIRONMENT_POINT }

@export var character_root: Node
@export var observer: Node3D
@export var target: Node3D
@export_file("*.json") var config_path: String = "res://config/elliot_presence_spec.json"
@export_range(10.0, 120.0) var turn_speed_degrees: float = 52.0

var mode: int = TargetMode.NONE
var skeleton: Skeleton3D
var head_bone: int = -1
var chest_bone: int = -1
var left_arm_bone: int = -1
var right_arm_bone: int = -1
var procedural_weight: float = 0.0
var lean_away: float = 0.0
var upper_body_turn: float = 0.0
var weight_shift: float = 0.0
var arm_tension: float = 0.0
var environment_point: Vector3 = Vector3.ZERO
var limits: Dictionary = {}
var _breath_time: float = 0.0
var _side_sign: float = 1.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	process_priority = 100
	var config: Dictionary = _load_json(config_path)
	limits = config.get("procedural_limits", {})
	_rng.seed = 0xE1107
	skeleton = _find_skeleton(character_root)
	if skeleton:
		head_bone = skeleton.find_bone("Head")
		chest_bone = skeleton.find_bone("Chest")
		left_arm_bone = skeleton.find_bone("LeftUpperArm")
		right_arm_bone = skeleton.find_bone("RightUpperArm")
	_choose_environment_point()


func _process(delta: float) -> void:
	if not skeleton or head_bone < 0 or not observer:
		return
	_breath_time += delta
	var desired_weight: float = 0.0 if mode == TargetMode.NONE else 1.0
	procedural_weight = lerpf(procedural_weight, desired_weight, 1.0 - exp(-4.2 * delta))
	var look_point: Vector3 = _attention_point()
	var yaw: float = 0.0
	var pitch: float = 0.0
	if procedural_weight > 0.001 and look_point != Vector3.ZERO:
		var head_world: Vector3 = skeleton.to_global(skeleton.get_bone_global_pose(head_bone).origin)
		var local_direction: Vector3 = skeleton.global_basis.inverse() * (look_point - head_world).normalized()
		var yaw_limit: float = deg_to_rad(float(limits.get("head_yaw_degrees", 28.0)))
		var pitch_limit: float = deg_to_rad(float(limits.get("head_pitch_degrees", 16.0)))
		yaw = clampf(atan2(-local_direction.x, -local_direction.z), -yaw_limit, yaw_limit)
		pitch = clampf(asin(local_direction.y), -pitch_limit, pitch_limit)
	_apply_additive_pose(yaw, pitch, delta)


func set_attention(next_mode: int) -> void:
	if next_mode == mode:
		return
	mode = next_mode
	if mode == TargetMode.SIDE:
		_side_sign *= -1.0
	elif mode == TargetMode.RANDOM_ENVIRONMENT_POINT:
		_choose_environment_point()


func set_body_expression(next_lean_away: float, next_turn: float, next_weight_shift: float, next_arm_tension: float) -> void:
	lean_away = clampf(next_lean_away, -1.0, 1.0)
	upper_body_turn = clampf(next_turn, -1.0, 1.0)
	weight_shift = clampf(next_weight_shift, -1.0, 1.0)
	arm_tension = clampf(next_arm_tension, 0.0, 1.0)


func attention_name() -> StringName:
	return StringName(TargetMode.keys()[mode])


func current_attention_point() -> Vector3:
	return _attention_point()


func look_at_player() -> void:
	set_attention(TargetMode.PLAYER_FACE)


func break_eye_contact() -> void:
	set_attention(TargetMode.SIDE)


func return_neutral() -> void:
	set_attention(TargetMode.NONE)
	set_body_expression(0.0, 0.0, 0.0, 0.0)


func _attention_point() -> Vector3:
	if not target:
		return Vector3.ZERO
	match mode:
		TargetMode.PLAYER_FACE:
			return target.global_position
		TargetMode.PLAYER_BODY:
			return target.global_position - Vector3.UP * 0.55
		TargetMode.NEAR_PLAYER:
			return target.global_position + target.global_basis.x * 0.55 * _side_sign - Vector3.UP * 0.15
		TargetMode.FLOOR:
			var toward_player: Vector3 = target.global_position - observer.global_position
			toward_player.y = 0.0
			return observer.global_position + toward_player.normalized() * 1.4 + Vector3.UP * 0.08
		TargetMode.SIDE:
			return observer.global_position + observer.global_basis.x * 1.8 * _side_sign + Vector3.UP * 1.25
		TargetMode.RANDOM_ENVIRONMENT_POINT:
			return environment_point
	return Vector3.ZERO


func _apply_additive_pose(yaw: float, pitch: float, delta: float) -> void:
	var blend: float = clampf(delta * deg_to_rad(turn_speed_degrees) * 2.2, 0.0, 1.0)
	var head_base: Quaternion = skeleton.get_bone_pose_rotation(head_bone)
	var head_offset: Quaternion = Quaternion(Vector3.UP, yaw * procedural_weight) * Quaternion(Vector3.RIGHT, -pitch * procedural_weight)
	skeleton.set_bone_pose_rotation(head_bone, head_base.slerp(head_offset * head_base, blend))

	if chest_bone >= 0:
		var chest_base: Quaternion = skeleton.get_bone_pose_rotation(chest_bone)
		var chest_yaw: float = yaw * 0.24 * procedural_weight + deg_to_rad(float(limits.get("chest_yaw_degrees", 8.0))) * upper_body_turn
		var lean: float = deg_to_rad(float(limits.get("lean_degrees", 4.0))) * lean_away
		var shift: float = deg_to_rad(float(limits.get("weight_shift_degrees", 1.4))) * weight_shift
		var breath: float = sin(_breath_time * 2.1) * deg_to_rad(float(limits.get("breathing_degrees", 0.45)))
		var chest_offset: Quaternion = Quaternion(Vector3.UP, chest_yaw) * Quaternion(Vector3.RIGHT, lean + breath) * Quaternion(Vector3.FORWARD, shift)
		skeleton.set_bone_pose_rotation(chest_bone, chest_base.slerp(chest_offset * chest_base, blend))

	var arm_angle: float = deg_to_rad(float(limits.get("arm_fidget_degrees", 2.2))) * arm_tension
	if left_arm_bone >= 0:
		var left_base: Quaternion = skeleton.get_bone_pose_rotation(left_arm_bone)
		skeleton.set_bone_pose_rotation(left_arm_bone, left_base.slerp(Quaternion(Vector3.FORWARD, -arm_angle) * left_base, blend))
	if right_arm_bone >= 0:
		var right_base: Quaternion = skeleton.get_bone_pose_rotation(right_arm_bone)
		skeleton.set_bone_pose_rotation(right_arm_bone, right_base.slerp(Quaternion(Vector3.FORWARD, arm_angle * 0.75) * right_base, blend))


func _choose_environment_point() -> void:
	if not observer:
		return
	var angle: float = _rng.randf_range(-1.3, 1.3)
	var distance: float = _rng.randf_range(2.2, 4.5)
	environment_point = observer.global_position + Vector3(sin(angle), _rng.randf_range(0.7, 1.6), -cos(angle)) * distance


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child: Node in node.get_children():
		var found: Skeleton3D = _find_skeleton(child)
		if found:
			return found
	return null


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing presence config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
