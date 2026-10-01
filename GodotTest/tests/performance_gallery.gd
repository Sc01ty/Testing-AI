extends SceneTree

const OUTPUT="D:/Video Projects/NPC Package/Characters/Elliot/V3/Performance/Reusable"
var world: Node3D
var model: Node3D
var system: ElliotPerformanceSystem
var camera: Camera3D
var title: Label
var subtitle: Label
var selected: Array=[]
var index: int=-1
var gap: float=.45
var results: Array=[]
var failures: Array=[]
var capture_done: Dictionary={}
var render_mode: bool=false
var test_mode: bool=false
var replay: bool=false
var previous_keys: Dictionary={}
var interrupt_checked: bool=false
var closing: bool=false

func _initialize() -> void: call_deferred("build")

func build() -> void:
	root.size=Vector2i(1280,720)
	world=Node3D.new();root.add_child(world)
	model=(load("res://assets/elliot_game.glb") as PackedScene).instantiate();world.add_child(model)
	system=ElliotPerformanceSystem.new();world.add_child(system)
	if not system.configure(model):push_error(system.error);quit(1);return
	test_mode="--test" in OS.get_cmdline_user_args() or "--live-test" in OS.get_cmdline_user_args()
	render_mode="--reel" in OS.get_cmdline_user_args()
	system.offline_clock="--test" in OS.get_cmdline_user_args() or "--offline" in OS.get_cmdline_user_args()
	for item in system.manifest.lines:selected.append(str(item.id))
	if "--short" in OS.get_cmdline_user_args():selected=["CLOSE_01","INSULT_04","TELL_01","MEMORY_01","TRUST_02"]
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--line="):selected=[argument.trim_prefix("--line=")]
	if "--custom-probe" in OS.get_cmdline_user_args():
		var custom: Dictionary=system.lines["TRUST_02"].duplicate(true)
		custom.id="METADATA_PROBE";custom.face="frightened";custom.eyes="watch_player";custom.gesture="boundary_hand";custom.action="fast_step_back"
		system.lines["METADATA_PROBE"]=custom;selected=["METADATA_PROBE"]
		if system.play_line("UNKNOWN_LINE"):failures.append("Unknown line was accepted")
	var env=WorldEnvironment.new();var environment=Environment.new()
	environment.background_mode=Environment.BG_COLOR;environment.background_color=Color(.075,.095,.12)
	environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;environment.ambient_light_color=Color(.78,.84,.92);environment.ambient_light_energy=.7
	env.environment=environment;world.add_child(env)
	var key=DirectionalLight3D.new();key.rotation_degrees=Vector3(-35,-30,0);key.light_energy=1.4;world.add_child(key)
	var fill=OmniLight3D.new();fill.position=Vector3(-2,2,-2);fill.light_energy=1.6;fill.omni_range=9;world.add_child(fill)
	var floor_mesh=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(30,30);floor_mesh.mesh=plane
	var material=StandardMaterial3D.new();material.albedo_color=Color(.13,.16,.20);material.roughness=.9;floor_mesh.material_override=material;world.add_child(floor_mesh)
	camera=Camera3D.new();world.add_child(camera);camera.current=true
	var overlay=CanvasLayer.new();world.add_child(overlay)
	title=Label.new();title.position=Vector2(35,22);title.add_theme_font_size_override("font_size",28);overlay.add_child(title)
	if not render_mode and not test_mode:
		var controls=Label.new();controls.position=Vector2(35,60);controls.text="← / → choose a line   ·   Space replay   ·   Esc close";controls.add_theme_font_size_override("font_size",16);overlay.add_child(controls)
	subtitle=Label.new();subtitle.position=Vector2(40,652);subtitle.size=Vector2(1200,48);subtitle.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;subtitle.add_theme_font_size_override("font_size",24);subtitle.add_theme_color_override("font_shadow_color",Color.BLACK);subtitle.add_theme_constant_override("shadow_offset_y",2);overlay.add_child(subtitle)
	system.performance_finished.connect(finished)
	process_frame.connect(tick)

func start_next() -> void:
	index+=1
	if index>=selected.size():
		if test_mode or render_mode:finish_report();return
		index=0
	model.transform=Transform3D.IDENTITY
	var id: String=str(selected[index])
	if not system.play_line(id):failures.append(system.error);finish_report();return
	var action: String=str(system.line.action)
	if action in ["nervous_walk_away","normal_walk","step_back","fast_step_back","startled_recoil"]:
		camera.position=Vector3(.65,1.27,-3.7);camera.look_at(Vector3(0,1.0,.15));camera.fov=36
	elif str(system.line.prop)!="none":
		camera.position=Vector3(-.65,1.65,-2.2);camera.look_at(Vector3(0,1.45,0));camera.fov=34
	else:
		camera.position=Vector3(.20,1.62,-1.55);camera.look_at(Vector3(0,1.56,0));camera.fov=34
	title.text=str(system.line.category).replace("_"," ").capitalize()+"  ·  "+str(index+1)+" / "+str(selected.size())
	subtitle.text=""

func finished(id: String) -> void:
	var data: Dictionary=system.snapshot()
	data["reset_face"]=true
	for i in range(system.face.get_blend_shape_count()):
		if absf(system.face.get_blend_shape_value(i))>.0001:data.reset_face=false
	data["reset_prop"]=not system.phone_controller.phone.visible
	data["audio_stopped"]=not system.audio.playing
	if not data.voice_started or data.peak_mouth<.2:failures.append("Speech not exercised: "+id)
	if not data.reset_face or not data.reset_prop or not data.audio_stopped:failures.append("Incomplete reset: "+id)
	if str(system.line.prop)=="phone_call":
		if data.phone_contact_distances.is_empty():failures.append("Phone contact not measured: "+id)
		elif data.phone_contact_distances.max()>.09:failures.append("Phone too far from ear: "+id+" "+str(data.phone_contact_distances.max()))
	results.append(data);print("PERFORMANCE_LINE_PASS ",JSON.stringify(data))
	gap=.55

func tick() -> void:
	if not system or closing:return
	if system.running:
		if system.voice_started and not system.voice_finished:subtitle.text=str(system.line.recording).trim_suffix(".mp3").replace("-",", ")
		else:subtitle.text=""
		if str(system.line.prop)=="phone_call" and system.last_gesture=="PHONE_TALK_IDLE" and system.elapsed>system.lead+.35 and system.elapsed<system.lead+float(system.line.duration):
			var head_world: Vector3=system.skeleton.to_global(system.skeleton.get_bone_global_pose(system.skeleton.find_bone("Head")).origin)
			var ear: Vector3=head_world+model.basis*Vector3(.112,.085,.012)
			var distance: float=system.phone_controller.phone.global_position.distance_to(ear)
			system.phone_contact_distances.append(distance)
		if "--capture" in OS.get_cmdline_user_args() and not OS.has_feature("headless"):
			var id: String=str(system.line.id)
			if system.voice_started and system.elapsed>system.lead+float(system.line.duration)*.45 and not capture_done.has(id):
				capture_done[id]=true;capture(id)
		if test_mode and "--interrupt-test" in OS.get_cmdline_user_args() and not interrupt_checked and system.voice_started and system.elapsed>system.audio_start+.4:
			interrupt_checked=true;var id: String=str(system.line.id);system.stop_performance()
			if system.audio.playing or system.phone_controller.phone.visible:failures.append("Interrupt failed to stop audio/prop")
			for i in range(system.face.get_blend_shape_count()):
				if absf(system.face.get_blend_shape_value(i))>.0001:failures.append("Interrupt left a face value")
			model.transform=Transform3D.IDENTITY;system.play_line(id)
	else:
		gap-=root.get_process_delta_time()
		if gap<=0.0 and (index<0 or test_mode or render_mode or replay):replay=false;start_next()
	if not test_mode and not render_mode:
		for key in [KEY_RIGHT,KEY_LEFT,KEY_SPACE,KEY_ESCAPE]:
			var down: bool=Input.is_physical_key_pressed(key)
			if down and not bool(previous_keys.get(key,false)):
				if key==KEY_ESCAPE:quit();return
				system.stop_performance()
				if key==KEY_LEFT:index=(index-2+selected.size())%selected.size()
				if key==KEY_SPACE:index-=1
				replay=true;gap=0.0
			previous_keys[key]=down

func capture(id: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OUTPUT+"/Previews/"+id+".png")

func finish_report() -> void:
	closing=true
	var report={"performances":results,"failures":failures,"line_count":results.size(),"primitive_count":system.manifest.primitives.size(),"independent_layers":["base locomotion","upper-body gesture","head look","facial expression","speech mouth","phone prop"],"interrupt_tested":interrupt_checked,"appearance_locked":true,"jev_touched":false,"clock":"offline" if system.offline_clock else "audio playback"}
	var filename: String="gallery_render_validation.json" if render_mode else ("gallery_test_validation.json" if system.offline_clock else "gallery_live_validation.json")
	if "--short" in OS.get_cmdline_user_args():filename="gallery_short_render_validation.json"
	if "--custom-probe" in OS.get_cmdline_user_args():filename="metadata_probe_validation.json"
	var path: String=OUTPUT+"/"+filename
	var file=FileAccess.open(path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ELLIOT_REUSABLE_PERFORMANCES_COMPLETE ",results.size()," failures=",failures.size())
	var wait_for_mixer: bool=test_mode and system.offline_clock
	world.queue_free()
	await process_frame
	# Let the real audio mixer release stopped playback during accelerated tests.
	if wait_for_mixer:OS.delay_msec(60)
	await process_frame
	quit(0 if failures.is_empty() else 1)
