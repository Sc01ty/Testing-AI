class_name NPCBehaviourController
extends Node

signal state_changed(previous: StringName, current: StringName)

enum State { CALM_IDLE, WATCHING_PLAYER, NERVOUS_IDLE, GLANCE_AWAY, STEP_BACK, WARNING, RECOVERING }

@export var perception: PlayerPerception
@export var animator: NPCAnimator
@export var attention: AttentionController
@export var event_bus: BehaviourEventBus
@export var repositioner: Node
@export var locomotion: LocomotionController
@export_file("*.json") var config_path: String = "res://config/elliot_behavior_spec.json"

## How many times he has already given ground to this player. Drives escalation
## from a small step, to a real backpedal, to leaving the area entirely - so he
## never just replays STEP_BACK at someone who keeps advancing.
var retreat_stage: int = 0
var retreat_decay: float = 0.0

var config: Dictionary = {}
var state: int = State.CALM_IDLE
var previous_state: int = State.CALM_IDLE
var state_elapsed: float = 0.0
var reaction_cooldowns: Dictionary = {}
var warning_latched: bool = false
var boundary_response_latched: bool = false


func _ready() -> void:
	config = _load_json(config_path)
	if event_bus:
		event_bus.context_provider = self
	_enter_state(State.CALM_IDLE, true)


func _physics_process(delta: float) -> void:
	if not perception or config.is_empty():
		return
	state_elapsed += delta
	for key in reaction_cooldowns.keys():
		reaction_cooldowns[key] = maxf(0.0, float(reaction_cooldowns[key]) - delta)
	var p: Dictionary = perception.snapshot()
	var timing: Dictionary = config["timing"]
	var nerves: Dictionary = config["nervousness"]
	if not bool(p["in_personal_space"]):
		boundary_response_latched = false

	# High-priority social boundaries can interrupt passive states, not active reactions.
	if state not in [State.STEP_BACK, State.WARNING]:
		if not warning_latched and _reaction_ready("NERVOUS_WARNING") and ((bool(p["followed_after_step_back"]) and float(p["nervousness"]) >= 0.42)
		or (int(p["recent_violations"]) >= 2 and float(p["nervousness"]) >= 0.5)):
			_enter_state(State.WARNING)
			return
		if not warning_latched and not boundary_response_latched and _reaction_ready("STEP_BACK") and bool(p["in_personal_space"]) and float(p["close_time"]) >= float(timing["close_dwell_s"]):
			_enter_state(State.STEP_BACK)
			return

	match state:
		State.CALM_IDLE:
			warning_latched = false
			if bool(p["aware"]) and float(p["nervousness"]) >= float(nerves["watching_threshold"]):
				_enter_state(State.WATCHING_PLAYER)
		State.WATCHING_PLAYER:
			if _reaction_ready("GLANCE_AWAY") and float(p["stare_time"]) >= float(timing["glance_stare_s"]):
				_enter_state(State.GLANCE_AWAY)
			elif float(p["nervousness"]) >= float(nerves["nervous_idle_threshold"]):
				_enter_state(State.NERVOUS_IDLE)
			elif not bool(p["aware"]) and float(p["nervousness"]) < float(nerves["recovery_threshold"]):
				_enter_state(State.RECOVERING)
		State.NERVOUS_IDLE:
			if _reaction_ready("GLANCE_AWAY") and float(p["stare_time"]) >= float(timing["glance_stare_s"]):
				_enter_state(State.GLANCE_AWAY)
			elif not bool(p["aware"]) and float(p["nervousness"]) < float(nerves["recovery_threshold"]):
				_enter_state(State.RECOVERING)
		State.GLANCE_AWAY:
			if state_elapsed >= _animation_duration("GLANCE_AWAY"):
				_enter_state(State.NERVOUS_IDLE if float(p["nervousness"]) >= float(nerves["watching_threshold"]) else State.WATCHING_PLAYER)
		State.STEP_BACK:
			if state_elapsed >= _animation_duration("STEP_BACK"):
				if bool(p["followed_after_step_back"]) or int(p["recent_violations"]) >= 2:
					_enter_state(State.WARNING)
				else:
					_enter_state(State.NERVOUS_IDLE)
		State.WARNING:
			warning_latched = true
			if state_elapsed >= _animation_duration("NERVOUS_WARNING"):
				_enter_state(State.NERVOUS_IDLE)
		State.RECOVERING:
			if bool(p["aware"]):
				_enter_state(State.WATCHING_PLAYER)
			elif state_elapsed >= float(timing["recover_state_s"]):
				_enter_state(State.CALM_IDLE)
				_emit(&"OnRecovered")


func get_state_name() -> StringName:
	return StringName(State.keys()[state])


func get_previous_state_name() -> StringName:
	return StringName(State.keys()[previous_state])


func _enter_state(next: int, force := false) -> void:
	if not force and next == state:
		return
	var old_name: StringName = get_state_name()
	previous_state = state
	state = next
	state_elapsed = 0.0
	var new_name: StringName = get_state_name()
	match state:
		State.CALM_IDLE:
			animator.set_playback_speed(0.68)
			animator.set_idle_fallback("IDLE_CALM")
			_request_animation("IDLE_CALM", "NERVOUS_IDLE")
		State.WATCHING_PLAYER:
			animator.set_playback_speed(0.82)
			animator.set_idle_fallback("IDLE_CALM")
			_request_animation("IDLE_CALM", "NERVOUS_IDLE")
		State.NERVOUS_IDLE:
			animator.set_playback_speed(1.0)
			animator.set_idle_fallback("IDLE_NERVOUS")
			_request_animation("IDLE_NERVOUS", "NERVOUS_IDLE")
		State.GLANCE_AWAY:
			animator.set_playback_speed(1.0)
			_request_animation("BREAK_CONTACT", "GLANCE_AWAY")
			reaction_cooldowns["GLANCE_AWAY"] = _animation_cooldown("GLANCE_AWAY")
		State.STEP_BACK:
			boundary_response_latched = true
			animator.set_playback_speed(1.0)
			# A calm retreat and a startled one are different movements, not the
			# same clip at a different speed.
			var startled: bool = float(perception.snapshot().get("nervousness", 0.0)) >= 0.55
			_escalated_retreat(startled)
		State.WARNING:
			animator.set_playback_speed(1.0)
			if _request_animation("WARNING", "NERVOUS_WARNING"):
				reaction_cooldowns["NERVOUS_WARNING"] = _animation_cooldown("NERVOUS_WARNING")
				_emit(&"OnWarning")
		State.RECOVERING:
			animator.set_playback_speed(0.78)
			_request_animation("CALM_DOWN", "NERVOUS_IDLE")
			_request_animation("NERVOUS_IDLE")
	state_changed.emit(old_name, new_name)


## `pool` chooses what is SEEN; `spec_key` chooses the timing/priority entry in
## elliot_behavior_spec.json. Keeping them separate means the expanded vocabulary
## varies the visuals without shifting any state-machine threshold.
## Stage 0 is a single step. Stage 1 is a genuine backpedal. Stage 2+ means the
## small responses failed, so he leaves and checks whether he was followed.
func _escalated_retreat(startled: bool) -> void:
	retreat_decay = 14.0
	var threat_position: Vector3 = Vector3.ZERO
	if perception and perception.target:
		threat_position = perception.target.global_position

	var moved: bool = false
	match retreat_stage:
		0:
			if _request_animation("STEP_BACK_HARD" if startled else "STEP_BACK_SOFT", "STEP_BACK"):
				reaction_cooldowns["STEP_BACK"] = _animation_cooldown("STEP_BACK")
				moved = repositioner.request_space() if repositioner else false
		1:
			if _request_animation("RETREAT_CONTINUE", "STEP_BACK"):
				reaction_cooldowns["STEP_BACK"] = _animation_cooldown("STEP_BACK")
				if locomotion:
					moved = locomotion.retreat_from(threat_position, 0.85, "BACKPEDAL")
				if not moved and repositioner:
					moved = repositioner.request_space()
		_:
			# Give up on standing his ground; walk somewhere else and look back.
			if locomotion:
				var away: Vector3 = body_position() - threat_position
				away.y = 0.0
				if away.length_squared() < 0.01:
					away = Vector3.FORWARD
				var destination: Vector3 = body_position() + away.normalized() * 2.6
				locomotion.look_back_pending = true
				moved = locomotion.move_to(destination, "WALK_AWAY")
				if moved:
					_request_animation("LEAVE", "STEP_BACK")
			if not moved and repositioner:
				moved = repositioner.request_space()

	if moved:
		perception.notify_step_back()
	retreat_stage = mini(retreat_stage + 1, 3)


func body_position() -> Vector3:
	if locomotion and locomotion.body:
		return locomotion.body.global_position
	if perception and perception.observer:
		return perception.observer.global_position
	return Vector3.ZERO


func _request_animation(pool: String, spec_key: String = "") -> bool:
	var key: String = spec_key if spec_key != "" else pool
	var definition: Dictionary = config["animation"].get(key, {})
	return animator.request(pool, int(definition.get("priority", 0)), float(definition.get("cooldown_s", 0.0)))


func _animation_duration(name: String) -> float:
	return float(config["animation"].get(name, {}).get("duration_s", 0.0))


func _animation_cooldown(name: String) -> float:
	return float(config["animation"].get(name, {}).get("cooldown_s", 0.0))


func _reaction_ready(name: String) -> bool:
	return float(reaction_cooldowns.get(name, 0.0)) <= 0.0


func _emit(event_name: StringName) -> void:
	if not event_bus:
		return
	var context: Dictionary = perception.snapshot()
	context["previous_state"] = String(State.keys()[previous_state])
	context["state"] = String(get_state_name())
	event_bus.emit_behaviour(event_name, context)


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing behaviour config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
