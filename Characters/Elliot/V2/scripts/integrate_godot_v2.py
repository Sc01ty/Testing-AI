"""Non-audio integration, with explicit V1 rollback copies."""
from pathlib import Path
import shutil
root=Path(r'D:\Video Projects\NPC Package');godot=root/'GodotTest';out=root/'Characters/Elliot/V2';backup=out/'IntegrationBackup';backup.mkdir(exist_ok=True)
main=godot/'main.tscn'
if not (backup/'main.tscn').exists():shutil.copy2(main,backup/'main.tscn')
text=main.read_text();text=text.replace('res://assets/elliot_rigged.glb','res://assets/elliot_v2.glb')
if '18_face' not in text:
    text=text.replace('load_steps=24','load_steps=25')
    text=text.replace('[sub_resource type="BoxMesh"', '[ext_resource type="Script" path="res://scripts/elliot_face.gd" id="18_face"]\n\n[sub_resource type="BoxMesh"',1)
    text+='\n[node name="FaceController" type="Node" parent="Elliot" node_paths=PackedStringArray("character_root")]\nscript = ExtResource("18_face")\ncharacter_root = NodePath("../Model")\n'
main.write_text(text)
shutil.copy2(out/'Godot/Elliot_V2.glb',godot/'assets/elliot_v2.glb')
shutil.copy2(backup/'main.tscn',godot/'main_v1.tscn')
attention=godot/'scripts/attention_controller.gd'
if not (backup/'attention_controller.gd').exists():shutil.copy2(attention,backup/'attention_controller.gd')
text=attention.read_text()
if 'func _offset_in_parent_space' not in text:
    text=text.replace('head_offset * head_base','_offset_in_parent_space(head_bone, head_offset) * head_base')
    text=text.replace('chest_offset * chest_base','_offset_in_parent_space(chest_bone, chest_offset) * chest_base')
    text=text.replace('Quaternion(Vector3.FORWARD, -arm_angle) * left_base','_offset_in_parent_space(left_arm_bone, Quaternion(Vector3.FORWARD, -arm_angle)) * left_base')
    text=text.replace('Quaternion(Vector3.FORWARD, arm_angle * 0.75) * right_base','_offset_in_parent_space(right_arm_bone, Quaternion(Vector3.FORWARD, arm_angle * 0.75)) * right_base')
    text+='\n\n# Convert skeleton-space offsets into the animated parent frame. V2 uses an\n# anatomical rig; V1 world-aligned rests remain supported.\nfunc _offset_in_parent_space(bone_index: int, offset: Quaternion) -> Quaternion:\n\tvar parent_index: int = skeleton.get_bone_parent(bone_index)\n\tif parent_index < 0:\n\t\treturn offset\n\tvar parent_rotation: Quaternion = skeleton.get_bone_global_pose(parent_index).basis.get_rotation_quaternion()\n\treturn parent_rotation.inverse() * offset * parent_rotation\n'
    attention.write_text(text)
phone=godot/'scripts/phone_controller.gd'
if not (backup/'phone_controller.gd').exists():shutil.copy2(phone,backup/'phone_controller.gd')
text=phone.read_text()
if 'var _socket_rest_inverse' not in text:
    text=text.replace('var attach_offset: Vector3', 'var _socket_rest_inverse: Basis = Basis.IDENTITY\n\nvar attach_offset: Vector3')
    text=text.replace('attachment.bone_name = bone_name','attachment.bone_name = bone_name\n\t_socket_rest_inverse = skeleton.get_bone_global_rest(skeleton.find_bone(bone_name)).basis.inverse()')
    text=text.replace('phone.position = attach_offset\n\tphone.rotation = Vector3(\n\t\tdeg_to_rad(attach_rotation.x), deg_to_rad(attach_rotation.y), deg_to_rad(attach_rotation.z))','var rotation_radians: Vector3 = Vector3(\n\t\tdeg_to_rad(attach_rotation.x), deg_to_rad(attach_rotation.y), deg_to_rad(attach_rotation.z))\n\tphone.transform = Transform3D(_socket_rest_inverse * Basis.from_euler(rotation_radians), _socket_rest_inverse * attach_offset)')
    phone.write_text(text)
print('ELLIOT_V2_GODOT_INTEGRATED; V1 preserved at main_v1.tscn; no audio changes')
