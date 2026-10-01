class_name PresenceController
extends Node

@export var perception: PlayerPerception
@export var social_state: Node
@export var attention: AttentionController
@export var behaviour: NPCBehaviourController
@export var event_bus: BehaviourEventBus
@export_file("*.json") var config_path: String = "res://config/elliot_presence_spec.json"

var current_behaviour: StringName = &"STILLNESS"
var last_action: StringName = &"NONE"
var next_action_in: float = 0.0
var sequence: Array[Dictionary] = []
var sequence_priority: int = 0
var recent_actions: Array[StringName] = []
var action_cooldowns: Dictionary = {}
var settings: Dictionary = {}
var latency: Dictionary = {}
var _active_time: float = 0.0
var _micro_timer: float = 2.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

## Micro-behaviours used to set attention only, so Elliot's body never changed
## between reactions - which is most of why he read as a debug NPC. Each action
## can now also request a clip. Ambient priority means a genuine reaction still
## interrupts it.
const ACTION_POOLS: Dictionary = {
	&"ENVIRONMENT_GLANCE": "ENVIRONMENT_GLANCE",
	&"CHECK_ENVIRONMENT": "ENVIRONMENT_GLANCE",
	&"WEIGHT_SHIFT": "WEIGHT_SHIFT",
	&"FIDGET": "IDLE_FIDGET",
	&"FLOOR_GLANCE": "FLOOR_GLANCE",
	&"SIDE_GLANCE": "SIDE_GLANCE",
	&"BRIEF_PLAYER_CHECK": "BRIEF_PLAYER_CHECK",
	&"LOOK_NEAR_PLAYER": "LOOK_NEAR_PLAYER",
	&"NOTICE_PLAYER": "NOTICE",
	&"CHECK_GAZE": "BRIEF_PLAYER_CHECK",
	&"BREAK_EYE_CONTACT": "BREAK_CONTACT",
	&"CLOSED_POSTURE": "GUARDED",
	&"CONFIRM_DISTANCE": "CHECK_FOLLOW",
	&"GUARDED_WATCH": "GUARDED",
}
const AMBIENT_PRIORITY: int = 15


func _ready() -> void:
	var config: Dictionary = _load_json(config_path)
	settings = config
	latency = config.get("latency", {})
	_rng.seed = 0x51A7E
	if event_bus:
		event_bus.behaviour_event.connect(_on_behaviour_event)
	_schedule_micro_behaviour()


func _process(delta: float) -> void:
	for key: Variant in action_cooldowns.keys():
		action_cooldowns[key] = maxf(0.0, float(action_cooldowns[key]) - delta)
	if _active_time > 0.0:
		_active_time = maxf(0.0, _active_time - delta)
		next_action_in = _active_time
		if _active_time <= 0.0:
			_start_next_step()
		return
	if not sequence.is_empty():
		_start_next_step()
		return
	sequence_priority = 0
	_micro_timer -= delta
	next_action_in = maxf(0.0, _micro_timer)
	if _micro_timer <= 0.0:
		_select_contextual_micro_behaviour()


func debug_snapshot() -> Dictionary:
	return {
		"current_behaviour": String(current_behaviour),
		"attention_target": String(attention.attention_name()) if attention else "NONE",
		"last_action": String(last_action),
		"next_action_in": next_action_in,
		"sequence_priority": sequence_priority,
	}


func _on_behaviour_event(event_name: StringName, context: Dictionary) -> void:
	var priority: int = int(context.get("priority", 0))
	match event_name:
		&"OnPlayerNoticed":
			_queue_sequence(priority, [
				_step(&"NOTICE_PLAYER", AttentionController.TargetMode.PLAYER_FACE, _rand_latency("notice_min_s", "notice_max_s"), 0.45, 0.0, 0.1, 0.0, 0.05),
				_step(&"DISENGAGE_NATURALLY", AttentionController.TargetMode.NEAR_PLAYER, 0.15, 1.15, 0.0, 0.0, -0.25, 0.0),
			])
		&"OnLongStare":
			_queue_sequence(priority, [
				_step(&"CHECK_GAZE", AttentionController.TargetMode.PLAYER_FACE, _rand_latency("stare_response_min_s", "stare_response_max_s"), 0.3, 0.1, 0.0, 0.0, 0.1),
				_step(&"BREAK_EYE_CONTACT", AttentionController.TargetMode.SIDE, 0.05, 1.65, 0.18, -0.1, 0.35, 0.18),
				_step(&"CLOSED_POSTURE", AttentionController.TargetMode.FLOOR, 0.2, 1.1, 0.12, 0.0, -0.25, 0.3),
				_step(&"DELAYED_LOOK_BACK", AttentionController.TargetMode.NEAR_PLAYER, _rand_latency("look_back_min_s", "look_back_max_s"), 0.55, 0.05, 0.0, 0.0, 0.05, true),
			])
		&"OnPlayerTooClose":
			_queue_sequence(priority, [
				_step(&"LEAN_AWAY", AttentionController.TargetMode.PLAYER_BODY, 0.06, 0.72, -0.72, 0.0, 0.0, 0.45),
			])
		&"OnStepBack":
			_queue_sequence(priority, [
				_step(&"WATCH_AFTER_STEP", AttentionController.TargetMode.PLAYER_FACE, 0.05, 1.35, -0.15, 0.0, 0.0, 0.35),
			])
		&"OnPlayerFollowed":
			_queue_sequence(priority, [
				_step(&"GUARDED_WATCH", AttentionController.TargetMode.PLAYER_FACE, 0.08, 1.6, -0.28, 0.0, 0.0, 0.72),
			])
		&"OnWarning":
			_queue_sequence(priority, [
				_step(&"HOLD_BOUNDARY", AttentionController.TargetMode.PLAYER_FACE, 0.0, 1.35, -0.22, 0.0, 0.0, 0.65),
			])
		&"OnPlayerBackedOff":
			_queue_sequence(priority, [
				_step(&"CONFIRM_DISTANCE", AttentionController.TargetMode.NEAR_PLAYER, 0.25, 0.8, 0.0, 0.0, 0.0, 0.1),
				_step(&"RELAX_ATTENTION", AttentionController.TargetMode.FLOOR, 0.25, 0.9, 0.0, 0.0, -0.2, 0.0),
			])
		&"OnRecovered":
			_queue_sequence(priority, [
				_step(&"RETURN_TO_SELF", AttentionController.TargetMode.RANDOM_ENVIRONMENT_POINT, 0.4, 1.4, 0.0, 0.0, 0.0, 0.0),
			])


func _queue_sequence(priority: int, steps: Array) -> void:
	if priority < sequence_priority:
		return
	sequence.clear()
	for item: Variant in steps:
		if item is Dictionary:
			sequence.append(item)
	sequence_priority = priority
	_active_time = 0.0
	_start_next_step()


func _start_next_step() -> void:
	if sequence.is_empty():
		_release_expression()
		_schedule_micro_behaviour()
		return
	var step_data: Dictionary = sequence.pop_front()
	var delay: float = float(step_data.get("delay", 0.0))
	if delay > 0.0 and not bool(step_data.get("delay_consumed", false)):
		step_data["delay"] = 0.0
		step_data["delay_consumed"] = true
		sequence.push_front(step_data)
		current_behaviour = &"REACTION_DELAY"
		_active_time = delay
		next_action_in = delay
		return
	if bool(step_data.get("requires_stare", false)) and not perception.looking_at_elliot:
		step_data["attention"] = AttentionController.TargetMode.RANDOM_ENVIRONMENT_POINT
		step_data["name"] = &"CHECK_ENVIRONMENT"
	_activate(step_data)


func _activate(step_data: Dictionary) -> void:
	var action_name: StringName = StringName(step_data.get("name", "STILLNESS"))
	current_behaviour = action_name
	last_action = action_name
	_recent(action_name)
	if attention:
		attention.set_attention(int(step_data.get("attention", AttentionController.TargetMode.NONE)))
		attention.set_body_expression(
			float(step_data.get("lean", 0.0)), float(step_data.get("turn", 0.0)),
			float(step_data.get("shift", 0.0)), float(step_data.get("arms", 0.0))
		)
	_play_for_action(action_name)
	_active_time = float(step_data.get("duration", 1.0))
	next_action_in = _active_time
	action_cooldowns[action_name] = maxf(1.8, _active_time + 0.8)


func _play_for_action(action_name: StringName) -> void:
	if not ACTION_POOLS.has(action_name):
		return
	if behaviour == null:
		return
	var animator: NPCAnimator = behaviour.animator
	if animator == null:
		return
	animator.request(String(ACTION_POOLS[action_name]), AMBIENT_PRIORITY, 0.0)


func _select_contextual_micro_behaviour() -> void:
	var p: Dictionary = perception.snapshot()
	var social: Dictionary = social_state.snapshot()
	var candidates: Array[Dictionary] = []
	if not bool(p.get("aware", false)):
		candidates = [
			{"name": &"STILLNESS", "attention": AttentionController.TargetMode.NONE, "weight": 4.0},
			{"name": &"ENVIRONMENT_GLANCE", "attention": AttentionController.TargetMode.RANDOM_ENVIRONMENT_POINT, "weight": 1.0},
			{"name": &"WEIGHT_SHIFT", "attention": AttentionController.TargetMode.NONE, "weight": 0.55},
			{"name": &"FIDGET", "attention": AttentionController.TargetMode.NONE, "weight": 0.35},
		]
	else:
		var alertness: float = float(social.get("alertness", 0.0))
		var nervous: float = float(social.get("nervousness", 0.0))
		var comfort: float = float(social.get("comfort", 0.5))
		candidates = [
			{"name": &"STILLNESS", "attention": AttentionController.TargetMode.NONE, "weight": 2.1 + comfort},
			{"name": &"BRIEF_PLAYER_CHECK", "attention": AttentionController.TargetMode.PLAYER_BODY, "weight": 0.45 + alertness * 1.8},
			{"name": &"LOOK_NEAR_PLAYER", "attention": AttentionController.TargetMode.NEAR_PLAYER, "weight": 1.1 + alertness * 0.5},
			{"name": &"FLOOR_GLANCE", "attention": AttentionController.TargetMode.FLOOR, "weight": 0.45 + nervous * 1.8},
			{"name": &"SIDE_GLANCE", "attention": AttentionController.TargetMode.SIDE, "weight": 0.35 + nervous * 1.25},
			{"name": &"WEIGHT_SHIFT", "attention": AttentionController.TargetMode.NONE, "weight": 0.45 + nervous * 0.65},
			{"name": &"FIDGET", "attention": AttentionController.TargetMode.NONE, "weight": 0.30 + nervous * 1.10},
		]
	var chosen: Dictionary = _weighted_choice(candidates)
	var name: StringName = StringName(chosen.get("name", "STILLNESS"))
	var shift: float = _rng.randf_range(-0.7, 0.7) if name == &"WEIGHT_SHIFT" else 0.0
	var arms: float = float(social.get("nervousness", 0.0)) * 0.3 if name == &"WEIGHT_SHIFT" else 0.0
	_activate(_step(name, int(chosen.get("attention", AttentionController.TargetMode.NONE)), 0.0, _rng.randf_range(0.8, 1.8), 0.0, 0.0, shift, arms))


func _weighted_choice(candidates: Array[Dictionary]) -> Dictionary:
	var total: float = 0.0
	for candidate: Dictionary in candidates:
		var name: StringName = StringName(candidate.get("name", "STILLNESS"))
		var weight: float = float(candidate.get("weight", 0.0))
		if name in recent_actions:
			weight *= 0.12
		if float(action_cooldowns.get(name, 0.0)) > 0.0:
			weight = 0.0
		candidate["effective_weight"] = weight
		total += weight
	if total <= 0.001:
		return {"name": &"STILLNESS", "attention": AttentionController.TargetMode.NONE}
	var roll: float = _rng.randf() * total
	for candidate: Dictionary in candidates:
		roll -= float(candidate.get("effective_weight", 0.0))
		if roll <= 0.0:
			return candidate
	return candidates.back()


func _step(name: StringName, attention_mode: int, delay: float, duration: float, lean: float, turn: float, shift: float, arms: float, requires_stare: bool = false) -> Dictionary:
	return {"name": name, "attention": attention_mode, "delay": delay, "duration": duration,
		"lean": lean, "turn": turn, "shift": shift, "arms": arms, "requires_stare": requires_stare}


func _recent(action_name: StringName) -> void:
	recent_actions.push_front(action_name)
	while recent_actions.size() > 3:
		recent_actions.pop_back()


func _release_expression() -> void:
	current_behaviour = &"STILLNESS"
	if attention:
		attention.set_attention(AttentionController.TargetMode.NONE)
		attention.set_body_expression(0.0, 0.0, 0.0, 0.0)


func _schedule_micro_behaviour() -> void:
	_micro_timer = _rand_latency("micro_behaviour_min_s", "micro_behaviour_max_s")
	next_action_in = _micro_timer


func _rand_latency(min_key: String, max_key: String) -> float:
	return _rng.randf_range(float(latency.get(min_key, 0.2)), float(latency.get(max_key, 0.5)))


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing presence config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
