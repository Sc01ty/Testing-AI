class_name ContactResponder
extends Node

## Turns physical player contact into a readable reaction.
##
## Detection is proximity + closing speed rather than a collision callback.
## move_and_slide can report many small contacts per frame while the player leans
## on the NPC, which would machine-gun the recoil animation; a closing-speed test
## with a cooldown only fires on a genuine bump.

signal contacted(strength: String, info: Dictionary)

@export var body: CharacterBody3D
@export var player: PlayerBody
@export var animator: NPCAnimator
@export var locomotion: LocomotionController
@export var event_bus: BehaviourEventBus
@export var social_state: Node

## Sum of both capsule radii plus a little tolerance.
const CONTACT_DISTANCE: float = 0.72
const COOLDOWN_S: float = 0.85
## Below this closing speed a touch is contact, not an impact.
const LIGHT_SPEED: float = 0.25
const NORMAL_SPEED: float = 1.05
const STRONG_SPEED: float = 2.15

const PUSH: Dictionary = {"LIGHT": 0.06, "NORMAL": 0.17, "STRONG": 0.34}
const POOLS: Dictionary = {"LIGHT": "IMPACT_LIGHT", "NORMAL": "IMPACT_MEDIUM", "STRONG": "IMPACT_HEAVY"}
const PRIORITY: Dictionary = {"LIGHT": 55, "NORMAL": 80, "STRONG": 95}

var cooldown: float = 0.0
var last_class: String = "NONE"
var last_impact_vector: Vector3 = Vector3.ZERO
var last_side: String = "NONE"
var contact_count: int = 0
var _recovery_pending: float = 0.0


func _physics_process(delta: float) -> void:
	cooldown = maxf(0.0, cooldown - delta)

	if _recovery_pending > 0.0:
		_recovery_pending = maxf(0.0, _recovery_pending - delta)
		if _recovery_pending <= 0.0 and animator:
			animator.request("RECOVER_BALANCE", 70, 0.0)

	if body == null or player == null:
		return

	var offset: Vector3 = body.global_position - player.global_position
	offset.y = 0.0
	var distance: float = offset.length()
	if distance < 0.0001:
		return
	# A genuine slide collision counts even when the capsules settle further
	# apart than a fixed radius test would allow.
	if not player.touching_npc and distance > CONTACT_DISTANCE:
		return

	var direction: Vector3 = offset / distance
	# Only the component of the player's velocity heading INTO Elliot counts, and
	# it must be the INTENDED velocity: move_and_slide has already cancelled the
	# real one against Elliot's capsule by the time this runs.
	var closing_speed: float = player.intended_velocity.dot(direction)
	if closing_speed <= LIGHT_SPEED or cooldown > 0.0:
		# Still resolve overlap so the player can never end up inside him.
		_resolve_overlap(distance, direction)
		return

	var strength: String = "LIGHT"
	if closing_speed >= STRONG_SPEED:
		strength = "STRONG"
	elif closing_speed >= NORMAL_SPEED:
		strength = "NORMAL"

	_apply_contact(strength, direction, closing_speed)


## Gentle separation, so leaning on him pushes rather than letting the player
## occupy the same space. Deliberately small: he is a person, not a door.
func _resolve_overlap(distance: float, direction: Vector3) -> void:
	var overlap: float = CONTACT_DISTANCE - distance
	if overlap <= 0.01:
		return
	body.global_position += direction * minf(overlap, 0.04)


func _apply_contact(strength: String, direction: Vector3, closing_speed: float) -> void:
	cooldown = COOLDOWN_S
	last_class = strength
	last_impact_vector = direction * closing_speed
	contact_count += 1
	last_side = _side_of_contact(direction)

	if animator:
		animator.request(String(POOLS[strength]), int(PRIORITY[strength]), 0.0, true)

	# Displacement must accompany the recoil or the animation looks weightless.
	var push: float = float(PUSH[strength])
	if locomotion and strength != "LIGHT":
		var moved: bool = locomotion.retreat_from(
			player.global_position,
			push * 4.0,
			"BACKPEDAL" if strength == "STRONG" else "BACK_CAUTIOUS")
		if not moved:
			body.global_position += direction * push
	else:
		body.global_position += direction * push

	if strength == "STRONG":
		# Catch-the-balance beat after the stumble finishes.
		_recovery_pending = animator.duration_of("IMPACT_HEAVY") * 0.75 if animator else 0.6

	var info: Dictionary = {
		"strength": strength,
		"closing_speed": closing_speed,
		"direction": direction,
		"side": last_side,
		"count": contact_count,
	}
	contacted.emit(strength, info)

	# Contact is a boundary event, and repeated contact is a deliberate one.
	if event_bus:
		event_bus.emit_behaviour(&"OnPlayerTooClose", {
			"priority": int(PRIORITY[strength]),
			"source": "contact",
			"strength": strength,
			"count": contact_count,
		})
		if contact_count >= 3:
			event_bus.emit_behaviour(&"OnRepeatedBoundaryViolation", {
				"priority": 70, "source": "contact", "count": contact_count,
			})

	if social_state and social_state.has_method("apply_contact"):
		social_state.apply_contact(strength, contact_count)


func _side_of_contact(direction: Vector3) -> String:
	if body == null:
		return "NONE"
	var forward: Vector3 = -body.global_transform.basis.z
	var right: Vector3 = body.global_transform.basis.x
	var facing: float = forward.dot(-direction)
	var lateral: float = right.dot(-direction)
	if absf(facing) >= absf(lateral):
		return "FRONT" if facing > 0.0 else "REAR"
	return "RIGHT" if lateral > 0.0 else "LEFT"


func debug_snapshot() -> Dictionary:
	return {
		"collision_class": last_class,
		"impact_vector": last_impact_vector,
		"side": last_side,
		"contacts": contact_count,
		"cooldown": cooldown,
	}
