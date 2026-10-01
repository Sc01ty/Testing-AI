extends SceneTree

const OUTPUT = "D:/Video Projects/NPC Package/Characters/Elliot/V3"
var report: Dictionary = {"voice_integration": false, "errors": [], "captures": []}
var rig: Skeleton3D
var player: AnimationPlayer
var model: Node3D

func _initialize() -> void:
	call_deferred("run")

func find_type(node: Node, kind: String) -> Node:
	if node.is_class(kind): return node
	for child in node.get_children():
		var found = find_type(child, kind)
		if found: return found
	return null

func run() -> void:
	var world = Node3D.new()
	root.add_child(world)
	var packed = load("res://assets/elliot_game.glb") as PackedScene
	if not packed:
		push_error("V2 GLB did not import"); quit(1); return
	model = packed.instantiate()
	world.add_child(model)
	rig = find_type(model, "Skeleton3D") as Skeleton3D
	player = find_type(model, "AnimationPlayer") as AnimationPlayer
	if not rig or not player:
		push_error("V2 skeleton/animation player missing"); quit(1); return
	report["bone_count"] = rig.get_bone_count()
	for bone in ["Head", "Chest", "LeftUpperArm", "RightUpperArm", "RightHand", "Hips"]:
		if rig.find_bone(bone) < 0: report.errors.append("Missing bone " + bone)
	var names = player.get_animation_list()
	report["animations"] = Array(names)
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(OUTPUT + "/animation_manifest.json"))
	for entry in manifest.animations:
		if not names.has(entry.name): report.errors.append("Missing clip " + entry.name)
	var shape_count = 0
	for node in model.find_children("*", "MeshInstance3D", true, false):
		shape_count += node.get_blend_shape_count()
	report["blend_shape_count"] = shape_count
	if shape_count < 12: report.errors.append("Facial shape keys missing")
	# Exercise every imported animation, not only inventory it.
	var min_height = 100.0
	var max_height = -100.0
	for name in names:
		if name == "RESET": continue
		player.play(name)
		player.seek(player.get_animation(name).length * 0.5, true)
		await process_frame
		var head = rig.get_bone_global_pose(rig.find_bone("Head")).origin
		min_height = minf(min_height, head.y); max_height = maxf(max_height, head.y)
		if not head.is_finite(): report.errors.append("Non-finite head pose " + name)
	report["sampled_head_height_m"] = [min_height, max_height]
	if min_height < 0.5 or max_height > 2.4: report.errors.append("Implausible sampled head height")
	# Exercise morph blending independent of audio.
	for node in model.find_children("*", "MeshInstance3D", true, false):
		for i in range(node.get_blend_shape_count()): node.set_blend_shape_value(i, 0.35)
	await process_frame
	for node in model.find_children("*", "MeshInstance3D", true, false):
		for i in range(node.get_blend_shape_count()): node.set_blend_shape_value(i, 0.0)
	if "--capture" in OS.get_cmdline_user_args():
		var env = WorldEnvironment.new(); var environment = Environment.new()
		environment.background_mode = Environment.BG_COLOR; environment.background_color = Color(0.075, 0.09, 0.11)
		environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		environment.ambient_light_color = Color(0.8,0.85,0.9); environment.ambient_light_energy = 0.55
		env.environment = environment; world.add_child(env)
		var key = DirectionalLight3D.new();key.rotation_degrees = Vector3(-40,-35,0);key.light_energy = 1.3;world.add_child(key)
		var fill = OmniLight3D.new();fill.position=Vector3(-2,2,-2);fill.light_energy=1.8;fill.omni_range=7;world.add_child(fill)
		var floor_mesh=MeshInstance3D.new();var plane=PlaneMesh.new();plane.size=Vector2(20,20);floor_mesh.mesh=plane
		var mat=StandardMaterial3D.new();mat.albedo_color=Color(.12,.14,.16);mat.roughness=.9;floor_mesh.material_override=mat;world.add_child(floor_mesh)
		var camera = Camera3D.new(); world.add_child(camera)
		camera.position = Vector3(1.65, 1.45, -3.0);camera.look_at(Vector3(0,1.0,0));camera.fov=38;camera.current = true
		root.size=Vector2i(1000,1000)
		for item in [["IDLE_NERVOUS_A",0.5],["WALK_FORWARD",0.25],["STEP_BACK",0.5],["HAND_UP_BOUNDARY",0.65],["PHONE_RAISE_TO_EAR",0.9]]:
			if not names.has(item[0]): continue
			player.play(item[0]);player.seek(player.get_animation(item[0]).length*item[1],true)
			await process_frame;await process_frame;await RenderingServer.frame_post_draw
			var path=OUTPUT+"/Previews/Godot_"+item[0]+".png"
			root.get_texture().get_image().save_png(path);report.captures.append(path)
	var f=FileAccess.open(OUTPUT+"/godot_validation.json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"\t"));f.close()
	print("ELLIOT_V2_GODOT_VALIDATION ",JSON.stringify(report))
	quit(0 if report.errors.is_empty() else 1)

