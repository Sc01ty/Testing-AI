import bpy,json
from pathlib import Path
p=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(p/'Unreal/Elliot_V2.fbx'))
rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
shapes=max(len(o.data.shape_keys.key_blocks)-1 if o.data.shape_keys else 0 for o in meshes)
assert rigs and len(rigs[0].data.bones)>=150
assert shapes==12,shapes
assert all(abs(k.value)<1e-6 for o in meshes if o.data.shape_keys for k in list(o.data.shape_keys.key_blocks)[1:]), 'FBX facial defaults not neutral'
assert all(o.vertex_groups for o in meshes),'Unweighted FBX mesh'
mesh_report={'bones':len(rigs[0].data.bones),'meshes':len(meshes),'facial_shapes':shapes}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(p/'Unreal/WALK_FORWARD.fbx'))
animations=[a for a in bpy.data.actions if a.frame_range[1]>a.frame_range[0]]
assert animations,'FBX animation missing'
report={'mesh_reimport':mesh_report,'walk_animation_reimport':[(a.name,list(a.frame_range)) for a in animations],'unreal_runtime_tested':False}
(p/'fbx_validation.json').write_text(json.dumps(report,indent=2))
print('ELLIOT_V2_FBX_REIMPORT',json.dumps(report))
