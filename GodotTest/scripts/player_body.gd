class_name PlayerBody
extends CharacterBody3D

## The player needs a real body, not a free camera, or "walking into Elliot" is
## impossible to express. The camera rides on this.
##
## Two speeds so contact strength can actually be varied: walk, and a Shift
## sprint for testing STRONG impacts.

@export var camera: Camera3D
@export var walk_speed: float = 2.2
@export var sprint_speed: float = 4.2
@export var creep_speed: float = 0.7
@export var look_speed: float = 1.25

var current_speed: float = 0.0

## Velocity BEFORE move_and_slide resolves the collision. Reading `velocity`
## after the slide gives nearly zero on impact, which made every bump register
## as LIGHT no matter how hard the player charged in.
var intended_velocity: Vector3 = Vector3.ZERO

## Set by move_and_slide when the player actually touches the NPC. Proximity
## alone is unreliable: the capsules settle ~0.76m apart, so a fixed radius test
## either misses real contact or fires before touching.
var touching_npc: bool = false
var touch_normal: Vector3 = Vector3.ZERO

## Lets the capture/playtest harness drive the body exactly as input would,
## so contact detection sees a real closing speed rather than a teleport.
var external_control: bool = false
var external_velocity: Vector3 = Vector3.ZERO


func _physics_process(delta: float) -> void:
	if external_control:
		velocity.x = external_velocity.x
		velocity.z = external_velocity.z
		velocity.y = 0.0
		intended_velocity = velocity
		move_and_slide()
		_record_npc_contact()
		current_speed = Vector2(velocity.x, velocity.z).length()
		return

	var input: Vector3 = Vector3.ZERO
	if Input.is_key_pressed(KEY_W):
		input.z -= 1.0
	if Input.is_key_pressed(KEY_S):
		input.z += 1.0
	if Input.is_key_pressed(KEY_A):
		input.x -= 1.0
	if Input.is_key_pressed(KEY_D):
		input.x += 1.0

	var speed: float = walk_speed
	if Input.is_key_pressed(KEY_SHIFT):
		speed = sprint_speed
	elif Input.is_key_pressed(KEY_CTRL):
		speed = creep_speed

	var direction: Vector3 = Vector3.ZERO
	if input.length_squared() > 0.0:
		direction = (global_transform.basis * input.normalized())
		direction.y = 0.0
		direction = direction.normalized()

	velocity.x = direction.x * speed
	velocity.z = direction.z * speed
	# Keep him on the floor without a full gravity sim; this room is flat.
	velocity.y = 0.0
	intended_velocity = velocity
	move_and_slide()
	_record_npc_contact()
	current_speed = Vector2(velocity.x, velocity.z).length()

	var yaw_input: float = float(Input.is_key_pressed(KEY_LEFT)) - float(Input.is_key_pressed(KEY_RIGHT))
	var pitch_input: float = float(Input.is_key_pressed(KEY_UP)) - float(Input.is_key_pressed(KEY_DOWN))
	if yaw_input != 0.0:
		rotate_y(yaw_input * look_speed * delta)
	if pitch_input != 0.0 and camera:
		camera.rotation.x = clampf(
			camera.rotation.x + pitch_input * look_speed * delta,
			deg_to_rad(-55.0), deg_to_rad(55.0))


func _record_npc_contact() -> void:
	touching_npc = false
	for i: int in get_slide_collision_count():
		var collision: KinematicCollision3D = get_slide_collision(i)
		var collider: Object = collision.get_collider()
		if collider is Node and (collider as Node).is_in_group("npc"):
			touching_npc = true
			touch_normal = collision.get_normal()
			return
