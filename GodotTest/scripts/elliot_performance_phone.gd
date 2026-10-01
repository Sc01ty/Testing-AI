class_name ElliotPerformancePhone
extends Node

var character_root: Node3D
var phone: Node3D
var attachment: BoneAttachment3D

func _ready() -> void:
	var rig: Skeleton3D
	for node in character_root.find_children("*","Skeleton3D",true,false):rig=node;break
	if not rig or rig.find_bone("RightHand")<0:return
	attachment=BoneAttachment3D.new();attachment.name="PerformancePhoneSocket";rig.add_child(attachment);attachment.bone_name="RightHand"
	phone=(load("res://assets/elliot_phone.glb") as PackedScene).instantiate();attachment.add_child(phone)
	var rest_inverse: Basis=rig.get_bone_global_rest(rig.find_bone("RightHand")).basis.inverse()
	phone.transform=Transform3D(rest_inverse*Basis.from_euler(Vector3(deg_to_rad(12.0),0,deg_to_rad(-8.0))),rest_inverse*Vector3(0,-.045,.012))
	phone.visible=false

func _exit_tree() -> void:
	if is_instance_valid(attachment):attachment.queue_free()
