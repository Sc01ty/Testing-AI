class_name LocomotionController
extends Node

## Moves Elliot's body so that world displacement and the animation agree.
##
## Method: animation-synchronised procedural displacement, not root motion.
## The clips are authored in place, the GLB exposes an AnimationPlayer rather
## than an AnimationTree, and the manifest already carries a ground speed
## measured from the planted foot (tests/measure_locomotion.py). Driving the body
## at that measured speed is what keeps the feet from sliding.
##
## During acceleration and deceleration the playback rate is scaled by
## current_speed / nominal_speed, so a slower body means slower legs rather than
## a full-speed walk cycle skating along.

signal arrived(destination: Vector3)
signal blocked_at(position: Vector3, attempted: Vector3)

enum Mode { IDLE, TURNING, MOVING, STOPPING }

@export var body: CharacterBody3D
@export var animator: NPCAnimator
@export var threat: Node3D

## Styles map to a clip and the way the body carries itself.
const STYLES: Dictionary = {
	"WALK": {"clip": "WALK_FORWARD", "face_travel": true, "accel": 2.6, "decel": 3.4},
	"WALK_AWAY": {"clip": "WALK_AWAY_NERVOUS", "face_travel": true, "accel": 2.2, "decel": 3.0},
	"BACKPEDAL": {"clip": "BACKPEDAL_SHORT", "face_travel": false, "accel": 4.5, "decel": 5.0},
	"BACK_CAUTIOUS": {"clip": "WALK_BACKWARD", "face_travel": false, "accel": 2.0, "decel": 3.0},
}

const ARRIVE_RADIUS: float = 0.18
const TURN_SPEED_DEG: float = 220.0
## Beyond this the character turns on the spot first instead of pivoting mid-stride.
const TURN_FIRST_DEG: float = 62.0
const PROBE_HEIGHT: float = 0.95
const PROBE_RADIUS: float = 0.42

var mode: int = Mode.IDLE
var style: String = "WALK"
var destination: Vector3 = Vector3.ZERO
var current_speed: float = 0.0
var desired_speed: float = 0.0
var nominal_speed: float = 1.0
var blocked: bool = false
var turn_angle_deg: float = 0.0
var look_back_pending: bool = false

var _locomotion_data: Dictionary = {}
var _turn_timer: float = 0.0


func _ready() -> void:
	if animator and animator.library:
		_locomotion_data = animator.library.manifest.get("locomotion", {}) as Dictionary


func speed_for(clip_name: String) -> float:
	var entry: Variant = _locomotion_data.get(clip_name, null)
	if typeof(entry) == TYPE_DICTIONARY:
		return maxf(0.05, float((entry as Dictionary).get("speed_mps", 1.0)))
	return 1.0


func is_busy() -> bool:
	return mode != Mode.IDLE


## Walk to a world point. Returns false if the destination is unusable.
func move_to(point: Vector3, movement_style: String = "WALK") -> bool:
	if not body:
		return false
	if not STYLES.has(movement_style):
		movement_style = "WALK"
	var flat: Vector3 = point
	flat.y = body.global_position.y
	if flat.distance_to(body.global_position) < ARRIVE_RADIUS:
		return false

	style = movement_style
	destination = flat
	nominal_speed = speed_for(String(STYLES[style]["clip"]))
	desired_speed = nominal_speed
	blocked = false

	var to_target: Vector3 = (destination - body.global_position).normalized()
	turn_angle_deg = rad_to_deg(_signed_angle_to(to_target))

	# A big heading change reads badly as a pivot mid-walk, so turn first.
	if bool(STYLES[style]["face_travel"]) and absf(turn_angle_deg) > TURN_FIRST_DEG:
		mode = Mode.TURNING
		_turn_timer = 0.0
		animator.request("TURN_LEFT" if turn_angle_deg > 0.0 else "TURN_RIGHT", 40, 0.0)
	else:
		mode = Mode.MOVING
		animator.request(String(STYLES[style]["clip"]), 40, 0.0)
	return true


## Retreat directly away from `from_position`, choosing a clear direction.
func retreat_from(from_position: Vector3, distance: float, movement_style: String = "BACKPEDAL") -> bool:
	var direction: Vector3 = _clear_retreat_direction(from_position)
	if direction == Vector3.ZERO:
		blocked = true
		blocked_at.emit(body.global_position, from_position)
		return false
	return move_to(body.global_position + direction * distance, movement_style)


func stop() -> void:
	if mode == Mode.IDLE:
		return
	mode = Mode.STOPPING
	desired_speed = 0.0


func _physics_process(delta: float) -> void:
	if not body:
		return

	match mode:
		Mode.TURNING:
			_process_turn(delta)
		Mode.MOVING:
			_process_move(delta)
		Mode.STOPPING:
			_process_stopping(delta)
		_:
			current_speed = 0.0
			body.velocity = Vector3.ZERO

	# Legs must match the body. Without this a decelerating character keeps
	# walking at full rate and skates to a halt.
	if animator and mode != Mode.IDLE and nominal_speed > 0.01:
		animator.set_playback_speed(clampf(current_speed / nominal_speed, 0.3, 1.5))


func _process_turn(delta: float) -> void:
	_turn_timer += delta
	var to_target: Vector3 = (destination - body.global_position).normalized()
	var remaining: float = _signed_angle_to(to_target)
	_rotate_toward(remaining, delta)
	turn_angle_deg = rad_to_deg(remaining)
	current_speed = 0.0
	body.velocity = Vector3.ZERO
	if absf(turn_angle_deg) < 18.0 or _turn_timer > 1.4:
		mode = Mode.MOVING
		animator.request(String(STYLES[style]["clip"]), 40, 0.0)


func _process_move(delta: float) -> void:
	var to_target: Vector3 = destination - body.global_position
	to_target.y = 0.0
	var distance: float = to_target.length()

	if distance <= ARRIVE_RADIUS:
		_finish()
		return

	var direction: Vector3 = to_target / maxf(distance, 0.0001)

	# Deceleration window, so arrival settles rather than stopping dead.
	var stopping_distance: float = (current_speed * current_speed) / (2.0 * float(STYLES[style]["decel"]))
	desired_speed = 0.0 if distance <= stopping_distance else nominal_speed

	var rate: float = float(STYLES[style]["accel"]) if desired_speed > current_speed else float(STYLES[style]["decel"])
	current_speed = move_toward(current_speed, desired_speed, rate * delta)

	if bool(STYLES[style]["face_travel"]):
		_rotate_toward(_signed_angle_to(direction), delta)
	elif threat:
		# Backing away: keep facing the thing being retreated from.
		var to_threat: Vector3 = threat.global_position - body.global_position
		to_threat.y = 0.0
		if to_threat.length_squared() > 0.01:
			_rotate_toward(_signed_angle_to(to_threat.normalized()), delta)

	body.velocity = direction * current_speed
	body.move_and_slide()

	# Physically stuck: real collision stopped us short of the target.
	if body.get_slide_collision_count() > 0 and current_speed > 0.05:
		var travelled: float = body.velocity.length() * delta
		if travelled < current_speed * delta * 0.25:
			blocked = true
			blocked_at.emit(body.global_position, destination)
			_finish()


func _process_stopping(delta: float) -> void:
	current_speed = move_toward(current_speed, 0.0, float(STYLES[style]["decel"]) * delta)
	if current_speed <= 0.02:
		_finish()
		return
	var direction: Vector3 = (destination - body.global_position).normalized()
	body.velocity = direction * current_speed
	body.move_and_slide()


func _finish() -> void:
	mode = Mode.IDLE
	current_speed = 0.0
	desired_speed = 0.0
	body.velocity = Vector3.ZERO
	if animator:
		animator.set_playback_speed(1.0)
	if look_back_pending:
		look_back_pending = false
		animator.request("CHECK_FOLLOW", 45, 0.0)
	arrived.emit(destination)


func _rotate_toward(signed_angle: float, delta: float) -> void:
	var step: float = deg_to_rad(TURN_SPEED_DEG) * delta
	var applied: float = clampf(signed_angle, -step, step)
	body.rotate_y(applied)


func _signed_angle_to(direction: Vector3) -> float:
	var forward: Vector3 = -body.global_transform.basis.z
	forward.y = 0.0
	var flat: Vector3 = direction
	flat.y = 0.0
	if flat.length_squared() < 0.0001 or forward.length_squared() < 0.0001:
		return 0.0
	return forward.normalized().signed_angle_to(flat.normalized(), Vector3.UP)


## Fan out from directly-away until a direction has room. Prevents backing into
## walls and gives the "he found another way out" behaviour.
func _clear_retreat_direction(from_position: Vector3) -> Vector3:
	var away: Vector3 = body.global_position - from_position
	away.y = 0.0
	if away.length_squared() < 0.0001:
		away = -body.global_transform.basis.z
	away = away.normalized()

	var best: Vector3 = Vector3.ZERO
	var best_clearance: float = 0.0
	for angle_deg: float in [0.0, -30.0, 30.0, -60.0, 60.0, -90.0, 90.0]:
		var candidate: Vector3 = away.rotated(Vector3.UP, deg_to_rad(angle_deg))
		var clearance: float = _clearance_along(candidate)
		if clearance > best_clearance:
			best_clearance = clearance
			best = candidate
		if clearance >= 1.4:
			break
	return best if best_clearance >= 0.45 else Vector3.ZERO


func _clearance_along(direction: Vector3) -> float:
	var space: PhysicsDirectSpaceState3D = body.get_world_3d().direct_space_state
	var origin: Vector3 = body.global_position + Vector3.UP * PROBE_HEIGHT
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(
		origin, origin + direction * 2.2)
	query.exclude = [body.get_rid()]
	var hit: Dictionary = space.intersect_ray(query)
	if hit.is_empty():
		return 2.2
	var point: Vector3 = hit["position"]
	return maxf(0.0, origin.distance_to(point) - PROBE_RADIUS)


func debug_snapshot() -> Dictionary:
	var mode_names: Array = ["IDLE", "TURNING", "MOVING", "STOPPING"]
	return {
		"mode": mode_names[mode],
		"style": style,
		"destination": destination,
		"target_distance": body.global_position.distance_to(destination) if body else 0.0,
		"current_speed": current_speed,
		"desired_speed": desired_speed,
		"turn_angle": turn_angle_deg,
		"blocked": blocked,
	}
