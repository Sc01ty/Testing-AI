import bpy,math,json,struct,sys
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
preview='--preview' in sys.argv
if preview:
    bpy.ops.wm.open_mainfile(filepath=str(P/'History/2026-09-30_BroadBuild/Elliot_V2_BroadBuild.blend'))
else:
    bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_Adult_Candidate.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['ElliotRig'];body=bpy.data.objects['Face_Neck_Hands']
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def basewarp(q):
    x,y,z=q
    upper=smooth(1.09,1.37,z)*(1-smooth(1.51,1.63,z))
    waist=math.exp(-((z-1.04)/.12)**2)
    nx=x*(1-.04*upper+.04*waist);ny=y;nz=z-.030*smooth(.10,.93,z)*(1-smooth(.99,1.46,z))
    if .14<z<1.02 and abs(x)<.31:
        thigh=smooth(.39,.60,z)*(1-smooth(.91,1.02,z))
        calf=smooth(.14,.28,z)*(1-smooth(.44,.55,z))
        cx=math.copysign(.12 if z>.53 else .15,x)
        radial=.12*thigh+.07*calf
        nx=cx+(nx-cx)*(1-radial);ny=y*(1-radial)
    if abs(x)<.10:
        neck=math.exp(-((z-1.59)/.055)**4)
        nx*=1+.065*neck;ny=.036+(ny-.036)*(1+.065*neck)
    ny+=.013*smooth(1.10,1.50,z)
    return Vector((nx,ny,nz))
if preview:
    arm.animation_data.action=None
    for pb in arm.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
    original={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in arm.data.bones}
    centers={}
    for side in ['Left','Right']:
        S,E,W=[original[side+n][0] for n in ['UpperArm','LowerArm','Hand']]
        s=basewarp(S);e=s+(basewarp(E)-s)*.95;w=e+(basewarp(W)-basewarp(E))*.95
        centers[side]=(S,E,W,s,e,w)
    def limbwarp(q,side,hand=False):
        S,E,W,s,e,w=centers[side]
        if hand:return w+(basewarp(q)-basewarp(W))*.80
        candidates=[]
        for a,b,c,d,scale in [(S,E,s,e,.82),(E,W,e,w,.89)]:
            t=max(0,min(1,(q-a).dot(b-a)/(b-a).length_squared));p=a+(b-a)*t
            candidates.append(((q-p).length,c+(d-c)*t+(basewarp(q)-basewarp(p))*scale))
        return min(candidates,key=lambda item:item[0])[1]
    def deform_point(q,weights):
        armw=sum(w for name,w in weights.items() if any(n in name for n in ['UpperArm','LowerArm','upperarm02','lowerarm02','Hand','finger','metacarpal']))
        handw=sum(w for name,w in weights.items() if any(n in name for n in ['Hand','finger','metacarpal']))
        if armw<.001:return basewarp(q)
        side='Left' if q.x<0 else 'Right'
        mapped=limbwarp(q,side).lerp(limbwarp(q,side,True),min(1,handw))
        return basewarp(q).lerp(mapped,min(1,armw))
    for obj in [o for o in scene.objects if o.type=='MESH' and o.parent==arm]:
        vw=[{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in obj.data.vertices]
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                for i,point in enumerate(key.data):point.co=deform_point(point.co,vw[i])
        else:
            for v in obj.data.vertices:v.co=deform_point(v.co,vw[v.index])
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        h,t=original[b.name]
        ancestry=[b.name]+[p.name for p in b.parent_recursive]
        side=next((s for s in ['Left','Right'] if s+'UpperArm' in ancestry),None)
        hand=side and side+'Hand' in ancestry
        b.head=limbwarp(h,side,hand) if side else basewarp(h)
        b.tail=limbwarp(t,side,hand) if side else basewarp(t)
    bpy.ops.object.mode_set(mode='OBJECT')
    skin=bpy.data.materials['Skin_WarmNatural'];bs=skin.node_tree.nodes.get('Principled BSDF')
    for link in list(bs.inputs['Normal'].links):skin.node_tree.links.remove(link)
    # Original adult face size; slightly heavier jaw and less wide-open eyes.
    for key in body.data.shape_keys.key_blocks:
        for p in key.data:
            jaw=math.exp(-((p.co.z-1.615)/.032)**4)
            if p.co.y>.075:p.co.x*=1+.025*jaw
    for side in ['Left','Right']:
        for suffix in ['Eyeball','Iris','Pupil']:
            obj=bpy.data.objects[side+'_'+suffix];centre=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            for v in obj.data.vertices:
                d=v.co-centre;d.z*=.95;v.co=centre+d
    # Keep the archived actions only in the archived source; candidate poses are neutral.
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    arm.animation_data_create()
    idle=bpy.data.actions.new('ADULT_NEUTRAL_PREVIEW');arm.animation_data.action=idle
else:
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    ROOT=P.parents[2];OUT=P
    build=(P/'build_elliot_v2.py').read_text()
    exec(build[build.index('# Import a corrected COPY'):build.index('# Neutral studio scene')])

def set_global_rotation(pb,desired):
    parentq=pb.parent.matrix.to_quaternion() if pb.parent else Quaternion()
    localrest=pb.bone.matrix_local.to_quaternion()
    if pb.parent:localrest=pb.parent.bone.matrix_local.to_quaternion().inverted() @ localrest
    pb.rotation_quaternion=localrest.inverted() @ parentq.inverted() @ desired
    bpy.context.view_layer.update()
def relaxed_pose(frame):
    for side,sign in [('Left',-1),('Right',1)]:
        for segment,end,direction in [('UpperArm','LowerArm',Vector((sign*.095,.055,-1))),('LowerArm','Hand',Vector((sign*.025,.13,-1)))]:
            pb=arm.pose.bones[side+segment]
            axis=(arm.data.bones[side+end].head_local-pb.bone.head_local).normalized()
            desired=axis.rotation_difference(direction.normalized()) @ pb.bone.matrix_local.to_quaternion()
            set_global_rotation(pb,desired);pb.keyframe_insert('rotation_quaternion',frame=frame)
        pb=arm.pose.bones[side+'Hand'];suffix='.L' if side=='Left' else '.R'
        start=pb.bone.head_local;middle=arm.data.bones['finger3-3'+suffix].tail_local
        z=(middle-start).normalized();x=(arm.data.bones['finger2-1'+suffix].head_local-arm.data.bones['finger5-1'+suffix].head_local)
        x=(x-z*x.dot(z)).normalized();y=z.cross(x).normalized()
        rz=Vector((0,.045,-1)).normalized();rx=Vector((0,1,.045)).normalized();ry=rz.cross(rx).normalized()
        old=Matrix((x,y,z)).transposed();new=Matrix((rx,ry,rz)).transposed()
        set_global_rotation(pb,(new@old.inverted()).to_quaternion() @ pb.bone.matrix_local.to_quaternion())
        pb.keyframe_insert('rotation_quaternion',frame=frame)
    for pb in arm.pose.bones:
        if not pb.name.startswith('finger'):continue
        suffix='.L' if pb.name.endswith('.L') else '.R';sign=-1 if suffix=='.L' else 1
        direction=(pb.bone.tail_local-pb.bone.head_local).normalized()
        axis=direction.cross(Vector((-sign,0,0)))
        if axis.length<.001:continue
        localaxis=pb.bone.matrix_local.to_quaternion().inverted() @ axis.normalized()
        digit=int(pb.name[6]);segment=int(pb.name[8]);angle=.07 if digit==1 else [.07,.16,.10][segment-1]
        pb.rotation_quaternion=Quaternion(localaxis,angle);pb.keyframe_insert('rotation_quaternion',frame=frame)
    bpy.context.view_layer.update()
if preview:
    relaxed_pose(0)
else:
    for action in new_actions:
        arm.animation_data.action=action
        # Modest static finger curl across clips; arm/wrist replacements only in everyday idles.
        if action.name in ['IDLE_NERVOUS_A','IDLE_NERVOUS_B','IDLE_NEUTRAL_A','IDLE_NEUTRAL_B','NERVOUS_IDLE']:
            for frame in range(int(action.frame_range[1])+1):scene.frame_set(frame);relaxed_pose(frame)
    idle=bpy.data.actions['IDLE_NERVOUS_A'];arm.animation_data.action=idle;scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
cam=scene.camera;scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=1200
views=[('Elliot_Adult_Front',(0,5.1,1.35),(0,0,1.02),65),('Elliot_Adult_Face',(.58,1.28,1.74),(0,.07,1.70),85)]
for name,pos,look,lens in views:
    cam.location=pos;cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
    scene.render.filepath=str(P/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
cam.location=(0,5.1,1.35);cam.rotation_euler=(Vector((0,0,1.02))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
if preview:
    stats={'shoulder_joint_width_m':abs(arm.data.bones['LeftUpperArm'].head_local.x)*2,'upper_arm_m':(arm.data.bones['LeftLowerArm'].head_local-arm.data.bones['LeftUpperArm'].head_local).length,'forearm_m':(arm.data.bones['LeftHand'].head_local-arm.data.bones['LeftLowerArm'].head_local).length,'hand_wrist_to_middle_tip_m':(arm.data.bones['finger3-3.L'].tail_local-arm.data.bones['LeftHand'].head_local).length,'voice_integration':False}
    (P/'adult_proportion_measurements.json').write_text(json.dumps(stats,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_Adult_Candidate.blend'))
    print('ADULT_CANDIDATE_READY',json.dumps(stats),flush=True)
else:
    objects=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=arm
    scene.frame_start=0;scene.frame_end=120
    bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_V2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
    bpy.ops.export_scene.fbx(filepath=str(P/'Unreal/Elliot_V2.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
    for action in new_actions:
        arm.animation_data.action=action;scene.frame_start=0;scene.frame_end=int(math.ceil(action.frame_range[1]));scene.frame_set(0)
        bpy.ops.export_scene.fbx(filepath=str(P/'Unreal'/f'{action.name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
    arm.animation_data.action=idle;scene.frame_set(0)
    manifest=json.loads((P/'animation_manifest.json').read_text());manifest['silhouette_revision']='Adult midpoint from original foundation; moderate shoulders, original adult head size, 5% shorter arms, 20% smaller hands, slimmer legs and relaxed inward palms'
    manifest['triangle_count']=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects);manifest['meshes']=len(objects)
    (P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
    print('ADULT_MIDPOINT_COMPLETE',flush=True)
