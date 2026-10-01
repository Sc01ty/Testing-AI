import bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Quaternion
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3')
bpy.ops.wm.open_mainfile(filepath=str(P/'Performance/Milestones/First_Talking_Shot/Elliot_Game.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene
meshes=[o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
def fingerprint():
    state={o.name:{'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'matrix':[list(row) for row in o.matrix_local],'materials':[m.name for m in o.data.materials]} for o in meshes}
    state['rest_bones']={b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}
    return hashlib.sha256(json.dumps(state,sort_keys=True).encode()).hexdigest()
before=fingerprint();assert before==json.loads((P/'Performance/style_lock.json').read_text())['approved_rest_sha256']
names=['PHONE_RAISE_TO_EAR','PHONE_TALK_IDLE','PHONE_LISTEN_IDLE','PHONE_END_CALL','PHONE_LOWER_SLIGHTLY']
report={}
def rotation_world(pb,q):
    parent=pb.parent.matrix.to_quaternion() if pb.parent else Quaternion()
    rest=pb.bone.matrix_local.to_quaternion()
    if pb.parent:rest=pb.parent.bone.matrix_local.to_quaternion().inverted() @ rest
    pb.rotation_quaternion=rest.inverted() @ parent.inverted() @ q
    bpy.context.view_layer.update()
for name in names:
    action=bpy.data.actions[name];arm.animation_data.action=action
    if action.slots:arm.animation_data.action_slot=action.slots[0]
    start,end=map(int,action.frame_range);original={}
    for frame in range(start,end+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        original[frame]={b.name:b.matrix_basis.copy() for b in arm.pose.bones}
    errors=[]
    for frame in range(start,end+1):
        scene.frame_set(frame)
        for n,m in original[frame].items():arm.pose.bones[n].matrix_basis=m
        bpy.context.view_layer.update()
        upper=arm.pose.bones['RightUpperArm'];lower=arm.pose.bones['RightLowerArm'];hand=arm.pose.bones['RightHand'];head=arm.pose.bones['Head']
        t=(frame-start)/max(1,end-start);ease=t*t*(3-2*t)
        weight=ease if name=='PHONE_RAISE_TO_EAR' else (1-ease if name=='PHONE_END_CALL' else (0.85 if name=='PHONE_LOWER_SLIGHTLY' else 1))
        shoulder=upper.matrix.translation.copy();elbow=lower.matrix.translation.copy();wrist=hand.matrix.translation.copy()
        target=head.matrix @ Vector((.125,.0,.055))
        # Head local axes differ from world axes: use its world position and
        # fixed character-space offset so the wrist lies beside the real ear.
        target=head.matrix.translation+Vector((.125,.008,.055))
        goal=wrist.lerp(target,weight)
        l1=(elbow-shoulder).length;l2=(wrist-elbow).length
        axis=(goal-shoulder).normalized();distance=min(max((goal-shoulder).length,abs(l1-l2)+.0001),l1+l2-.0001)
        a=(l1*l1-l2*l2+distance*distance)/(2*distance);h=math.sqrt(max(0,l1*l1-a*a))
        pole=Vector((.45,.75,1.5))-shoulder;pole=(pole-axis*pole.dot(axis)).normalized()
        desired_elbow=shoulder+axis*a+pole*h
        q=(elbow-shoulder).normalized().rotation_difference((desired_elbow-shoulder).normalized()) @ upper.matrix.to_quaternion()
        rotation_world(upper,q)
        current_wrist=hand.matrix.translation.copy();current_elbow=lower.matrix.translation.copy()
        q=(current_wrist-current_elbow).normalized().rotation_difference((goal-current_elbow).normalized()) @ lower.matrix.to_quaternion()
        rotation_world(lower,q)
        current_axis=hand.matrix.to_quaternion() @ Vector((0,1,0))
        desired_axis=current_axis.lerp(Vector((0,0,1)),weight).normalized()
        rotation_world(hand,current_axis.rotation_difference(desired_axis) @ hand.matrix.to_quaternion())
        errors.append((hand.matrix.translation-goal).length)
        for b in [upper,lower,hand]:b.keyframe_insert('rotation_quaternion',frame=frame)
    report[name]={'frames':end-start+1,'max_wrist_target_error_m':max(errors)}
    assert max(errors)<.002,report[name]
assert before==fingerprint(),'Approved appearance changed'
arm.animation_data.action=bpy.data.actions['IDLE_NEUTRAL_A'];scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_Game.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_def_bones=True)
for name in names:
    action=bpy.data.actions[name];arm.animation_data.action=action;scene.frame_start=0;scene.frame_end=int(action.frame_range[1]);scene.frame_set(0)
    bpy.ops.export_scene.fbx(filepath=str(P/'Unreal'/f'{name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
arm.animation_data.action=bpy.data.actions['IDLE_NEUTRAL_A'];scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_Game.blend'))
(P/'Performance/Reusable/phone_pose_validation.json').write_text(json.dumps({'appearance_sha256':before,'pose_changes_only':True,'actions':report},indent=2))
print('PHONE_ACTIONS_FIXED',json.dumps(report))
