extends Node

## Scripted playtest for the embodiment milestone.
##
## Drives the player body with real velocities (not teleports) so collision,
## closing speed and perception all behave exactly as they would under a human.
## Intended to be run with --write-movie so the result can be watched rather than
## only asserted.

const SECTIONS: Array[Dictionary] = [
	{"id": "AMB", "label": "60s ambient, no interaction at all"},
	{"id": "W", "label": "normal walking between idle points"},
	{"id": "C", "label": "phone: pull out, use, put away"},
	{"id": "D", "label": "phone interrupted by approach"},
	{"id": "F", "label": "approach until he steps back"},
	{"id": "G", "label": "keep advancing: backpedal escalation"},
	{"id": "H", "label": "follow him until he turns and leaves"},
	{"id": "J", "label": "light bump (0.6 m/s)"},
	{"id": "L", "label": "normal collision recoil (1.5 m/s)"},
	{"id": "K", "label": "strong charge: stumble + recovery"},
	{"id": "M", "label": "repeated bumping"},
	{"id": "N", "label": "back off and recover"},
	{"id": "E", "label": "incoming call"},
]

var scene: Node3D
var player: PlayerBody
var elliot: CharacterBody3D
var ambient: AmbientScheduler
var animator: NPCAnimator
var contact: ContactResponder
var locomotion: LocomotionController
var phone: PhoneController
var label: Label

var observed_clips: Dictionary = {}
var observed_contacts: Array[String] = []
var observed_ambient: Array[String] = []
var section_log: Array[String] = []
var current_section: String = ""
var capture_frame: int = 0
var section_marks: Array[String] = []

## Review footage needs a third-person view: the first-person camera ends up
## inside Elliot at contact distance and shows nothing but the far wall.
var observer: Camera3D


func _ready() -> void:
	_run()


func _run() -> void:
	var packed: PackedScene = load("res://main.tscn")
	scene = packed.instantiate()
	add_child(scene)
	await get_tree().process_frame
	await get_tree().physics_frame

	player = scene.get_node("Player")
	elliot = scene.get_node("Elliot")
	ambient = scene.get_node("Elliot/AmbientScheduler")
	animator = scene.get_node("Elliot/NPCAnimator")
	contact = scene.get_node("Elliot/ContactResponder")
	locomotion = scene.get_node("Elliot/LocomotionController")
	phone = scene.get_node("Elliot/PhoneController")
	label = scene.get_node("UI/Panel/State")

	player.external_control = true
	animator.clip_changed.connect(func(clip: String, _p: int) -> void: observed_clips[clip] = true)
	contact.contacted.connect(func(s: String, i: Dictionary) -> void:
		observed_contacts.append(s)
		print("  CONTACT in section ", current_section, ": ", s,
			" closing=", snappedf(float(i.get("closing_speed", 0.0)), 0.01),
			" dist=", snappedf(player.global_position.distance_to(elliot.global_position), 0.01)))
	ambient.activity_started.connect(func(a: String) -> void: observed_ambient.append(a))

	# Debug overlays on, so the capture shows the reasoning.
	scene.get_node("Elliot/PerceptionDebug").visible = true
	scene.get_node("Elliot/EmbodimentDebug").visible = true

	observer = Camera3D.new()
	observer.name = "ObserverCamera"
	observer.fov = 55.0
	scene.add_child(observer)
	observer.current = true
	_update_observer()

	# A full minute with the player standing well back and NOT looking, so the
	# ambient scheduler is the only thing driving him.
	await _section("AMB", 62.0, func() -> void:
		player.global_position = Vector3(0.0, 0.0, -7.0)
		player.rotation = Vector3.ZERO
		await _stand_passive(62.0))
	await _section("W", 9.0, func() -> void:
		ambient.force("MOVE_TO_POINT")
		await _stand_passive(9.0))
	await _section("C", 9.0, func() -> void:
		ambient.force("PHONE_CHECK")
		await _stand(9.0))
	await _section("D", 8.0, func() -> void:
		ambient.force("PHONE_CHECK")
		await _stand(2.0)
		await _approach(1.25, 1.0)
		await _stand(3.0))
	await _section("F", 7.0, func() -> void:
		await _retreat_to(2.6, 1.2)
		await _approach(1.1, 0.9)
		await _stand(3.0))
	await _section("G", 8.0, func() -> void:
		await _approach(0.95, 0.8)
		await _stand(1.5)
		await _approach(0.95, 0.8)
		await _stand(2.5))
	await _section("H", 9.0, func() -> void:
		await _approach(0.9, 0.9)
		await _stand(1.0)
		await _approach(0.9, 0.9)
		await _stand(4.0))
	await _section("J", 6.0, func() -> void:
		# Reset to open floor: by now he has retreated across the room and may be
		# against a wall, which would block the charge and invalidate the test.
		_reset_positions(2.2)
		await _approach(0.25, 0.6)
		await _stand(3.0))
	# The 1.05-2.15 m/s band was never exercised before, so NORMAL recoil was
	# untested code. This is a brisk walk into him, not a charge.
	await _section("L", 6.0, func() -> void:
		_reset_positions(2.4)
		await _approach(0.25, 1.5)
		await _stand(3.0))
	await _section("K", 6.0, func() -> void:
		_reset_positions(3.0)
		await _approach(0.25, 3.0)
		await _stand(3.0))
	await _section("M", 9.0, func() -> void:
		for i: int in 3:
			_reset_positions(1.6)
			await _approach(0.25, 1.4)
			await _stand(1.4))
	await _section("N", 9.0, func() -> void:
		await _retreat_to(4.5, 1.6)
		await _stand(7.0))
	await _section("E", 14.0, func() -> void:
		ambient.force("PHONE_CALL")
		await _stand(14.0))

	_report()
	get_tree().quit(0)


func _section(id: String, _budget: float, work: Callable) -> void:
	var entry: Dictionary = {}
	for section: Dictionary in SECTIONS:
		if String(section["id"]) == id:
			entry = section
			break
	current_section = id
	# Frame count at 30fps movie rate, so review clips can be cut accurately.
	var at_seconds: float = float(capture_frame) / 60.0
	var text: String = "[%s] %s" % [id, String(entry.get("label", ""))]
	section_marks.append("%s %.1f" % [id, at_seconds])
	print("=== ", text, "  @ ", snappedf(at_seconds, 0.1), "s")
	section_log.append(text)
	await work.call()


## Move toward Elliot until `stop_distance`, at `speed` m/s.
func _approach(stop_distance: float, speed: float) -> void:
	var guard: int = 0
	var min_distance: float = 999.0
	while guard < 420:
		guard += 1
		var offset: Vector3 = elliot.global_position - player.global_position
		offset.y = 0.0
		var distance: float = offset.length()
		min_distance = minf(min_distance, distance)
		if distance <= stop_distance:
			break
		player.external_velocity = offset.normalized() * speed
		_face_elliot()
		capture_frame += 1
		_update_observer()
		await get_tree().physics_frame
	player.external_velocity = Vector3.ZERO
	var final_distance: float = player.global_position.distance_to(elliot.global_position)
	print("  approach(stop=", stop_distance, " speed=", speed, ") ended at ",
		snappedf(final_distance, 0.02), " min=", snappedf(min_distance, 0.02),
		" after ", guard, " frames  elliot_moving=", locomotion.is_busy())


func _retreat_to(distance: float, speed: float) -> void:
	var guard: int = 0
	while guard < 900:
		guard += 1
		var offset: Vector3 = player.global_position - elliot.global_position
		offset.y = 0.0
		if offset.length() >= distance:
			break
		player.external_velocity = offset.normalized() * speed
		_face_elliot()
		await get_tree().physics_frame
	player.external_velocity = Vector3.ZERO


## Put both bodies on clear floor, player `distance` metres in front of Elliot.
func _reset_positions(distance: float) -> void:
	elliot.global_position = Vector3(0.0, 0.0, 0.0)
	elliot.velocity = Vector3.ZERO
	player.global_position = Vector3(0.0, 0.0, -distance)
	player.external_velocity = Vector3.ZERO
	_face_elliot()


## Hold position WITHOUT looking at Elliot. Staring raises alertness, which
## gates the ambient scheduler, so the ambient test must not face him.
func _stand_passive(seconds: float) -> void:
	player.external_velocity = Vector3.ZERO
	var frames: int = int(seconds * 60.0)
	for _i: int in frames:
		capture_frame += 1
		_update_observer()
		await get_tree().physics_frame


func _stand(seconds: float) -> void:
	player.external_velocity = Vector3.ZERO
	var frames: int = int(seconds * 60.0)
	for _i: int in frames:
		_face_elliot()
		capture_frame += 1
		_update_observer()
		await get_tree().physics_frame


## Frames both characters from the side so retreat, contact and the phone are
## all readable, keeping Elliot roughly in shot as he moves.
func _update_observer() -> void:
	if observer == null:
		return
	# Bias hard toward Elliot. Framing the midpoint pushed him out of shot
	# whenever the player stood well back, e.g. the whole ambient section.
	var focus: Vector3 = elliot.global_position.lerp(player.global_position, 0.22)
	var separation: float = elliot.global_position.distance_to(player.global_position)
	var back: float = clampf(4.2 + separation * 0.18, 4.2, 5.8)
	observer.global_position = focus + Vector3(back * 0.86, 2.35, back * 0.50)
	observer.look_at(focus + Vector3.UP * 1.0, Vector3.UP)
	# Shift the subjects into the right of frame; the debug panel occupies the
	# left third and was covering Elliot entirely.
	observer.h_offset = -1.05


func _face_elliot() -> void:
	var target: Vector3 = elliot.global_position
	target.y = player.global_position.y
	if player.global_position.distance_to(target) > 0.05:
		player.look_at(target, Vector3.UP)
		player.rotate_y(PI)  # body forward is -Z; look_at points +Z at the target


func _report() -> void:
	print("--- EMBODIMENT CAPTURE REPORT ---")
	print("sections run     : ", section_log.size())
	print("distinct clips   : ", observed_clips.size())
	print("clips seen       : ", ", ".join(PackedStringArray(observed_clips.keys())))
	print("contacts         : ", ", ".join(PackedStringArray(observed_contacts)))
	print("ambient started  : ", ", ".join(PackedStringArray(observed_ambient)))
	print("phone attached   : ", phone.debug_snapshot()["attached"])
	print("SECTION_MARKS ", " | ".join(PackedStringArray(section_marks)))
	print("TOTAL_SECONDS ", snappedf(float(capture_frame) / 60.0, 0.1))
	print("EMBODIMENT_CAPTURE_COMPLETE clips=%d contacts=%d" % [
		observed_clips.size(), observed_contacts.size()])
