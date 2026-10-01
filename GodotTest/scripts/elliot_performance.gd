class_name ElliotPerformance
extends Node

signal performance_finished
var model: Node3D
var face: MeshInstance3D
var player: AnimationPlayer
var audio: AudioStreamPlayer
var shapes: Dictionary = {}
var cue: Dictionary = {}
var running: bool = false
var elapsed: float = 0.0
var offline_clock: bool = false
var last_clip: String = ""
var mouth_seen: Dictionary = {}
const VISEMES = {"A":"Viseme_MBP", "B":"Viseme_I", "C":"Viseme_E", "D":"Viseme_A", "E":"Viseme_O", "F":"Viseme_WQ", "G":"Viseme_FV", "H":"Viseme_L", "X":""}
const EXPRESSIONS = {
	"uncomfortable": {"Brow_Concern":0.8, "Frown":0.12},
	"uneasy_recognition": {"Brow_Up":0.35, "Brow_Concern":0.45, "Frown":0.08},
	"frightened": {"Brow_Up":0.7, "Brow_Concern":0.75, "Frown":0.18},
	"awkward_insult": {"Brow_Down":0.35, "Frown":0.15},
	"neutral": {}
}

func configure(character: Node3D) -> void:
	model = character
	for node in model.find_children("*", "MeshInstance3D", true, false):
		if node.get_blend_shape_count() >= 21:
			face = node
			for i in range(face.get_blend_shape_count()):
				shapes[str(face.mesh.get_blend_shape_name(i))] = i
			break
	player = find_player(model)
	audio = AudioStreamPlayer.new()
	add_child(audio)
	audio.finished.connect(_audio_finished)

func find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer: return node as AnimationPlayer
	for child in node.get_children():
		var found: AnimationPlayer = find_player(child)
		if found: return found
	return null

func play_performance(data: Dictionary) -> bool:
	if not face or not player: return false
	stop_performance()
	cue = data
	var stream: AudioStreamMP3 = AudioStreamMP3.load_from_file(str(cue.audio))
	if not stream: return false
	audio.stream = stream
	elapsed = 0.0
	mouth_seen.clear()
	running = true
	audio.play()
	return true

func stop_performance() -> void:
	running = false
	last_clip = ""
	if audio: audio.stop()
	reset_face()
	if model: model.position = Vector3.ZERO

func reset_face() -> void:
	if face:
		for i in range(face.get_blend_shape_count()): face.set_blend_shape_value(i, 0.0)

func set_shape(key: String, weight: float) -> void:
	if shapes.has(key): face.set_blend_shape_value(int(shapes[key]), clampf(weight, 0.0, 1.0))

func _audio_finished() -> void:
	# Body and expression continue for a short reaction after speech ends.
	for key in shapes:
		if str(key).begins_with("Viseme_") or key == "Jaw_Open": set_shape(key, 0.0)

func _process(delta: float) -> void:
	if not running: return
	elapsed += delta
	var speech_time: float = elapsed if offline_clock else maxf(0.0, audio.get_playback_position() + AudioServer.get_time_since_last_mix() - AudioServer.get_output_latency())
	reset_face()
	if audio.playing and speech_time < float(cue.duration):
		for item in cue.mouthCues:
			if speech_time >= float(item.start) and speech_time < float(item.end):
				var key: String = str(VISEMES.get(str(item.value), ""))
				set_shape(key, 0.9)
				mouth_seen[str(item.value)] = true
				break
	var emotion: float = smoothstep(0.0, 0.18, elapsed) * (1.0 - smoothstep(2.1, 2.8, elapsed))
	var expression: Dictionary = EXPRESSIONS.get(str(cue.get("expression", "uncomfortable")), EXPRESSIONS.uncomfortable)
	for key in expression: set_shape(str(key), float(expression[key]) * emotion)
	var away: float = smoothstep(0.75, 1.15, elapsed) * (1.0 - smoothstep(2.25, 2.7, elapsed))
	set_shape("Eye_Left", away * 0.85)
	set_shape("Eye_Down", away * 0.55)
	var blink: float = maxf(0.0, 1.0 - absf(elapsed - 1.55) / 0.085)
	set_shape("Blink_Left", blink); set_shape("Blink_Right", blink)
	var clip: String = "IDLE_NEUTRAL_A"
	var body: Array = cue.get("body", [{"time":0.0,"clip":"HAND_UP_BOUNDARY"},{"time":1.25,"clip":"STEP_BACK_SMALL"},{"time":2.25,"clip":"IDLE_NERVOUS_A"}])
	for beat in body:
		if elapsed >= float(beat.time): clip = str(beat.clip)
	if clip != last_clip:
		if player.has_animation(clip): player.play(clip, 0.12)
		last_clip = clip
	model.position.z = float(cue.get("retreat_m", 0.16)) * smoothstep(1.25, 2.15, elapsed)
	if elapsed >= 3.0:
		running = false
		reset_face()
		performance_finished.emit()
