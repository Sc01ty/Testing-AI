import bpy,json,math
from pathlib import Path
from mathutils import Vector
p=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(p/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;cam=scene.camera
for side in ['Left','Right']:
    for suffix,delta,ratio in [('Eyeball',-.005,.012/.013),('Iris',-.0059,.0055/.006),('Pupil',-.006,.0024/.0027)]:
        obj=bpy.data.objects[side+'_'+suffix];center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        for v in obj.data.vertices:v.co=center+(v.co-center)*ratio+Vector((0,delta,0))
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
print('ELLIOT_EYE_FIT_FINALIZED')
