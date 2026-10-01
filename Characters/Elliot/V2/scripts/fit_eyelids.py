import bpy,json,math
from pathlib import Path
from mathutils import Vector
p=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(p/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];body=bpy.data.objects['Face_Neck_Hands'];scene=bpy.context.scene;cam=scene.camera
for key in body.data.shape_keys.key_blocks:key.value=0.0
if not body.get('socket_fit_v3'):
    for side in ['Left','Right']:
        for suffix in ['Eyeball','Iris','Pupil']:
            for v in bpy.data.objects[side+'_'+suffix].data.vertices:v.co.z+=.004
    for i,v in enumerate(body.data.vertices):
        if v.co.y<.13 or not 1.685<v.co.z<1.728:continue
        lower=sum(g.weight for g in v.groups if 'orbicularis04' in body.vertex_groups[g.group].name)
        upper=sum(g.weight for g in v.groups if 'orbicularis03' in body.vertex_groups[g.group].name)
        d=Vector((0,0,-.0015*lower+.0007*upper))
        for key in body.data.shape_keys.key_blocks:key.data[i].co+=d
    basis=body.data.shape_keys.key_blocks['Basis']
    for name in ['Blink_Left','Blink_Right']:
        key=body.data.shape_keys.key_blocks[name];cx=-.0305 if name.endswith('Left') else .0305
        for i,point in enumerate(basis.data):
            q=point.co.copy();eye=math.exp(-((q.x-cx)/.018)**4-((q.z-1.709)/.016)**4) if q.y>.12 else 0
            key.data[i].co=q+Vector((0,.001*eye,-(q.z-1.709)*eye*.98))
    body['socket_fit_v3']=True
scene.cycles.samples=24;scene.cycles.use_denoising=True
for name,pos,look,lens in [('Elliot_V2_Face',(.58,1.28,1.74),(0,.07,1.70),85),('Elliot_V2_FullBody',(2.5,4.6,1.65),(0,0,1.02),65),('Elliot_V2_Profile',(2.2,.1,1.72),(0,.04,1.70),85)]:
    cam.location=pos;cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;scene.render.filepath=str(p/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
cam.location=(2.5,4.6,1.65);cam.rotation_euler=(Vector((0,0,1.02))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
bpy.ops.wm.save_as_mainfile(filepath=str(p/'Blender/Elliot_V2.blend'))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for obj in scene.objects:
    if obj.type=='MESH' and obj.parent==arm:obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(p/'Godot/Elliot_V2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
bpy.ops.export_scene.fbx(filepath=str(p/'Unreal/Elliot_V2.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
for key in body.data.shape_keys.key_blocks:key.value=0.0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'Blender/Elliot_V2.blend'))
print('ELLIOT_EYELIDS_FITTED')
