extends Node3D

## Test harness. Player movement now lives on the PlayerBody so that walking
## into Elliot is a real physics interaction rather than a camera passing through
## a mannequin.

@onready var player: PlayerBody = $Player
@onready var camera: Camera3D = $Player/PlayerCamera
@onready var animator: NPCAnimator = $Elliot/NPCAnimator
@onready var attention: AttentionController = $Elliot/AttentionController
@onready var perception: PlayerPerception = $Elliot/PlayerPerception
@onready var behaviour: NPCBehaviourController = $Elliot/BehaviourController
@onready var events: BehaviourEventBus = $Elliot/BehaviourEvents
@onready var debug_draw: PerceptionDebugDraw = $Elliot/PerceptionDebug
@onready var embodiment_draw: EmbodimentDebugDraw = $Elliot/EmbodimentDebug
@onready var social_state: Node = $Elliot/SocialState
@onready var presence: Node = $Elliot/PresenceController
@onready var locomotion: LocomotionController = $Elliot/LocomotionController
@onready var contact: ContactResponder = $Elliot/ContactResponder
@onready var phone: PhoneController = $Elliot/PhoneController
@onready var ambient: AmbientScheduler = $Elliot/AmbientScheduler
@onready var state_label: Label = $UI/Panel/State

var latest_snapshot: Dictionary = {}

var browser_enabled: bool = false
var browser_index: int = 0
var browser_clips: Array = []


func _ready() -> void:
	perception.snapshot_updated.connect(_on_snapshot_updated)
	behaviour.state_changed.connect(_on_state_changed)
	events.behaviour_event.connect(_on_behaviour_event)
	contact.contacted.connect(_on_contact)
	ambient.activity_started.connect(func(a: String) -> void: print("[Ambient] start ", a))
	ambient.activity_finished.connect(func(a: String) -> void: print("[Ambient] end ", a))


func _process(_delta: float) -> void:
	_refresh_debug_text()


func _unhandled_key_input(event: InputEvent) -> void:
	if not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_F3:
			debug_draw.visible = not debug_draw.visible
			embodiment_draw.visible = debug_draw.visible
		KEY_F2:
			_toggle_browser()
		KEY_BRACKETLEFT:
			_browse(-1)
		KEY_BRACKETRIGHT:
			_browse(1)
		KEY_R:
			if browser_enabled and not browser_clips.is_empty():
				animator.play(String(browser_clips[browser_index]))
		# Scenario triggers, so tests do not rely on waiting for chance.
		KEY_P:
			ambient.force("PHONE_CHECK")
		KEY_O:
			ambient.force("PHONE_CALL")
		KEY_M:
			ambient.force("MOVE_TO_POINT")
		KEY_1: animator.play("IDLE_NERVOUS")
		KEY_2: animator.play("BREAK_CONTACT")
		KEY_3: animator.play("STEP_BACK_SOFT")
		KEY_4: animator.play("WARNING")
		KEY_5: animator.play("IMPACT_MEDIUM")
		KEY_6: animator.play("IMPACT_HEAVY")
		KEY_7: animator.play("PHONE_OUT")
		KEY_8: animator.play("PHONE_ANSWER")
		# Live phone offset tuning.
		KEY_KP_ADD:
			phone.nudge_offset(Vector3(0, 0.005, 0), Vector3.ZERO)
		KEY_KP_SUBTRACT:
			phone.nudge_offset(Vector3(0, -0.005, 0), Vector3.ZERO)


func _toggle_browser() -> void:
	browser_enabled = not browser_enabled
	if browser_enabled:
		browser_clips = animator.library.all_clip_names()
		browser_index = 0
		if not browser_clips.is_empty():
			animator.play(String(browser_clips[browser_index]))


func _browse(step: int) -> void:
	if not browser_enabled or browser_clips.is_empty():
		return
	browser_index = wrapi(browser_index + step, 0, browser_clips.size())
	animator.play(String(browser_clips[browser_index]))


func _on_snapshot_updated(snapshot: Dictionary) -> void:
	latest_snapshot = snapshot


func _on_state_changed(_previous: StringName, _current: StringName) -> void:
	pass


func _on_contact(strength: String, info: Dictionary) -> void:
	print("[Contact] ", strength, " side=", info.get("side", "?"),
		" speed=", snappedf(float(info.get("closing_speed", 0.0)), 0.01),
		" count=", info.get("count", 0))


func _on_behaviour_event(event_name: StringName, context: Dictionary) -> void:
	print("[Elliot] ", event_name, " priority=", context.get("priority", 0),
		" nervousness=", snappedf(float(context.get("nervousness", 0.0)), 0.01))


func _refresh_debug_text() -> void:
	if latest_snapshot.is_empty():
		return
	var social: Dictionary = social_state.snapshot()
	var presence_debug: Dictionary = presence.debug_snapshot()
	var loco: Dictionary = locomotion.debug_snapshot()
	var hit: Dictionary = contact.debug_snapshot()
	var phone_debug: Dictionary = phone.debug_snapshot()
	var ambient_debug: Dictionary = ambient.debug_snapshot()

	var browser_line: String = ""
	if browser_enabled and not browser_clips.is_empty():
		browser_line = "\nBROWSER %d/%d: %s" % [
			browser_index + 1, browser_clips.size(), String(browser_clips[browser_index])]

	state_label.text = ("ELLIOT — EMBODIMENT DEBUG\n\n" +
		"STATE: %s\nBEHAVIOUR: %s\nANIMATION: %s  (p%d)\n" +
		"ATTENTION: %s\n\n" +
		"LOCOMOTION: %s / %s\nMOVE TARGET: %.1f, %.1f\nTARGET DIST: %.2fm\n" +
		"SPEED: %.2f -> %.2f m/s\nTURN ANGLE: %.0f deg\nBLOCKED: %s\n\n" +
		"COLLISION: %s (%s)\nIMPACT: %.2f m/s\nCONTACTS: %d\n\n" +
		"PHONE: %s  attached=%s\nPHONE SEQ: %s step %d\n\n" +
		"AMBIENT: %s\nAMBIENT TIMER: %.1fs\nINTERRUPTED: %s\n\n" +
		"NERVOUSNESS: %.2f   ALERTNESS: %.2f\nCOMFORT: %.2f   IRRITATION: %.2f\n" +
		"DISTANCE: %.2fm   STARE: %.1fs\nFOLLOWED AFTER STEP: %s%s\n\n" +
		"WASD move · Shift run · Ctrl creep\narrows look · F3 debug · F2 browser\nP phone · O call · M walk") % [
		behaviour.get_state_name(), presence_debug["current_behaviour"],
		animator.current_clip, animator.current_priority,
		presence_debug["attention_target"],
		loco["mode"], loco["style"],
		float(loco["destination"].x), float(loco["destination"].z),
		float(loco["target_distance"]),
		float(loco["current_speed"]), float(loco["desired_speed"]),
		float(loco["turn_angle"]), str(loco["blocked"]),
		hit["collision_class"], hit["side"],
		float(hit["impact_vector"].length()), int(hit["contacts"]),
		phone_debug["phone_state"], str(phone_debug["attached"]),
		phone_debug["sequence"], int(phone_debug["step"]),
		ambient_debug["ambient_action"], float(ambient_debug["ambient_timer"]),
		ambient_debug["interrupted"],
		float(social["nervousness"]), float(social["alertness"]),
		float(social["comfort"]), float(social["irritation"]),
		float(latest_snapshot["distance"]), float(latest_snapshot["stare_time"]),
		str(latest_snapshot["followed_after_step_back"]), browser_line
	]
