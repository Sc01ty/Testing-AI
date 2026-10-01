class_name AmbientScheduler
extends Node

## Gives Elliot something to be doing before the player arrives.
##
## Deliberately slow. The goal is not constant entertainment: long stretches of
## standing still are correct, and the success condition is only that walking in
## at a random moment MIGHT catch him mid-activity.
##
## Nothing here runs while the player is applying social pressure - ambient life
## is what he does when left alone.

signal activity_started(activity: String)
signal activity_finished(activity: String)

@export var body: CharacterBody3D
@export var animator: NPCAnimator
@export var locomotion: LocomotionController
@export var phone: PhoneController
@export var perception: PlayerPerception
@export var social_state: Node
@export var behaviour: NPCBehaviourController

## Idle points he may wander between. Kept in code so the test room needs no
## extra scene setup; a real level would read these from markers.
const IDLE_POINTS: Array[Vector3] = [
	Vector3(0.0, 0.0, 0.0),
	Vector3(-2.3, 0.0, -1.2),
	Vector3(2.2, 0.0, -0.9),
	Vector3(-1.5, 0.0, 2.0),
]

const MIN_GAP_S: float = 9.0
const MAX_GAP_S: float = 22.0
## Pressure above which ambient life stops entirely.
const PRESSURE_CUTOFF: float = 0.30

var current_activity: String = "NONE"
var timer: float = 6.0
var active_remaining: float = 0.0
var recent: Array[String] = []
var interrupted_activity: String = ""
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _point_index: int = 0


func _ready() -> void:
	_rng.randomize()
	timer = _rng.randf_range(4.0, 9.0)
	if phone:
		phone.sequence_finished.connect(_on_phone_finished)
		phone.sequence_interrupted.connect(_on_phone_interrupted)


func _process(delta: float) -> void:
	var pressure: float = _pressure()

	if current_activity != "NONE":
		active_remaining = maxf(0.0, active_remaining - delta)
		# A player applying pressure ends ambient life immediately.
		if pressure >= PRESSURE_CUTOFF:
			_interrupt(pressure)
			return
		if active_remaining <= 0.0 and not _activity_still_running():
			_finish()
		return

	if pressure >= PRESSURE_CUTOFF:
		# Hold the timer while he is occupied with the player.
		return

	timer -= delta
	if timer <= 0.0:
		_choose()


func _pressure() -> float:
	if social_state == null:
		return 0.0
	var snapshot: Dictionary = social_state.snapshot()
	return maxf(float(snapshot.get("nervousness", 0.0)), float(snapshot.get("alertness", 0.0)))


func _activity_still_running() -> bool:
	if current_activity.begins_with("PHONE") and phone:
		return phone.is_busy()
	if current_activity == "MOVE_TO_POINT" and locomotion:
		return locomotion.is_busy()
	return false


func _choose() -> void:
	var candidates: Array[Dictionary] = [
		{"name": "STAND", "weight": 3.2},
		{"name": "FIDGET", "weight": 1.5},
		{"name": "LOOK_AROUND", "weight": 1.3},
		{"name": "MOVE_TO_POINT", "weight": 1.1},
		# Phone use is uncommon and calls are rare, on purpose.
		{"name": "PHONE_CHECK", "weight": 0.55},
		{"name": "PHONE_CALL", "weight": 0.12},
	]

	var total: float = 0.0
	for candidate: Dictionary in candidates:
		var weight: float = float(candidate["weight"])
		if String(candidate["name"]) in recent:
			weight *= 0.25
		candidate["effective"] = weight
		total += weight

	var roll: float = _rng.randf() * total
	var chosen: String = "STAND"
	for candidate: Dictionary in candidates:
		roll -= float(candidate["effective"])
		if roll <= 0.0:
			chosen = String(candidate["name"])
			break

	_start(chosen)


func _start(activity: String) -> void:
	current_activity = activity
	recent.push_front(activity)
	while recent.size() > 3:
		recent.pop_back()

	match activity:
		"STAND":
			# Genuinely nothing. This is the most common outcome and should be.
			active_remaining = _rng.randf_range(4.0, 11.0)
		"FIDGET":
			if animator:
				animator.request("IDLE_FIDGET", 12, 0.0)
			active_remaining = 2.6
		"LOOK_AROUND":
			if animator:
				animator.request("ENVIRONMENT_GLANCE", 12, 0.0)
			active_remaining = 3.0
		"MOVE_TO_POINT":
			active_remaining = 6.0
			if locomotion and body:
				_point_index = (_point_index + 1 + _rng.randi_range(0, 1)) % IDLE_POINTS.size()
				var destination: Vector3 = IDLE_POINTS[_point_index]
				destination.y = body.global_position.y
				if not locomotion.move_to(destination, "WALK"):
					_finish()
					return
		"PHONE_CHECK":
			active_remaining = 9.0
			if phone == null or not phone.start_check_phone():
				_finish()
				return
		"PHONE_CALL":
			active_remaining = 16.0
			if phone == null or not phone.start_incoming_call():
				_finish()
				return

	activity_started.emit(activity)


func _interrupt(pressure: float) -> void:
	if current_activity == "NONE":
		return
	interrupted_activity = current_activity

	if current_activity.begins_with("PHONE") and phone:
		# Moderate pressure lowers the phone; heavy pressure puts it away.
		phone.interrupt(pressure >= 0.55)
	if current_activity == "MOVE_TO_POINT" and locomotion:
		locomotion.stop()

	activity_finished.emit(current_activity)
	current_activity = "NONE"
	active_remaining = 0.0
	timer = _rng.randf_range(MIN_GAP_S, MAX_GAP_S)


func _finish() -> void:
	if current_activity == "NONE":
		return
	activity_finished.emit(current_activity)
	current_activity = "NONE"
	active_remaining = 0.0
	interrupted_activity = ""
	timer = _rng.randf_range(MIN_GAP_S, MAX_GAP_S)


func _on_phone_finished(_kind: String) -> void:
	if current_activity.begins_with("PHONE"):
		_finish()


func _on_phone_interrupted(_kind: String, _at_step: int) -> void:
	pass


## Used by the test harness to force an activity without waiting.
func force(activity: String) -> void:
	if current_activity != "NONE":
		_finish()
	_start(activity)


func debug_snapshot() -> Dictionary:
	return {
		"ambient_action": current_activity,
		"ambient_timer": timer if current_activity == "NONE" else active_remaining,
		"interrupted": interrupted_activity if interrupted_activity != "" else "NONE",
	}
