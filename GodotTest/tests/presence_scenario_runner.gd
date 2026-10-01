extends Node

const TEST_TIME_SCALE := 8.0

var states: Array[String] = []
var events: Array[String] = []
var actions: Array[String] = []
var attentions: Array[String] = []
var start_elliot_position: Vector3 = Vector3.ZERO


func _ready() -> void:
	await _run()


func _run() -> void:
	Engine.time_scale = TEST_TIME_SCALE
	var packed: PackedScene = load("res://main.tscn")
	var scenario_ids: Array[String] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]
	var failures: int = 0
	for scenario_id: String in scenario_ids:
		var scene: Node3D = packed.instantiate()
		add_child(scene)
		await get_tree().process_frame
		await get_tree().physics_frame
		_reset_recording(scene)
		await _run_scenario(scenario_id, scene)
		var result: Dictionary = _result(scenario_id, scene)
		if not bool(result["passed"]):
			failures += 1
		print("SCENARIO_", scenario_id, " ", JSON.stringify(result))
		scene.queue_free()
		await get_tree().process_frame
	Engine.time_scale = 1.0
	print("PRESENCE_SCENARIOS_COMPLETE failures=", failures)
	get_tree().quit(failures)


func _reset_recording(scene: Node3D) -> void:
	states.clear(); events.clear(); actions.clear(); attentions.clear()
	var behaviour: NPCBehaviourController = scene.get_node("Elliot/BehaviourController")
	var event_bus: BehaviourEventBus = scene.get_node("Elliot/BehaviourEvents")
	behaviour.state_changed.connect(_on_state_changed)
	event_bus.behaviour_event.connect(_on_event)
	start_elliot_position = (scene.get_node("Elliot") as Node3D).global_position
	_sample(scene)


func _run_scenario(id: String, scene: Node3D) -> void:
	var player: Node3D = scene.get_node("Player")
	var elliot: Node3D = scene.get_node("Elliot")
	match id:
		"A":
			player.global_position = Vector3(-4.0, 0.0, -2.8)
			_look_away(player)
			await _move(scene, player, Vector3(4.0, 0.0, -2.8), 4.0, false)
		"B":
			player.global_position = Vector3(2.3, 0.0, -2.2)
			_look_away(player)
			await _hold(scene, 7.0)
		"C":
			player.global_position = Vector3(0.0, 0.0, -3.0)
			_look_at(player, elliot)
			await _hold(scene, 0.65)
			_look_away(player)
			await _hold(scene, 3.0)
		"D":
			player.global_position = Vector3(0.0, 0.0, -2.8)
			_look_at(player, elliot)
			await _hold(scene, 7.5)
		"E":
			player.global_position = Vector3(0.0, 0.0, -4.5)
			_look_at(player, elliot)
			await _move(scene, player, Vector3(0.0, 0.0, -2.0), 5.0, true)
			await _hold(scene, 2.0)
		"F":
			player.global_position = Vector3(0.0, 0.0, -2.3)
			_look_at(player, elliot)
			await _move(scene, player, Vector3(0.0, 0.0, -1.35), 0.25, true)
			await _hold(scene, 2.0)
		"G":
			player.global_position = Vector3(0.0, 0.0, -1.18)
			_look_at(player, elliot)
			await _hold(scene, 3.2)
		"H":
			player.global_position = Vector3(0.0, 0.0, -1.18)
			_look_at(player, elliot)
			await _follow_elliot(scene, player, elliot, 4.5, 1.18)
		"I":
			player.global_position = Vector3(0.0, 0.0, -1.2)
			_look_at(player, elliot)
			await _hold(scene, 2.5)
			await _move(scene, player, Vector3(0.0, 0.0, -2.5), 0.8, true)
			await _move(scene, player, elliot.global_position + Vector3(0.0, 0.0, -1.15), 0.8, true)
			await _follow_elliot(scene, player, elliot, 4.0, 1.15)
		"J":
			player.global_position = Vector3(0.0, 0.0, -1.15)
			_look_at(player, elliot)
			await _follow_elliot(scene, player, elliot, 4.0, 1.15)
			await _move(scene, player, Vector3(0.0, 0.0, -3.5), 1.2, false)
			_look_away(player)
			await _hold(scene, 12.0)
		"K":
			player.global_position = Vector3(0.0, 0.0, -2.8)
			_look_at(player, elliot)
			await _hold(scene, 2.0)
			player.global_position = Vector3(0.0, 0.0, -8.0)
			_look_away(player)
			await _hold(scene, 22.0)
			# He may have wandered to another idle point while alone, which is the
			# ambient scheduler working. Return to where he actually is rather than
			# to where he was left, or this tests the scheduler instead of recovery.
			var approach: Vector3 = elliot.global_position + Vector3(0.0, 0.0, -2.6)
			approach.y = 0.0
			player.global_position = approach
			_look_at(player, elliot)
			await _hold(scene, 3.0)


func _hold(scene: Node3D, game_seconds: float) -> void:
	var frames: int = maxi(1, int(ceil(game_seconds * 60.0 / TEST_TIME_SCALE)))
	for _i: int in frames:
		_sample(scene)
		await get_tree().physics_frame


func _move(scene: Node3D, player: Node3D, end: Vector3, game_seconds: float, face_elliot: bool) -> void:
	var start: Vector3 = player.global_position
	var frames: int = maxi(2, int(ceil(game_seconds * 60.0 / TEST_TIME_SCALE)))
	var elliot: Node3D = scene.get_node("Elliot")
	for i: int in frames:
		var progress: float = float(i + 1) / float(frames)
		player.global_position = start.lerp(end, progress)
		if face_elliot:
			_look_at(player, elliot)
		_sample(scene)
		await get_tree().physics_frame


func _follow_elliot(scene: Node3D, player: Node3D, elliot: Node3D, game_seconds: float, distance: float) -> void:
	var frames: int = maxi(2, int(ceil(game_seconds * 60.0 / TEST_TIME_SCALE)))
	for _i: int in frames:
		var forward: Vector3 = -elliot.global_basis.z
		forward.y = 0.0
		player.global_position = elliot.global_position + forward.normalized() * distance 
		_look_at(player, elliot)
		_sample(scene)
		await get_tree().physics_frame


func _look_at(player: Node3D, elliot: Node3D) -> void:
	player.look_at(Vector3(elliot.global_position.x, player.global_position.y, elliot.global_position.z), Vector3.UP)


func _look_away(player: Node3D) -> void:
	player.rotation = Vector3.ZERO


func _sample(scene: Node3D) -> void:
	var presence: Node = scene.get_node("Elliot/PresenceController")
	var attention: AttentionController = scene.get_node("Elliot/AttentionController")
	var action: String = String(presence.current_behaviour)
	var attention_name: String = String(attention.attention_name())
	if actions.is_empty() or actions.back() != action:
		actions.append(action)
	if attentions.is_empty() or attentions.back() != attention_name:
		attentions.append(attention_name)


func _on_state_changed(_previous: StringName, current: StringName) -> void:
	var value: String = String(current)
	if states.is_empty() or states.back() != value:
		states.append(value)


func _on_event(event_name: StringName, _context: Dictionary) -> void:
	events.append(String(event_name))


func _result(id: String, scene: Node3D) -> Dictionary:
	var elliot: Node3D = scene.get_node("Elliot")
	var perception: PlayerPerception = scene.get_node("Elliot/PlayerPerception")
	var social: Node = scene.get_node("Elliot/SocialState")
	var moved: float = start_elliot_position.distance_to(elliot.global_position)
	var passed: bool = true
	match id:
		"A": passed = not "STEP_BACK" in states and not "WARNING" in states
		"B": passed = not "GLANCE_AWAY" in states and not "STEP_BACK" in states
		"C": passed = not "OnLongStare" in events and not "STEP_BACK" in states
		"D": passed = "OnLongStare" in events and "BREAK_EYE_CONTACT" in actions
		"E": passed = social.alertness > 0.2 and not "STEP_BACK" in states
		"F": passed = "STEP_BACK" in states and moved >= 0.18
		"G": passed = states.count("STEP_BACK") == 1 and not perception.followed_after_step_back
		"H": passed = "OnPlayerFollowed" in events and "WARNING" in states
		"I": passed = "OnRepeatedBoundaryViolation" in events and "WARNING" in states
		"J": passed = "OnPlayerBackedOff" in events and social.comfort > 0.25
		"K": passed = "OnRecovered" in events and events.count("OnPlayerNoticed") >= 2
	return {
		"passed": passed, "states": states.duplicate(), "events": events.duplicate(),
		"actions": actions.duplicate(), "attention": attentions.duplicate(),
		"moved_m": snappedf(moved, 0.01), "followed": perception.followed_after_step_back,
		"social": social.snapshot(),
	}
