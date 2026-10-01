class_name PhoneController
extends Node

## Owns the phone prop and the sequences that use it.
##
## The prop is a separate GLB parented to a BoneAttachment3D on RightHand, so it
## genuinely follows the hand instead of being a floating object placed near it.
## Visibility is driven by the manifest's per-clip `phone_visible` flag, which
## means a clip cannot forget to hide it.

signal sequence_finished(kind: String)
signal sequence_interrupted(kind: String, at_step: int)

enum State { HIDDEN, IN_HAND, AT_EAR }

@export var character_root: Node3D
@export var animator: NPCAnimator
@export var event_bus: BehaviourEventBus

const PHONE_SCENE: String = "res://assets/elliot_phone.glb"
const ATTACH_BONE_FALLBACK: String = "RightHand"

var state: int = State.HIDDEN
var attachment: BoneAttachment3D
var phone: Node3D
var sequence: Array = []
var sequence_kind: String = ""
var step_index: int = 0
var step_remaining: float = 0.0
var running: bool = false

var attach_offset: Vector3 = Vector3(0.0, -0.045, 0.012)
var attach_rotation: Vector3 = Vector3(12.0, 0.0, -8.0)


func _ready() -> void:
	_read_manifest_offsets()
	_build_attachment()
	_set_visible(false)


func _read_manifest_offsets() -> void:
	if animator == null or animator.library == null:
		return
	var phone_config: Dictionary = animator.library.manifest.get("phone", {}) as Dictionary
	var offset: Array = phone_config.get("attach_offset_m", []) as Array
	if offset.size() == 3:
		attach_offset = Vector3(float(offset[0]), float(offset[1]), float(offset[2]))
	var rotation: Array = phone_config.get("attach_rotation_deg", []) as Array
	if rotation.size() == 3:
		attach_rotation = Vector3(float(rotation[0]), float(rotation[1]), float(rotation[2]))


func _build_attachment() -> void:
	var skeleton: Skeleton3D = _find_skeleton(character_root)
	if skeleton == null:
		push_warning("PhoneController: no Skeleton3D found; phone will not attach.")
		return

	var bone_name: String = ATTACH_BONE_FALLBACK
	if animator and animator.library:
		var phone_config: Dictionary = animator.library.manifest.get("phone", {}) as Dictionary
		bone_name = String(phone_config.get("attach_bone", ATTACH_BONE_FALLBACK))
	if skeleton.find_bone(bone_name) < 0:
		push_warning("PhoneController: bone '" + bone_name + "' not in skeleton.")
		return

	attachment = BoneAttachment3D.new()
	attachment.name = "PhoneSocket"
	skeleton.add_child(attachment)
	attachment.bone_name = bone_name

	var packed: PackedScene = load(PHONE_SCENE) as PackedScene
	if packed == null:
		push_warning("PhoneController: could not load " + PHONE_SCENE)
		return
	phone = packed.instantiate() as Node3D
	phone.name = "Phone"
	attachment.add_child(phone)
	_apply_offsets()


func _apply_offsets() -> void:
	if phone == null:
		return
	phone.position = attach_offset
	phone.rotation = Vector3(
		deg_to_rad(attach_rotation.x), deg_to_rad(attach_rotation.y), deg_to_rad(attach_rotation.z))


## Live tuning from the debug keys, so the offset can be dialled in visually.
func nudge_offset(delta_offset: Vector3, delta_rotation: Vector3) -> void:
	attach_offset += delta_offset
	attach_rotation += delta_rotation
	_apply_offsets()


func _process(delta: float) -> void:
	# The manifest decides when the phone is in shot; this keeps prop and clip
	# in agreement without every sequence having to remember.
	if animator:
		var should_show: bool = animator.current_shows_phone()
		if should_show != (state != State.HIDDEN):
			_set_visible(should_show)
		if should_show:
			state = State.AT_EAR if animator.current_clip.begins_with("PHONE_TALK") \
				or animator.current_clip.begins_with("PHONE_LISTEN") \
				or animator.current_clip == "PHONE_RAISE_TO_EAR" else State.IN_HAND

	if not running:
		return
	step_remaining -= delta
	if step_remaining <= 0.0:
		_advance()


func _set_visible(value: bool) -> void:
	if phone:
		phone.visible = value
	if not value:
		state = State.HIDDEN


# --- sequences ----------------------------------------------------------------

func start_check_phone() -> bool:
	return _start("CHECK_PHONE", [
		{"pool": "PHONE_OUT", "hold": 0.0},
		{"pool": "PHONE_USE", "hold": 2.2},
		{"pool": "PHONE_USE", "hold": 2.0},
		{"pool": "PHONE_STOW", "hold": 0.0},
	])


func start_incoming_call() -> bool:
	# No audio yet; the ring is represented by the notice beat and timing only.
	return _start("INCOMING_CALL", [
		{"pool": "PHONE_START", "hold": 0.25},
		{"pool": "PHONE_OUT", "hold": 0.0},
		{"pool": "PHONE_ANSWER", "hold": 0.0},
		{"pool": "PHONE_CALL", "hold": 3.4},
		{"pool": "PHONE_CALL", "hold": 3.0},
		{"pool": "PHONE_HANG_UP", "hold": 0.0},
		{"pool": "PHONE_STOW", "hold": 0.0},
	])


func _start(kind: String, steps: Array) -> bool:
	if running:
		return false
	sequence = steps
	sequence_kind = kind
	step_index = -1
	running = true
	_advance()
	if event_bus:
		event_bus.emit_behaviour(&"OnAmbientStarted", {"priority": 10, "activity": kind})
	return true


func _advance() -> void:
	step_index += 1
	if step_index >= sequence.size():
		running = false
		sequence_kind = ""
		sequence_finished.emit(sequence_kind)
		return
	var step: Dictionary = sequence[step_index] as Dictionary
	var pool: String = String(step.get("pool", "PHONE_USE"))
	if animator:
		animator.request(pool, 20, 0.0, true)
		step_remaining = animator.duration_of(pool) + float(step.get("hold", 0.0))
	else:
		step_remaining = 1.0


## Player pressure interrupts phone use. `hard` cancels outright; otherwise he
## lowers the phone, deals with the player, and the caller may resume.
func interrupt(hard: bool) -> void:
	if not running:
		return
	var at: int = step_index
	if hard:
		running = false
		if animator:
			animator.request("PHONE_STOW", 45, 0.0, true)
		sequence_interrupted.emit(sequence_kind, at)
		sequence_kind = ""
		return

	if state == State.AT_EAR and animator:
		animator.request("PHONE_INTERRUPTED", 45, 0.0, true)
		step_remaining = maxf(step_remaining, animator.duration_of("PHONE_INTERRUPTED"))
	sequence_interrupted.emit(sequence_kind, at)


func is_busy() -> bool:
	return running


func state_name() -> String:
	return ["HIDDEN", "IN_HAND", "AT_EAR"][state]


func _find_skeleton(node: Node) -> Skeleton3D:
	if node == null:
		return null
	if node is Skeleton3D:
		return node as Skeleton3D
	for child: Node in node.get_children():
		var found: Skeleton3D = _find_skeleton(child)
		if found:
			return found
	return null


func debug_snapshot() -> Dictionary:
	return {
		"phone_state": state_name(),
		"attached": attachment != null and phone != null,
		"sequence": sequence_kind if running else "NONE",
		"step": step_index,
		"offset": attach_offset,
	}
