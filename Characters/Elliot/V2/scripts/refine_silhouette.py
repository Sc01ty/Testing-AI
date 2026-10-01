import bpy, math, json, bmesh
from pathlib import Path
from mathutils import Vector, Quaternion

P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
H=P/'History/2026-09-30_BroadBuild'
bpy.ops.wm.open_mainfile(filepath=str(H/'Elliot_V2_BroadBuild.blend'))
scene=bpy.context.scene; arm=bpy.data.objects['ElliotRig']; body=bpy.data.objects['Face_Neck_Hands']
idle=bpy.data.actions['IDLE_NERVOUS_A']
arm.animation_data.action=idle; scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
cam=scene.camera
def render(name,pos,look,lens=65):
    cam.location=pos;cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
    scene.render.filepath=str(P/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
scene.cycles.samples=24
render('Elliot_Before_Front',(0,5.1,1.35),(0,0,1.02))
arm.animation_data.action=None
for pb in arm.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
bpy.context.view_layer.update()
original={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in arm.data.bones}
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def mix(a,b,t):return a+(b-a)*t
def warp(q):
    q=Vector(q);x,y,z=q
    head=smooth(1.57,1.64,z)
    shoulder=smooth(1.15,1.45,z)*(1-head)
    waist=math.exp(-((z-1.06)/.12)**2)
    width=1-.235*shoulder+.035*waist
    nx=x*width; ny=y; nz=z
    # Slim thighs around their own centre lines, without moving the knees apart.
    if .42<z<1.04 and abs(x)<.32:
        thigh=smooth(.42,.65,z)*(1-smooth(.91,1.04,z))
        cx=math.copysign(.104,x)
        nx=mix(nx,cx+(x-cx)*.80,thigh)
        ny=y*(1-.16*thigh)
    # The whole head, including its eyes/hair and facial targets, scales together.
    nx=mix(nx,x*1.105,head)
    ny=mix(ny,.045+(y-.045)*1.105,head)
    nz=mix(nz,1.60+(z-1.60)*1.105,head)
    # Modest forward carriage, with a relaxed rather than heroic chest.
    ny+=.031*smooth(1.07,1.46,z)-.009*smooth(1.57,1.70,z)
    nz-=.009*shoulder
    return Vector((nx,ny,nz))
def arm_slim(q,groups,obj):
    influence=sum(g.weight for g in groups if any(s in obj.vertex_groups[g.group].name for s in ['UpperArm','upperarm02']))
    if influence<.01:return warp(q)
    side='Left' if q.x<0 else 'Right'
    a=original[side+'UpperArm'][0]; b=original[side+'LowerArm'][0]
    t=max(0,min(1,(q-a).dot(b-a)/(b-a).length_squared)); c=a+(b-a)*t
    return warp(q)-(warp(q)-warp(c))*(.17*min(1,influence))
objects=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
for obj in objects:
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            for point in key.data:point.co=warp(point.co)
    else:
        for v in obj.data.vertices:v.co=arm_slim(v.co,v.groups,obj)
    obj.data.update()
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:
    h,t=original[b.name];b.head=warp(h);b.tail=warp(t)
bpy.ops.object.mode_set(mode='OBJECT')

# Replace the jagged neckline with an even crew-neck opening and a continuous band.
sweat=bpy.data.objects['Sweatshirt']
counts={}
for face in sweat.data.polygons:
    ids=list(face.vertices)
    for a,b in zip(ids,ids[1:]+ids[:1]):
        e=tuple(sorted((a,b)));counts[e]=counts.get(e,0)+1
edges=[e for e,n in counts.items() if n==1]
collar_ids={i for e in edges for i in e if sweat.data.vertices[i].co.z>1.48 and abs(sweat.data.vertices[i].co.x)<.115}
for i in collar_ids:
    q=sweat.data.vertices[i].co;angle=math.atan2((q.y-.040)/.075,q.x/.070)
    q.x=.070*math.cos(angle);q.y=.040+.075*math.sin(angle);q.z=1.536-.008*math.sin(angle)
trim=bpy.data.objects.get('Sweatshirt_RibbedEdges')
bm=bmesh.new();bm.from_mesh(trim.data)
bad=[f for f in bm.faces if f.calc_center_median().z>1.48 and abs(f.calc_center_median().x)<.14]
bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(trim.data);bm.free()
vs=[];fs=[];N=64
for r in range(4):
    rx,ry,h=[(.073,.078,0),(.073,.078,.014),(.062,.067,.017),(.062,.067,.002)][r]
    for i in range(N):
        a=i/N*math.tau;vs.append((rx*math.cos(a),.040+ry*math.sin(a),1.536-.008*math.sin(a)+h))
for r in range(4):
    for i in range(N):j=(i+1)%N;fs.append((r*N+i,r*N+j,((r+1)%4)*N+j,((r+1)%4)*N+i))
data=bpy.data.meshes.new('CleanCrewNeck');data.from_pydata(vs,[],fs);data.update()
collar=bpy.data.objects.new('Sweatshirt_CleanCrewNeck',data);scene.collection.objects.link(collar)
data.materials.append(bpy.data.materials['Sweatshirt_Ribbing'])
for f in data.polygons:f.use_smooth=True
for name,w in [('Chest',.65),('Neck',.35)]:collar.vertex_groups.new(name=name).add(list(range(len(vs))),w,'REPLACE')
collar.parent=arm;mod=collar.modifiers.new('Deformation','ARMATURE');mod.object=arm
objects.append(collar)

# Rebuild the retargeted local rotations against the changed anatomical rest rig.
# Reuse the documented V1 retarget procedure and leave voice assets alone.
build=(P/'build_elliot_v2.py').read_text()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
ROOT=P.parents[2];OUT=P
import struct
exec(build[build.index('# Import a corrected COPY'):build.index('# Neutral studio scene')])
idle=bpy.data.actions['IDLE_NERVOUS_A'];arm.animation_data.action=idle;scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
scene.render.resolution_x=1000;scene.render.resolution_y=1200
render('Elliot_After_Front',(0,5.1,1.35),(0,0,1.02))
render('Elliot_V2_FullBody',(2.5,4.6,1.65),(0,0,1.02))
render('Elliot_V2_Face',(.58,1.32,1.76),(0,.085,1.715),85)
render('Elliot_V2_Profile',(2.2,.1,1.72),(0,.06,1.715),85)
cam.location=(0,5.1,1.35);cam.rotation_euler=(Vector((0,0,1.02))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
for key in body.data.shape_keys.key_blocks:key.value=0
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
scene.frame_start=0;scene.frame_end=120
bpy.ops.export_scene.gltf(filepath=str(P/'Godot/Elliot_V2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
bpy.ops.export_scene.fbx(filepath=str(P/'Unreal/Elliot_V2.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
for a in new_actions:
    arm.animation_data.action=a;scene.frame_start=0;scene.frame_end=int(math.ceil(a.frame_range[1]));scene.frame_set(0)
    bpy.ops.export_scene.fbx(filepath=str(P/'Unreal'/f'{a.name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
arm.animation_data.action=idle;scene.frame_set(0)
for key in body.data.shape_keys.key_blocks:key.value=0
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
manifest=json.loads((P/'animation_manifest.json').read_text());manifest['triangle_count']=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in objects);manifest['meshes']=len(objects);manifest['silhouette_revision']='Ordinary slim build; shoulders narrowed 23.5%, head enlarged 10.5%, thighs and upper arms slimmed, forward carriage and clean crew neck'
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
print('SILHOUETTE_REFINEMENT_COMPLETE',json.dumps({'collar_boundary_vertices':len(collar_ids),'triangles':manifest['triangle_count']}),flush=True)
