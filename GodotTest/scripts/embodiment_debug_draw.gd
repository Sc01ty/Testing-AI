class_name EmbodimentDebugDraw
extends MeshInstance3D

## Draws what the embodiment layer is thinking: where he is walking, which way
## he judged he could retreat, where he was hit from, and the ambient idle
## points. Hidden unless debug is on.

@export var body: CharacterBody3D
@export var locomotion: LocomotionController
@export var contact: ContactResponder
@export var ambient: AmbientScheduler

var immediate: ImmediateMesh = ImmediateMesh.new()
var line_material: StandardMaterial3D = StandardMaterial3D.new()

const COLOUR_TARGET: Color = Color(0.35, 1.0, 0.55, 0.95)
const COLOUR_PATH: Color = Color(0.35, 1.0, 0.55, 0.35)
const COLOUR_IMPACT: Color = Color(1.0, 0.3, 0.25, 0.95)
const COLOUR_IDLE: Color = Color(0.5, 0.6, 0.85, 0.5)
const COLOUR_BLOCKED: Color = Color(1.0, 0.65, 0.1, 0.95)


func _ready() -> void:
	mesh = immediate
	line_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	line_material.vertex_color_use_as_albedo = true
	line_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	visible = false


func _process(_delta: float) -> void:
	if not visible or body == null:
		return
	global_position = body.global_position + Vector3.UP * 0.03
	global_rotation = Vector3.ZERO  # draw in world-aligned space

	immediate.clear_surfaces()
	immediate.surface_begin(Mesh.PRIMITIVE_LINES, line_material)

	# Ambient idle points he may wander to.
	for point: Vector3 in AmbientScheduler.IDLE_POINTS:
		var local: Vector3 = point - global_position
		local.y = 0.02
		_cross(local, 0.16, COLOUR_IDLE)

	if locomotion:
		if locomotion.mode != LocomotionController.Mode.IDLE:
			var target_local: Vector3 = locomotion.destination - global_position
			target_local.y = 0.03
			var colour: Color = COLOUR_BLOCKED if locomotion.blocked else COLOUR_TARGET
			# intended path
			immediate.surface_set_color(COLOUR_PATH)
			immediate.surface_add_vertex(Vector3(0, 0.05, 0))
			immediate.surface_add_vertex(target_local)
			_cross(target_local, 0.22, colour)
			_ring(target_local, 0.22, colour)

	if contact and contact.last_impact_vector.length_squared() > 0.001 and contact.cooldown > 0.0:
		# Where the hit came from, drawn at chest height while it is fresh.
		var impulse: Vector3 = contact.last_impact_vector.normalized() * 0.9
		immediate.surface_set_color(COLOUR_IMPACT)
		immediate.surface_add_vertex(Vector3(0, 1.15, 0))
		immediate.surface_add_vertex(Vector3(-impulse.x, 1.15, -impulse.z))

	immediate.surface_end()


func _cross(centre: Vector3, size: float, colour: Color) -> void:
	immediate.surface_set_color(colour)
	immediate.surface_add_vertex(centre + Vector3(-size, 0, 0))
	immediate.surface_add_vertex(centre + Vector3(size, 0, 0))
	immediate.surface_set_color(colour)
	immediate.surface_add_vertex(centre + Vector3(0, 0, -size))
	immediate.surface_add_vertex(centre + Vector3(0, 0, size))


func _ring(centre: Vector3, radius: float, colour: Color) -> void:
	var segments: int = 20
	for i in segments:
		var a: float = TAU * float(i) / float(segments)
		var b: float = TAU * float(i + 1) / float(segments)
		immediate.surface_set_color(colour)
		immediate.surface_add_vertex(centre + Vector3(cos(a) * radius, 0, sin(a) * radius))
		immediate.surface_add_vertex(centre + Vector3(cos(b) * radius, 0, sin(b) * radius))
