class_name ElliotPerformanceSystem
extends Node

signal performance_started(id: String)
signal performance_finished(id: String)
signal performance_interrupted(id: String)

const MANIFEST = "res://performance/manifest.json"
const ARMS = ["LeftUpperArm","LeftLowerArm","LeftHand","RightUpperArm","RightLowerArm","RightHand"]
const HEAD = ["Head","Neck"]
var manifest: Dictionary
var lines: Dictionary = {}
var model: Node3D
var face: MeshInstance3D
var skeleton: Skeleton3D
var original_player: AnimationPlayer
var base_player: AnimationPlayer
var gesture_player: AnimationPlayer
var head_player: AnimationPlayer
var audio: AudioStreamPlayer
var phone_controller: ElliotPerformancePhone
var shapes: Dictionary = {}
var line: Dictionary = {}
var mouth_cues: Array = []
var running: bool = false
var offline_clock: bool = false
var elapsed: float = 0.0
var lead: float = 0.0
var total_duration: float = 0.0
var voice_started: bool = false
var audio_start: float = 0.0
var origin: Transform3D
var phone_beats: Array = []
var last_base: String = ""
var last_gesture: String = ""
var last_head: String = ""
var seen_mouth: Dictionary = {}
var seen_clips: Dictionary = {}
var peak_mouth: float = 0.0
var peak_movement: float = 0.0
var phone_contact_distances: Array = []
var voice_finished: bool = false
var error: String = ""

func configure(character: Node3D) -> bool:
	model=character
	manifest=JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	if manifest.is_empty(): error="Missing manifest";return false
	for item in manifest.lines: lines[str(item.id)]=item
	for node in model.find_children("*","MeshInstance3D",true,false):
		if node.get_blend_shape_count() >= 21:
			face=node
			for i in range(face.get_blend_shape_count()): shapes[str(face.mesh.get_blend_shape_name(i))]=i
			break
	for node in model.find_children("*","Skeleton3D",true,false): skeleton=node;break
	original_player=find_player(model)
	if not face or not skeleton or not original_player: error="Missing rig or face";return false
	base_player=make_layer("PerformanceBase", "base")
	gesture_player=make_layer("PerformanceArms", "gesture")
	head_player=make_layer("PerformanceHead", "head")
	audio=AudioStreamPlayer.new();add_child(audio)
	audio.finished.connect(func(): voice_finished=true)
	phone_controller=ElliotPerformancePhone.new();phone_controller.character_root=model;add_child(phone_controller)
	return true

func find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:return node as AnimationPlayer
	for child in node.get_children():
		var found: AnimationPlayer=find_player(child)
		if found:return found
	return null

func make_layer(label: String, mask: String) -> AnimationPlayer:
	var layer=AnimationPlayer.new();layer.name=label;add_child(layer)
	layer.root_node=original_player.get_node(original_player.root_node).get_path()
	var library=AnimationLibrary.new()
	for animation_name in original_player.get_animation_list():
		var animation: Animation=original_player.get_animation(animation_name).duplicate(true)
		for i in range(animation.get_track_count()-1,-1,-1):
			var path: NodePath=animation.track_get_path(i)
			var bone: String=str(path.get_subname(0)) if path.get_subname_count()>0 else ""
			var keep: bool = (bone in ARMS) if mask=="gesture" else ((bone in HEAD) if mask=="head" else (not bone in ARMS and not bone in HEAD))
			if not keep or not (bone in ARMS or bone in HEAD or skeleton.find_bone(bone)>=0):animation.remove_track(i)
		for primitive in manifest.primitives.values():
			if str(primitive.clip)==str(animation_name) and bool(primitive.loop): animation.loop_mode=Animation.LOOP_LINEAR
		library.add_animation(animation_name,animation)
	layer.add_animation_library("",library)
	return layer

func clip_of(primitive: String, fallback: String="IDLE_NEUTRAL_A") -> String:
	return str(manifest.primitives.get(primitive,{}).get("clip",fallback))

func clip_length(clip: String) -> float:
	return original_player.get_animation(clip).length if original_player.has_animation(clip) else 1.0

func play_line(id: String) -> bool:
	if not lines.has(id):error="Unknown line "+id;return false
	stop_performance()
	line=lines[id].duplicate(true)
	var cues: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(str(manifest.cue_root)+str(line.cues)))
	if cues.is_empty():error="Missing mouth timing";return false
	mouth_cues=cues.mouthCues
	var bytes=FileAccess.get_file_as_bytes(str(manifest.voice_root)+str(line.audio))
	if bytes.is_empty():error="Missing audio";return false
	var stream=AudioStreamMP3.new();stream.data=bytes;audio.stream=stream
	line.duration=stream.get_length()
	elapsed=0.0;audio_start=0.0;voice_started=false;voice_finished=false
	seen_mouth.clear();seen_clips.clear();peak_mouth=0.0;peak_movement=0.0;phone_contact_distances.clear()
	origin=model.transform
	last_base="";last_gesture="";last_head="";phone_beats=[];lead=.25
	if str(line.prop)=="phone_call":
		var at: float=0.0
		for primitive in ["phone_pull_out","phone_look","phone_raise"]:
			phone_beats.append({"time":at,"primitive":primitive})
			at+=clip_length(clip_of(primitive)) if primitive!="phone_look" else .6
		phone_beats.append({"time":at,"primitive":"phone_talk"});lead=at+.15
		phone_beats.append({"time":lead+float(line.duration)+.3,"primitive":"phone_lower"})
		phone_beats.append({"time":lead+float(line.duration)+.3+clip_length(clip_of("phone_lower")),"primitive":"phone_put_away"})
		total_duration=float(phone_beats[-1].time)+clip_length(clip_of("phone_put_away"))+.3
	elif str(line.prop)=="check_phone":
		phone_beats=[{"time":0.0,"primitive":"phone_pull_out"},{"time":clip_length(clip_of("phone_pull_out")),"primitive":"phone_scroll"}]
		lead=float(phone_beats[1].time)+.3
		phone_beats.append({"time":lead+float(line.duration)+.55,"primitive":"phone_put_away"})
		total_duration=float(phone_beats[-1].time)+clip_length(clip_of("phone_put_away"))+.25
	else:total_duration=maxf(lead+float(line.duration)+1.1,2.6)
	original_player.stop()
	running=true;error=""
	performance_started.emit(id)
	return true

func stop_performance() -> void:
	if running:performance_interrupted.emit(str(line.get("id","")))
	running=false
	if audio:audio.stop();audio.stream=null
	for layer in [base_player,gesture_player,head_player]:
		if layer:layer.stop()
	reset_face()
	if phone_controller and phone_controller.phone:phone_controller.phone.visible=false
	if original_player:original_player.play("IDLE_NEUTRAL_A",.22)

func reset_face() -> void:
	if face:
		for i in range(face.get_blend_shape_count()):face.set_blend_shape_value(i,0.0)

func choose_layer(layer: AnimationPlayer, clip: String, previous: String) -> String:
	if clip!=previous and layer.has_animation(clip):
		layer.play(clip,float(manifest.crossfade_seconds));seen_clips[clip]=true
	return clip

func smooth_shape(key: String, target: float, delta: float, speed: float) -> void:
	if not shapes.has(key):return
	var index: int=int(shapes[key])
	face.set_blend_shape_value(index,lerpf(face.get_blend_shape_value(index),clampf(target,0.0,1.0),1.0-exp(-speed*delta)))

func _process(delta: float) -> void:
	if not running:return
	elapsed+=delta
	if not voice_started and elapsed>=lead:
		voice_started=true;audio_start=elapsed;audio.play()
	var speech_time: float=elapsed-audio_start if offline_clock else maxf(0.0,audio.get_playback_position()+AudioServer.get_time_since_last_mix()-AudioServer.get_output_latency())
	var mouth: Dictionary={}
	if voice_started and not voice_finished and speech_time<float(line.duration):
		for item in mouth_cues:
			if speech_time>=float(item.start) and speech_time<float(item.end):
				var key: String=str(manifest.mouth_mapping.get(str(item.value),""))
				if not key.is_empty():mouth[key]=.95
				seen_mouth[str(item.value)]=true;break
	for key in shapes:
		if str(key).begins_with("Viseme_") or key=="Jaw_Open":
			smooth_shape(str(key),float(mouth.get(key,0.0)),delta,42.0)
			peak_mouth=maxf(peak_mouth,face.get_blend_shape_value(int(shapes[key])))
	var envelope: float=smoothstep(0.0,.35,elapsed)*(1.0-smoothstep(total_duration-.55,total_duration-.12,elapsed))
	var expression: Dictionary=manifest.expressions[str(line.face)]
	for key in ["Brow_Up","Brow_Down","Brow_Concern","Smile","Frown"]:smooth_shape(key,float(expression.get(key,0.0))*envelope,delta,10.0)
	var eye: String=str(line.eyes)
	var away_start: float=lead+float(line.duration)*(.75 if eye=="regret_glance" else .35)
	var away: float=smoothstep(away_start,away_start+.28,elapsed)*envelope
	var left: float=away*.85 if eye in ["glance_away","regret_glance","phone_call"] else 0.0
	var down: float=away*.6 if eye in ["glance_away","regret_glance","look_at_floor","phone_screen"] else 0.0
	if eye=="look_at_floor" or eye=="phone_screen":down=envelope*.85
	if eye=="double_take":left=.8*(1.0-smoothstep(lead+.35,lead+.75,elapsed))*envelope
	for pair in [["Eye_Left",left],["Eye_Right",0.0],["Eye_Down",down],["Eye_Up",0.0]]:smooth_shape(str(pair[0]),float(pair[1]),delta,13.0)
	var blink: float=maxf(0.0,1.0-absf(fmod(elapsed+1.1,3.25)-1.55)/.085)
	for key in ["Blink_Left","Blink_Right"]:face.set_blend_shape_value(int(shapes[key]),blink)
	var action: String=str(line.action)
	var base: String=clip_of(action)
	if action in ["step_back","fast_step_back","startled_recoil"] and elapsed>clip_length(base)+.2:base=clip_of("nervous_idle")
	if action=="nervous_walk_away":base=clip_of("awkward_idle") if elapsed<.8 else clip_of("normal_walk")
	if action=="turn_away":base=clip_of("awkward_idle")
	last_base=choose_layer(base_player,base,last_base)
	var gesture: String=clip_of(str(line.gesture),base)
	if str(line.gesture)=="none":gesture=base
	if str(line.gesture) in ["annoyed","double_take","startled_recoil"] and elapsed>clip_length(gesture)+.3:gesture=base
	var phone_primitive: String=""
	for beat in phone_beats:
		if elapsed>=float(beat.time):phone_primitive=str(beat.primitive)
	if not phone_primitive.is_empty():gesture=clip_of(phone_primitive)
	last_gesture=choose_layer(gesture_player,gesture,last_gesture)
	var head: String=base
	if eye in ["glance_away","regret_glance"] and elapsed>=away_start:head=clip_of("glance_away")
	if eye=="look_at_floor" or eye=="phone_screen":head=clip_of("look_at_floor")
	if eye=="double_take":head="DOUBLE_TAKE" if elapsed<clip_length("DOUBLE_TAKE") else clip_of("look_back")
	if eye in ["look_back","watch_player"]:head=clip_of("look_back")
	if eye=="phone_call":head=clip_of("nervous_idle")
	last_head=choose_layer(head_player,head,last_head)
	if phone_controller.phone:phone_controller.phone.visible=not phone_primitive.is_empty() and elapsed<total_duration-.18
	var movement: float=0.0
	if action=="step_back":movement=.20*smoothstep(.12,1.15,elapsed)
	if action=="fast_step_back":movement=.30*smoothstep(.04,.65,elapsed)
	if action=="startled_recoil":movement=.11*smoothstep(.04,.5,elapsed)
	if action=="normal_walk":movement=-.5*maxf(0.0,elapsed-.2)
	if action=="nervous_walk_away":movement=.55*maxf(0.0,elapsed-.8)
	model.position=origin.origin+origin.basis*Vector3(0,0,movement)
	if action in ["turn_away","nervous_walk_away"]:model.basis=origin.basis*Basis(Vector3.UP,PI*smoothstep(.0,.8,elapsed))
	peak_movement=maxf(peak_movement,absf(movement))
	if elapsed>=total_duration:
		var id: String=str(line.id)
		running=false
		stop_performance()
		performance_finished.emit(id)

func snapshot() -> Dictionary:
	return {"id":line.get("id",""),"mouth_categories":seen_mouth.keys(),"peak_mouth":peak_mouth,"clips":seen_clips.keys(),"movement_m":peak_movement,"voice_started":voice_started,"voice_finished":voice_finished,"phone_contact_distances":phone_contact_distances.duplicate(),"error":error}
