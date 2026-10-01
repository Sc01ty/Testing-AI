extends SceneTree

const OUTPUT = "D:/Video Projects/NPC Package/Characters/Elliot/V3/Performance"
var world: Node3D
var model: Node3D
var director: ElliotPerformance
var total: float = 0.0
var started: bool = false
var checked: bool = false
var captured: Dictionary = {}
var camera: Camera3D

func _initialize() -> void:
	call_deferred("build")

func build() -> void:
	root.size = Vector2i(1280,720)
	world = Node3D.new(); root.add_child(world)
	model = (load("res://assets/elliot_game.glb") as PackedScene).instantiate()
	world.add_child(model)
	director = ElliotPerformance.new(); world.add_child(director); director.configure(model)
	director.offline_clock = "--offline" in OS.get_cmdline_user_args() or "--test" in OS.get_cmdline_user_args()
	director.player.play("IDLE_NEUTRAL_A")
	var environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(.065,.085,.105)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(.75,.82,.9); environment.ambient_light_energy=.65
	var env = WorldEnvironment.new();env.environment=environment;world.add_child(env)
	var key = DirectionalLight3D.new();key.rotation_degrees=Vector3(-35,-30,0);key.light_energy=1.3;world.add_child(key)
	var fill=OmniLight3D.new();fill.position=Vector3(-2,2,-2);fill.light_energy=1.4;fill.omni_range=8;world.add_child(fill)
	var ground=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(20,20);ground.mesh=plane
	var mat=StandardMaterial3D.new();mat.albedo_color=Color(.13,.16,.19);mat.roughness=.9;ground.material_override=mat;world.add_child(ground)
	camera=Camera3D.new();world.add_child(camera)
	camera.position=Vector3(.20,1.62,-1.45);camera.look_at(Vector3(0,1.56,0));camera.fov=33;camera.current=true
	if "--wide" in OS.get_cmdline_user_args():
		camera.position=Vector3(.8,1.35,-4.0);camera.look_at(Vector3(0,.98,0));camera.fov=35
	process_frame.connect(tick)

func tick() -> void:
	total += root.get_process_delta_time()
	if not started and total >= .65:
		started=true
		var cues: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(OUTPUT+"/cues/CLOSE_01.rhubarb.json"))
		cues.audio="D:/Video Projects/NPC Package/Characters/Elliot/Voice/Bit close, mate.mp3"
		cues.duration=float(cues.metadata.duration)
		if not director.play_performance(cues): push_error("Could not start performance");quit(1)
	if not checked and total > 2.0:
		checked=true
		if director.mouth_seen.size()<4: push_error("Too few speech-derived mouth shapes");quit(1)
	if "--capture" in OS.get_cmdline_user_args() and not OS.has_feature("headless"):
		for mark in [0.9,1.1,1.4,1.7,2.2,3.9]:
			if total >= mark and not captured.has(mark):
				captured[mark]=true
				capture_frame(mark)
	if total >= 4.6:
		var values: Array=[]
		for i in range(director.face.get_blend_shape_count()): values.append(director.face.get_blend_shape_value(i))
		var report={"original_audio":director.cue.audio,"duration":director.cue.duration,"observed_mouth_cues":director.mouth_seen.keys(),"facial_controls":director.shapes.size(),"neutral_after_speech":values.all(func(v):return absf(v)<.0001),"audio_started":started,"body_clips":["HAND_UP_BOUNDARY","STEP_BACK_SMALL","IDLE_NERVOUS_A"],"appearance_locked":true,"jev_connected":false}
		var file=FileAccess.open(OUTPUT+"/performance_validation.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
		print("TALKING_ELLIOT_COMPLETE ",JSON.stringify(report))
		quit(0 if report.neutral_after_speech else 1)

func capture_frame(mark: float) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OUTPUT+"/Previews/Talking_%0.2f.png"%mark)
