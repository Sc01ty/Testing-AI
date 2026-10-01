extends Node

@export var character_root: Node
var face: MeshInstance3D
var left_blink: int = -1
var right_blink: int = -1
var remaining: float = 3.0
var elapsed: float = -1.0
var rng = RandomNumberGenerator.new()

func _ready() -> void:
	rng.seed = 0xE11072
	if not character_root: return
	for node in character_root.find_children("*", "MeshInstance3D", true, false):
		if node.mesh and node.get_blend_shape_count() >= 12:
			face = node
			for i in range(face.get_blend_shape_count()):
				var shape_name: String = str(face.mesh.get_blend_shape_name(i))
				if shape_name == "Blink_Left": left_blink = i
				if shape_name == "Blink_Right": right_blink = i
			break

func _process(delta: float) -> void:
	if not face or left_blink < 0 or right_blink < 0: return
	remaining -= delta
	if elapsed < 0.0 and remaining <= 0.0:
		elapsed = 0.0
		remaining = rng.randf_range(2.6, 5.6)
	if elapsed >= 0.0:
		elapsed += delta
		var weight: float = sin(clampf(elapsed / 0.19, 0.0, 1.0) * PI)
		face.set_blend_shape_value(left_blink, weight)
		face.set_blend_shape_value(right_blink, weight)
		if elapsed >= 0.19:
			face.set_blend_shape_value(left_blink, 0.0)
			face.set_blend_shape_value(right_blink, 0.0)
			elapsed = -1.0
