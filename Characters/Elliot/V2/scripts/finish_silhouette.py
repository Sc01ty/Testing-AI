import bpy,math,json
from pathlib import Path
from mathutils import Vector,Quaternion
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;body=bpy.data.objects['Face_Neck_Hands']
arm.animation_data.action=None
for pb in arm.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
for obj in [bpy.data.objects['Sweatshirt'],bpy.data.objects['Sweatshirt_RibbedEdges']]:
    for v in obj.data.vertices:
        amount=sum(g.weight for g in v.groups if any(s in obj.vertex_groups[g.group].name for s in ['UpperArm','LowerArm','upperarm02','lowerarm02']))
        if amount<.01:continue
        side='Left' if v.co.x<0 else 'Right';best=None
        for start,end in [('UpperArm','LowerArm'),('LowerArm','Hand')]:
            a=arm.data.bones[side+start].head_local;b=arm.data.bones[side+end].head_local
            t=max(0,min(1,(v.co-a).dot(b-a)/(b-a).length_squared));c=a+(b-a)*t
            dist=(v.co-c).length
            if best is None or dist<best[0]:best=(dist,c)
        v.co=best[1]+(v.co-best[1])*(1-.10*min(1,amount))
    obj.data.update()
collar=bpy.data.objects['Sweatshirt_CleanCrewNeck']
for r in range(4):
    rx,ry,z=[(.074,.079,1.535),(.066,.070,1.577),(.057,.061,1.579),(.064,.068,1.540)][r]
    for i in range(64):
        a=i/64*math.tau;collar.data.vertices[r*64+i].co=(rx*math.cos(a),.040+ry*math.sin(a),z-.008*math.sin(a))
collar.data.update()

# Let everyday idle arms hang with a little asymmetry; retain their subtle motion.
changed=[]
for name in ['IDLE_NERVOUS_A','IDLE_NERVOUS_B','NERVOUS_IDLE']:
    action=bpy.data.actions.get(name)
    if not action:continue
    arm.animation_data.action=action
    if action.slots:arm.animation_data.action_slot=action.slots[0]
    for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        for side,sign in [('Left',-1),('Right',1)]:
            breath=math.sin(frame/30*math.tau/3.4)*.009
            for segment,end,direction in [('UpperArm','LowerArm',Vector((sign*(.115+breath),.055,-1))),('LowerArm','Hand',Vector((sign*.045,.095+(0.025 if side=='Right' else 0),-1)))]:
                pb=arm.pose.bones[side+segment];rest=pb.bone
                axis=(arm.data.bones[side+end].head_local-rest.head_local).normalized()
                desired=axis.rotation_difference(direction.normalized()) @ rest.matrix_local.to_quaternion()
                parentq=pb.parent.matrix.to_quaternion() if pb.parent else Quaternion()
                localrest=rest.matrix_local.to_quaternion()
                if pb.parent:localrest=pb.parent.bone.matrix_local.to_quaternion().inverted() @ localrest
                pb.rotation_quaternion=localrest.inverted() @ parentq.inverted() @ desired
                pb.keyframe_insert('rotation_quaternion',frame=frame);bpy.context.view_layer.update()
    changed.append(action)
idle=bpy.data.actions['IDLE_NERVOUS_A'];arm.animation_data.action=idle;scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
cam=scene.camera;scene.cycles.samples=24
for name,pos,look,lens in [('Elliot_After_Front',(0,5.1,1.35),(0,0,1.02),65),('Elliot_V2_FullBody',(2.5,4.6,1.65),(0,0,1.02),65),('Elliot_V2_Face',(.58,1.32,1.76),(0,.085,1.715),85),('Elliot_V2_Profile',(2.2,.1,1.72),(0,.06,1.715),85)]:
    cam.location=pos;cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
    scene.render.filepath=str(P/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
cam.location=(0,5.1,1.35);cam.rotation_euler=(Vector((0,0,1.02))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
objects=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
scene.frame_start=0;scene.frame_end=120
bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_V2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
bpy.ops.export_scene.fbx(filepath=str(P/'Unreal/Elliot_V2.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
for action in changed:
    arm.animation_data.action=action;scene.frame_start=0;scene.frame_end=int(action.frame_range[1]);scene.frame_set(0)
    bpy.ops.export_scene.fbx(filepath=str(P/'Unreal'/f'{action.name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
arm.animation_data.action=idle;scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
print('ELLIOT_RELAXED_IDLE_COMPLETE',len(changed),flush=True)
