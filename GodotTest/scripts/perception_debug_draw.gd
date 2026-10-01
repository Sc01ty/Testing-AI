class_name PerceptionDebugDraw
extends MeshInstance3D

@export var perception: PlayerPerception
@export var attention: AttentionController
@export var segments: int = 64
var immediate: ImmediateMesh = ImmediateMesh.new()
var line_material: StandardMaterial3D = StandardMaterial3D.new()


func _ready() -> void:
	mesh = immediate
	line_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	line_material.vertex_color_use_as_albedo = true
	line_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _process(_delta: float) -> void:
	if not visible or not perception or perception.config.is_empty() or not perception.observer:
		return
	global_position = perception.observer.global_position + Vector3.UP * 0.025
	immediate.clear_surfaces()
	immediate.surface_begin(Mesh.PRIMITIVE_LINES, line_material)
	var ranges: Dictionary = perception.config["ranges"]
	_draw_ring(float(ranges["awareness_enter_m"]), Color(0.25, 0.65, 1.0, 0.5))
	_draw_ring(float(ranges["personal_enter_m"]), Color(1.0, 0.35, 0.2, 0.85))
	if perception.target:
		var local_target: Vector3 = perception.target.global_position - global_position
		immediate.surface_set_color(Color(0.3, 1.0, 0.45, 0.9) if perception.can_see_player else Color(1.0, 0.2, 0.2, 0.9))
		immediate.surface_add_vertex(Vector3(0, 1.55, 0))
		immediate.surface_add_vertex(local_target)
	if attention:
		var attention_point: Vector3 = attention.current_attention_point()
		if attention_point != Vector3.ZERO:
			immediate.surface_set_color(Color(1.0, 0.82, 0.2, 0.95))
			immediate.surface_add_vertex(Vector3(0, 1.58, 0))
			immediate.surface_add_vertex(attention_point - global_position)
	immediate.surface_end()


func _draw_ring(radius: float, color: Color) -> void:
	for i in segments:
		var a: float = TAU * float(i) / float(segments)
		var b: float = TAU * float(i + 1) / float(segments)
		immediate.surface_set_color(color)
		immediate.surface_add_vertex(Vector3(cos(a) * radius, 0, sin(a) * radius))
		immediate.surface_add_vertex(Vector3(cos(b) * radius, 0, sin(b) * radius))
