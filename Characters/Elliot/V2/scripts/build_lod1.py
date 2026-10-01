import bpy,json
from pathlib import Path
p=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(p/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig']
for obj in list(bpy.context.scene.objects):
    if obj.name=='Hair_DirectionalStrands':bpy.data.objects.remove(obj,do_unlink=True)
    elif obj.type=='MESH' and obj.parent==arm and not obj.data.shape_keys:
        ratio=.4 if obj.name in ['Sweatshirt','Trousers'] else .65
        if len(obj.data.polygons)<80:continue
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        dec=obj.modifiers.new('Distance LOD optimization','DECIMATE');dec.ratio=ratio
        bpy.ops.object.modifier_move_up(modifier=dec.name);bpy.ops.object.modifier_apply(modifier=dec.name)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==arm]
triangles=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(p/'Godot/Elliot_V2_LOD1.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
bpy.ops.export_scene.fbx(filepath=str(p/'Unreal/Elliot_V2_LOD1.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
(p/'lod_manifest.json').write_text(json.dumps({'LOD0_triangles':json.loads((p/'animation_manifest.json').read_text())['triangle_count'],'LOD1_triangles':triangles,'same_skeleton':True,'facial_shapes_preserved':True,'automatic_switching_configured':False},indent=2))
print('ELLIOT_LOD1_COMPLETE',triangles)
