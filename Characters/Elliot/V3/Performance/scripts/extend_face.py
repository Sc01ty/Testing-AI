import bpy, json, hashlib
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_Game.blend'))
arm=bpy.data.objects['ElliotRig']; face=bpy.data.objects['Face controls']
meshes=[o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
def fingerprint():
    state={o.name:{'vertices':[list(v.co) for v in o.data.vertices], 'faces':[list(p.vertices) for p in o.data.polygons], 'matrix':[list(row) for row in o.matrix_local], 'materials':[m.name for m in o.data.materials]} for o in meshes}
    state['rest_bones']={b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}
    return hashlib.sha256(json.dumps(state,sort_keys=True).encode()).hexdigest()
before=fingerprint()
basis=face.data.shape_keys.key_blocks['Basis']
for name in ['Viseme_I','Viseme_U','Viseme_L','Viseme_WQ','Eye_Left','Eye_Right','Eye_Up','Eye_Down','Brow_Concern']:
    key=face.data.shape_keys.key_blocks.get(name) or face.shape_key_add(name=name)
    for i,v in enumerate(basis.data):
        p=v.co.copy()
        if i in range(24,28):
            if name=='Viseme_I': p.x*=1.12; p.z=1.627+(p.z-1.627)*2.5
            if name=='Viseme_U': p.x*=.50; p.z=1.625+(p.z-1.627)*3
            if name=='Viseme_L': p.x*=.85; p.z=1.625+(p.z-1.627)*3.5
            if name=='Viseme_WQ': p.x*=.42; p.z=1.626+(p.z-1.627)*2
        if i in list(range(4,8))+list(range(16,20)):
            if name=='Eye_Left': p.x-=.008
            if name=='Eye_Right': p.x+=.008
            if name=='Eye_Up': p.z+=.003
            if name=='Eye_Down': p.z-=.003
        if name=='Brow_Concern' and i in list(range(8,12))+list(range(20,24)):
            p.z+=.004*(1-min(abs(p.x)/.06,1))
        key.data[i].co=p
for key in face.data.shape_keys.key_blocks: key.value=0
assert before==fingerprint(), 'Approved rest geometry changed'
(P/'Performance/style_lock.json').write_text(json.dumps({'approved_rest_sha256':before,'unchanged_after_performance_controls':True,'locked':'geometry, proportions, clothing, material assignments, bone rest transforms','facial_shapes':[k.name for k in face.data.shape_keys.key_blocks][1:]},indent=2))
arm.animation_data.action=bpy.data.actions['IDLE_NEUTRAL_A'];bpy.context.scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_Game.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_def_bones=True)
bpy.ops.export_scene.fbx(filepath=str(P/'Unreal/Elliot_Game.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',use_mesh_modifiers=False)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_Game.blend'))
manifest=json.loads((P/'animation_manifest.json').read_text());manifest['facial_shapes']=[k.name for k in face.data.shape_keys.key_blocks][1:];manifest['appearance_locked']=True
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
print('PERFORMANCE_FACE_READY',len(manifest['facial_shapes']),before)
