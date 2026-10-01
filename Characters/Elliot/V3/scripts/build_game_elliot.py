"""Fresh clothed game character. No anatomical body, external generators or audio."""
import bpy,math,json,struct
from pathlib import Path
from mathutils import Vector,Quaternion
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3')
ROOT=P.parents[2]
for folder in ['Blender','Godot','Unreal','Previews','scripts']:(P/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
scene=bpy.context.scene;scene.render.fps=30;scene.unit_settings.system='METRIC'
def mat(name,color,rough=.85):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.22
    return m
skin=mat('Warm matte skin',(.54,.335,.215));sage=mat('Sage jumper',(.16,.265,.23));rib=mat('Sage cuffs and hem',(.105,.185,.16))
pants=mat('Ink blue chinos',(.065,.09,.13));shoe=mat('Ivory canvas',(.69,.67,.59));sole=mat('Warm white sole',(.84,.81,.71));dark=mat('Dark lace and heel',(.12,.15,.17))
hair=mat('Chestnut hair',(.045,.027,.018));white=mat('Eye warm white',(.80,.79,.71));iris=mat('Hazel eyes',(.075,.13,.095));black=mat('Features',(.045,.027,.021))
objects=[]
def mesh(name,vs,fs,material,weights=None,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(vs,[],fs);data.update();o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);data.materials.append(material)
    for f in data.polygons:f.use_smooth=smooth
    if weights is not None:o['weights_pending']=json.dumps(weights)
    objects.append(o);return o
def box(name,center,size,material,bone=None,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True);o.data.materials.append(material)
    if bevel:
        m=o.modifiers.new('Soft polygon edges','BEVEL');m.width=bevel;m.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
        n=o.modifiers.new('Clean plane shading','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
    if bone:o['weights_pending']=json.dumps([{bone:1} for _ in o.data.vertices])
    objects.append(o);return o
def loft(name,profiles,material,weightfn,N=12,caps=True):
    vs=[];fs=[];ws=[]
    for cx,cy,z,rx,ry in profiles:
        for i in range(N):
            a=(i/N+.5/N)*math.tau;vs.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z));ws.append(weightfn(z))
    for r in range(len(profiles)-1):
        for i in range(N):j=(i+1)%N;fs.append((r*N+i,r*N+j,(r+1)*N+j,(r+1)*N+i))
    if caps:fs.extend([tuple(reversed(range(N))),tuple((len(profiles)-1)*N+i for i in range(N))])
    if profiles[-1][2]<profiles[0][2]:fs=[tuple(reversed(f)) for f in fs]
    return mesh(name,vs,fs,material,ws,smooth=False)

# The torso IS the jumper: a deliberate clean opening around a simple neck.
loft('Jumper',[(0,0,1.00,.155,.095),(0,0,1.13,.157,.098),(0,0,1.34,.18,.108),(0,0,1.485,.202,.095),(0,.015,1.535,.062,.054)],sage,lambda z:{'Chest':max(0,min(1,(z-1.07)/.25)),'Spine':1-max(0,min(1,(z-1.07)/.25))},caps=False)
loft('Jumper hem',[(0,0,.985,.157,.097),(0,0,1.017,.158,.098)],rib,lambda z:{'Spine':1})
loft('Crew neck rim',[(0,.015,1.524,.064,.056),(0,.015,1.540,.063,.055)],rib,lambda z:{'Chest':1},caps=False)
loft('Visible neck',[(0,.015,1.515,.044,.036),(0,.019,1.602,.047,.038)],skin,lambda z:{'Neck':1},N=10)

for side,sign in [('Left',-1),('Right',1)]:
    loft(side+' sleeve',[(sign*.202,0,1.475,.058,.068),(sign*.230,.006,1.29,.050,.053),(sign*.245,.012,1.17,.046,.048),(sign*.252,.025,.975,.038,.040)],sage,lambda z:{side+'UpperArm':max(0,min(1,(z-1.14)/.12)),side+'LowerArm':1-max(0,min(1,(z-1.14)/.12))},N=10)
    loft(side+' cuff',[(sign*.252,.025,.958,.037,.039),(sign*.252,.025,.990,.039,.041)],rib,lambda z:{side+'LowerArm':1},N=10)
    box(side+' hand',(sign*.253,.025,.906),(.048,.061,.106),skin,side+'Hand',.017)
    thumb=box(side+' thumb',(sign*.224,.048,.929),(.020,.031,.047),skin,side+'Hand',.008)
    loft(side+' chino leg',[(sign*.083,0,.910,.075,.092),(sign*.083,.002,.72,.067,.082),(sign*.084,.010,.51,.060,.074),(sign*.085,.008,.205,.056,.069),(sign*.085,.008,.157,.055,.064)],pants,lambda z:{side+'UpperLeg':max(0,min(1,(z-.46)/.13)),side+'LowerLeg':1-max(0,min(1,(z-.46)/.13))},N=10)
    # Flat covered waist, no anatomical pelvis or separate buttocks.
box('Covered chino waist',(0,-.005,.935),(.30,.181,.123),pants,'Hips',.025)

# Purpose-built sneakers with a flat outsole, rounded toe and raised heel.
outline=[(-.050,-.085),(.050,-.085),(.067,-.040),(.071,.115),(.054,.183),(.025,.200),(-.025,.200),(-.054,.183),(-.071,.115),(-.067,-.040)]
for side,sign in [('Left',-1),('Right',1)]:
    cx=sign*.085;vs=[];fs=[];N=len(outline)
    for z,scale in [(.014,1),(.041,1),(.063,.97),(.095,.86)]:
        for x,y in outline:vs.append((cx+x*scale,y,z if y<.10 else z-.016 if z>.06 else z))
    for r in range(3):
        for i in range(N):j=(i+1)%N;fs.append((r*N+i,r*N+j,(r+1)*N+j,(r+1)*N+i))
    fs.append(tuple(reversed(range(N))))
    # Upper rings converge into a compact ankle instead of a pointed boot.
    for x,y in outline:vs.append((cx+x*.63,y*.32-.020,.149))
    for i in range(N):j=(i+1)%N;fs.append((3*N+i,3*N+j,4*N+j,4*N+i))
    fs.append(tuple(4*N+i for i in range(N)))
    o=mesh(side+' sneaker',vs,fs,shoe,[{side+'Foot':1} for _ in vs]);o.data.materials.append(sole)
    for f in o.data.polygons:
        if f.index<N:f.material_index=1
    box(side+' heel tab',(cx,-.066,.115),(.057,.015,.040),dark,side+'Foot',.004)
    for j in range(3):box(side+' lace '+str(j),(cx,.035+j*.026,.155-j*.011),(.071,.007,.005),dark,side+'Foot',.001)

head=box('ElliotHead',(0,.015,1.675),(.187,.172,.245),skin,'Head',.035)
for side,sign in [('Left',-1),('Right',1)]:box(side+' ear',(sign*.101,.008,1.675),(.027,.044,.052),skin,'Head',.012)
mesh('Simple nose',[(-.012,.105,1.687),(.012,.105,1.687),(-.010,.105,1.653),(.010,.105,1.653),(0,.128,1.658)],[(0,1,4),(1,3,4),(3,2,4),(2,0,4)],skin,[{'Head':1}]*5)

# An angular swept fringe, not a realistic scalp or individual strands.
outline=[(-.076,-.083),(.076,-.083),(.104,-.052),(.104,.077),(.073,.115),(-.073,.115),(-.104,.077),(-.104,-.052)]
vs=[(x,y,[1.731,1.731,1.738,1.747,1.747,1.736,1.741,1.738][i]) for i,(x,y) in enumerate(outline)]
vs += [(x*.81,y*.86,1.812+(.008 if x<0 else 0)) for x,y in outline]
fs=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]+[tuple(range(8,16))]
mesh('Swept polygon hair',vs,fs,hair,[{'Head':1}]*len(vs))

# Graphic eyes, brows and mouth share one modest facial-control mesh.
vs=[];fs=[];mats=[];regions={}
def face_rect(label,cx,z,w,h,material,y=.1025,tilt=0):
    first=len(vs);coords=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]
    for x,dz in coords:vs.append((cx+x,y,z+dz+x*tilt))
    fs.append(tuple(first+i for i in reversed(range(4))));mats.append(material);regions[label]=list(range(first,first+4))
for side,sign in [('Left',-1),('Right',1)]:
    face_rect(side+' white',sign*.041,1.706,.036,.018,0)
    face_rect(side+' pupil',sign*.041,1.706,.014,.015,1,y=.104)
    face_rect(side+' brow',sign*.041,1.732,.036,.004,2,y=.103,tilt=-sign*.09)
face_rect('mouth',0,1.627,.045,.0028,2,y=.103)
face=mesh('Face controls',vs,fs,white,[{'Head':1}]*len(vs));face.data.materials.append(iris);face.data.materials.append(black)
for f,material in zip(face.data.polygons,mats):f.material_index=material
face.shape_key_add(name='Basis')
shapes=['Blink_Left','Blink_Right','Brow_Up','Brow_Down','Smile','Frown','Jaw_Open','Viseme_A','Viseme_E','Viseme_O','Viseme_MBP','Viseme_FV']
for name in shapes:
    key=face.shape_key_add(name=name);key.value=0
    for i,v in enumerate(face.data.vertices):
        p=v.co.copy()
        if name.startswith('Blink'):
            side=name.split('_')[1]
            if i in regions[side+' white']+regions[side+' pupil']:p.z=1.706+(p.z-1.706)*.08
        elif name.startswith('Brow'):
            if i in regions['Left brow']+regions['Right brow']:p.z+=.006 if name=='Brow_Up' else -.004
        elif i in regions['mouth']:
            if name in ['Smile','Frown']:p.z+=(.003 if name=='Smile' else -.003)*abs(p.x)/.0225
            elif name in ['Jaw_Open','Viseme_A']:p.z=1.623+(p.z-1.627)*5
            elif name=='Viseme_E':p.x*=1.15;p.z=1.627+(p.z-1.627)*2
            elif name=='Viseme_O':p.x*=.46;p.z=1.627+(p.z-1.627)*5
            elif name=='Viseme_MBP':p.z=1.627+(p.z-1.627)*.4
            elif name=='Viseme_FV':p.z-=.002
        key.data[i].co=p

coords={'Hips':((0,0,.94),(0,0,1.03),None),'Spine':((0,0,1.03),(0,0,1.27),'Hips'),'Chest':((0,0,1.27),(0,.015,1.52),'Spine'),'Neck':((0,.015,1.52),(0,.019,1.60),'Chest'),'Head':((0,.019,1.60),(0,.019,1.79),'Neck')}
for side,sign in [('Left',-1),('Right',1)]:
    coords.update({side+'UpperArm':((sign*.202,0,1.43),(sign*.245,.012,1.17),'Chest'),side+'LowerArm':((sign*.245,.012,1.17),(sign*.252,.025,.958),side+'UpperArm'),side+'Hand':((sign*.252,.025,.958),(sign*.253,.030,.862),side+'LowerArm'),side+'UpperLeg':((sign*.083,0,.910),(sign*.084,.010,.51),'Hips'),side+'LowerLeg':((sign*.084,.010,.51),(sign*.085,.008,.157),side+'UpperLeg'),side+'Foot':((sign*.085,.008,.157),(sign*.085,.150,.055),side+'LowerLeg')})
data=bpy.data.armatures.new('Elliot Game Skeleton');arm=bpy.data.objects.new('ElliotRig',data);scene.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
for name,(h,t,parent) in coords.items():b=data.edit_bones.new(name);b.head=h;b.tail=t
for name,(h,t,parent) in coords.items():
    if parent:data.edit_bones[name].parent=data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');arm.show_in_front=True
for o in objects:
    weights=json.loads(o['weights_pending']);del o['weights_pending']
    for name in {n for w in weights for n in w}:
        group=o.vertex_groups.new(name=name)
        for i,w in enumerate(weights):
            if w.get(name,0)>0:group.add([i],w[name],'REPLACE')
    o.parent=arm;mod=o.modifiers.new('Game skeleton','ARMATURE');mod.object=arm

# Reuse the existing named clips without bringing in old character geometry.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'Characters/Elliot/V2/assets/V1_import_compat.glb'))
imported=set(bpy.data.objects)-before;source=next(o for o in imported if o.type=='ARMATURE');source_actions=list(bpy.data.actions);new_actions=[]
align={}
for side in ['Left','Right']:
    for name,end in [(side+'UpperArm',side+'LowerArm'),(side+'LowerArm',side+'Hand'),(side+'UpperLeg',side+'LowerLeg'),(side+'LowerLeg',side+'Foot')]:
        new=(data.bones[end].head_local-data.bones[name].head_local).normalized();old=(source.data.bones[end].head_local-source.data.bones[name].head_local).normalized();align[name]=new.rotation_difference(old)
ordered=sorted(coords,key=lambda name:len(data.bones[name].parent_recursive))
for old in source_actions:
    name=old.name;old.name='Previous_'+name;source.animation_data.action=old
    if old.slots:source.animation_data.action_slot=old.slots[0]
    action=bpy.data.actions.new(name);arm.animation_data_create();arm.animation_data.action=action
    start,end=old.frame_range
    for frame in range(int(math.ceil(end-start))+1):
        scene.frame_set(int(start+frame));bpy.context.view_layer.update()
        for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
        bpy.context.view_layer.update()
        for n in ordered:
            sb=source.pose.bones[n];pb=arm.pose.bones[n]
            delta=sb.matrix.to_quaternion() @ source.data.bones[n].matrix_local.to_quaternion().inverted()
            desired=delta @ align.get(n,Quaternion()) @ pb.bone.matrix_local.to_quaternion()
            if name in ['IDLE_NERVOUS_A','IDLE_NERVOUS_B','IDLE_NEUTRAL_A','IDLE_NEUTRAL_B','NERVOUS_IDLE'] and any(s in n for s in ['UpperArm','LowerArm','Hand']):desired=pb.bone.matrix_local.to_quaternion()
            parent=pb.parent.matrix.to_quaternion() if pb.parent else Quaternion();rest=pb.bone.matrix_local.to_quaternion()
            if pb.parent:rest=pb.parent.bone.matrix_local.to_quaternion().inverted() @ rest
            pb.rotation_quaternion=rest.inverted() @ parent.inverted() @ desired
            if n=='Hips':
                pb.location=pb.bone.matrix_local.to_quaternion().inverted() @ (sb.matrix.translation-source.data.bones[n].head_local);pb.keyframe_insert('location',frame=frame)
            pb.keyframe_insert('rotation_quaternion',frame=frame);bpy.context.view_layer.update()
    action.use_fake_user=True;new_actions.append(action)
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
for a in source_actions:bpy.data.actions.remove(a)
idle=bpy.data.actions['IDLE_NEUTRAL_A'];arm.animation_data.action=idle;scene.frame_set(0)
for k in face.data.shape_keys.key_blocks:k.value=0

scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.44,.48,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Studio floor';ground.data.materials.append(mat('Studio',(.32,.38,.42)))
def light(name,pos,energy,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
light('Soft key',(3,4,5),500,4);light('Soft fill',(-3,2,3),220,4);light('Rim',(0,-3,4),330,3)
d=bpy.data.cameras.new('Design camera');cam=bpy.data.objects.new('Design camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=2.20
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
for name,pos,target,scale in [('Elliot_Game_Front',(0,5,1.03),(0,0,1.03),2.16),('Elliot_Game_ThreeQuarter',(3,5,2.0),(0,0,1.03),2.16),('Elliot_Game_Side',(5,0,1.03),(0,0,1.03),2.16),('Elliot_Game_Face',(.6,3,1.76),(0,.02,1.68),.49)]:
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;scene.render.filepath=str(P/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
cam.location=(3,5,2);cam.rotation_euler=(Vector((0,0,1.03))-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=2.16
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL';area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_Game.blend'))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm;scene.frame_start=0;scene.frame_end=120
bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_Game.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True)
bpy.ops.export_scene.fbx(filepath=str(P/'Unreal/Elliot_Game.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',use_mesh_modifiers=False)
for action in new_actions:
    arm.animation_data.action=action;scene.frame_start=0;scene.frame_end=int(action.frame_range[1]);scene.frame_set(0)
    bpy.ops.export_scene.fbx(filepath=str(P/'Unreal'/f'{action.name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
arm.animation_data.action=idle;scene.frame_set(0)
manifest={'style':'Stylised rounded-polygon game character','anatomical_body':False,'voice_integration':False,'bones':len(data.bones),'meshes':len(objects),'triangle_count':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects),'facial_shapes':shapes,'animations':[{'name':a.name,'duration':float(a.frame_range[1]/30),'status':'retargeted; visual review required'} for a in new_actions]}
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_Game.blend'))
print('GAME_ELLIOT_COMPLETE',json.dumps({k:manifest[k] for k in ['bones','triangle_count','anatomical_body','voice_integration']}),flush=True)
