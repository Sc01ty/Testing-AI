"""Blender 5.2 character build. Voice assets are never read or integrated."""
import bpy, math, json, struct, random, sys
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT=Path(r'D:\Video Projects\NPC Package')
OUT=ROOT/'Characters/Elliot/V2'
ASSETS=OUT/'assets'
for folder in ['Blender','Godot','Unreal','Textures','Previews','scripts']:(OUT/folder).mkdir(parents=True,exist_ok=True)
random.seed(41)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=30
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1

def parse_obj(path):
    v=[];uv=[];faces=[];faceuv=[];groups=[];group=''
    for line in path.read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':v.append(list(map(float,a[1:4])))
        elif a[0]=='vt':uv.append(list(map(float,a[1:3])))
        elif a[0]=='g':group=a[1]
        elif a[0]=='f':
            faces.append([int(x.split('/')[0])-1 for x in a[1:]])
            faceuv.append([int(x.split('/')[1])-1 if '/' in x and x.split('/')[1] else 0 for x in a[1:]])
            groups.append(group)
    return np.array(v),np.array(uv),faces,faceuv,groups

v,uv,faces,fuv,fg=parse_obj(ASSETS/'base.obj')
for name,strength in [('caucasian-male-young.target',1.0),('universal-male-young-averagemuscle-averageweight.target',1.0)]:
    for line in (ASSETS/name).read_text().splitlines():
        a=line.split()
        if a and not a[0].startswith('#'):v[int(a[0])]+=np.array(list(map(float,a[1:4])))*strength
body_ids=sorted({i for f,g in zip(faces,fg) if g=='body' for i in f})
floor=v[body_ids,1].min();scale=1.82/(v[body_ids,1].max()-floor)
v=np.column_stack([-v[:,0],v[:,2],v[:,1]-floor])*scale
# Narrow the wide base stance; give the face a leaner, slightly asymmetric identity.
for p in v:
    leg=max(0,min(1,(.97-p[2])/.8));p[0]*=1-.20*leg
    if p[2]>1.58:
        cheek=math.exp(-((p[2]-1.66)/.05)**2)
        p[0]*=1-.035*cheek
        p[1]+=.0015*math.sin(p[0]*38)*math.exp(-((p[2]-1.68)/.08)**2)
        # Open the heavy base eyelids slightly to give a younger neutral expression.
        if p[1]>.12:
            eye=math.exp(-((abs(p[0])-.0305)/.019)**4-((p[2]-1.703)/.013)**4)
            p[2]+=.005*eye if p[2]>1.701 else -.0015*eye

rigdata=json.loads((ASSETS/'default.mhskel').read_text())
sourceweights=json.loads((ASSETS/'default_weights.mhw').read_text())['weights']
rename={'root':'Hips','spine05':'Spine','spine01':'Chest','neck03':'Neck','head':'Head','jaw':'Jaw'}
for s,long in [('L','Left'),('R','Right')]:
    rename.update({f'upperarm01.{s}':long+'UpperArm',f'lowerarm01.{s}':long+'LowerArm',f'wrist.{s}':long+'Hand',f'upperleg01.{s}':long+'UpperLeg',f'lowerleg01.{s}':long+'LowerLeg',f'foot.{s}':long+'Foot',f'eye.{s}':long+'Eye'})
bone_name=lambda x:rename.get(x,x)
weights=[{} for _ in v]
for name,pairs in sourceweights.items():
    for index,weight in pairs:
        if index<len(weights):weights[index][bone_name(name)]=weight
for w in weights:
    # Four strongest influences keeps the runtime profile predictable.
    best=sorted(w.items(),key=lambda x:-x[1])[:4];total=sum(x[1] for x in best)
    w.clear();w.update({k:value/total for k,value in best} if total else {'Head':1})
def joint(key):return Vector(np.mean(v[rigdata['joints'][key]],axis=0))

armdata=bpy.data.armatures.new('Elliot_V2_DeformSkeleton');arm=bpy.data.objects.new('ElliotRig',armdata);scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
root=armdata.edit_bones.new('Root');root.head=(0,0,0);root.tail=(0,0,.12)
for name,b in rigdata['bones'].items():
    e=armdata.edit_bones.new(bone_name(name));e.head=joint(b['head']);e.tail=joint(b['tail'])
    if (e.tail-e.head).length<.001:e.tail=e.head+Vector((0,0,.02))
for name,b in rigdata['bones'].items():
    armdata.edit_bones[bone_name(name)].parent=armdata.edit_bones[bone_name(b['parent'])] if b['parent'] else root
bpy.ops.object.mode_set(mode='OBJECT');arm.show_in_front=True;arm.display_type='WIRE'

def material(name,color,rough=.6,noise=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    if noise:
        n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=180;n.inputs['Detail'].default_value=2
        bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.001
        m.node_tree.links.new(n.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return m
skin=material('Skin_WarmNatural',(.48,.285,.19),.48,True)
skin.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value=.075
cloth=material('Sweatshirt_WeatheredSage',(.125,.18,.155),.9,True)
trim_material=material('Sweatshirt_Ribbing',(.125,.18,.155),.94,True)
pants=material('Trousers_CharcoalTwill',(.052,.06,.072),.9,True)
shoe=material('Trainer_OffWhiteCanvas',(.52,.49,.41),.8,True)
sole=material('Trainer_RubberSole',(.25,.245,.22),.85)
hairmat=material('Hair_DarkChestnut',(.006,.0025,.0012),.9)
hairmat.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.12
browmat=material('Brows_Chestnut',(.043,.026,.016),.8)
eyewhite=material('Eye_Sclera',(.72,.68,.59),.24)
iris=material('Eye_Hazel',(.095,.14,.075),.27)
pupil=material('Eye_Pupil',(.005,.006,.004),.16)
lipmat=material('Lip_Natural',(.39,.17,.14),.55)
mouthmat=material('Mouth_Interior',(.08,.016,.018),.65)
teethmat=material('Teeth_Ivory',(.65,.61,.5),.4)

objects=[]
def bind(obj,vertex_weights):
    used={n for w in vertex_weights for n in w}
    for n in used:
        vg=obj.vertex_groups.new(name=n)
        for i,w in enumerate(vertex_weights):
            if n in w:vg.add([i],w[n],'REPLACE')
    mod=obj.modifiers.new('Deformation','ARMATURE');mod.object=arm
    obj.parent=arm;objects.append(obj)
def rigid(obj,bone):bind(obj,[{bone:1} for _ in obj.data.vertices])
def mesh(name,coords,polys,mat,ws=None,uvcoords=None,uvfaces=None):
    data=bpy.data.meshes.new(name);data.from_pydata(coords,[],polys);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(mat)
    for f in data.polygons:f.use_smooth=True
    if uvcoords is not None:
        layer=data.uv_layers.new(name='UVMap')
        for f,uf in zip(data.polygons,uvfaces):
            for loop,u in zip(f.loop_indices,uf):layer.data[loop].uv=uvcoords[u]
    else:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
    if ws is not None:bind(obj,ws)
    return obj

def subset(name,predicate,mat,inflate=0,subdiv=0):
    chosen=[i for i,(f,g) in enumerate(zip(faces,fg)) if g=='body' and predicate(np.mean(v[f],axis=0),f)]
    ids=sorted({k for i in chosen for k in faces[i]});lookup={old:new for new,old in enumerate(ids)}
    obj=mesh(name,[v[k].tolist() for k in ids],[[lookup[k] for k in faces[i]] for i in chosen],mat,[weights[k] for k in ids],uv,[fuv[i] for i in chosen])
    # Offset the actual anatomical surface, with restrained cloth volume/folds.
    normals=[vert.normal.copy() for vert in obj.data.vertices]
    if inflate:
        for vert,n in zip(obj.data.vertices,normals):
            p=vert.co;amount=inflate
            if name=='Sweatshirt':amount+=.005*math.sin(p.z*85+p.x*32)*math.exp(-((p.z-1.12)/.18)**2)
            if name=='Trousers':amount+=.003*math.sin(p.z*115+p.x*30)*math.exp(-((p.z-.56)/.13)**2)
            vert.co+=n*amount
    if subdiv:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        # Apply before shape keys; skin/weights interpolate with the mesh.
        sd=obj.modifiers.new('Topology refinement','SUBSURF');sd.levels=subdiv
        bpy.ops.object.modifier_move_up(modifier=sd.name)
        bpy.ops.object.modifier_apply(modifier=sd.name)
    obj['source']='MakeHuman CC0 base topology, custom Elliot redesign'
    return obj

def dominant(f,names):
    return sum(sum(value for k,value in weights[i].items() if any(n in k for n in names)) for i in f)/len(f)
def hands(p,f):return dominant(f,['Hand','finger','metacarpal'])>.38
def sleeves(p,f):return dominant(f,['UpperArm','LowerArm','upperarm02','lowerarm02','shoulder','clavicle'])>.3 and not hands(p,f)
body=subset('Face_Neck_Hands',lambda p,f:p[2]>1.505 or hands(p,f),skin,subdiv=0)
sweat=subset('Sweatshirt',lambda p,f:(.985<p[2]<1.565 and abs(p[0])<.205) or sleeves(p,f),cloth,inflate=.017,subdiv=1)
trousers=subset('Trousers',lambda p,f:.095<p[2]<1.005 and not hands(p,f) and abs(p[0])<.29,pants,inflate=.013,subdiv=1)

def boundary_trim(obj):
    edge_counts={}
    for poly in obj.data.polygons:
        ids=list(poly.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            edge=tuple(sorted((a,b)));edge_counts[edge]=edge_counts.get(edge,0)+1
    edges=[e for e,count in edge_counts.items() if count==1]
    adjacency={}
    for a,b in edges:adjacency.setdefault(a,[]).append(b);adjacency.setdefault(b,[]).append(a)
    for _ in range(7):
        update={i:obj.data.vertices[i].co.lerp(sum((obj.data.vertices[j].co for j in neighbors),Vector())/len(neighbors),.45) for i,neighbors in adjacency.items()}
        for i,p in update.items():obj.data.vertices[i].co=p
    vs=[];fs=[];ws=[]
    for a,b in edges:
        pa=obj.data.vertices[a].co.copy();pb=obj.data.vertices[b].co.copy();c=(pa+pb)/2
        # The trim overlaps the garment and closes ragged cut borders.
        direction=Vector((0,0,-.023 if c.z>1.50 else .028))
        if abs(c.x)>.22:
            side='Left' if c.x<0 else 'Right'
            direction=(arm.data.bones[side+'LowerArm'].head_local-arm.data.bones[side+'Hand'].head_local).normalized()*.028
        i=len(vs);vs.extend([tuple(pa),tuple(pb),tuple(pb+direction),tuple(pa+direction)]);fs.append((i,i+1,i+2,i+3))
        for index in [a,b,b,a]:
            w={obj.vertex_groups[g.group].name:g.weight for g in obj.data.vertices[index].groups};ws.append(w)
    return mesh(obj.name+'_RibbedEdges',vs,fs,trim_material,ws)
boundary_trim(sweat)

def curve_mesh(name,points,radius,mat,bone):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=2
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for q,p in zip(sp.points,points):q.co=(*p,1)
    o=bpy.data.objects.new(name,cu);scene.collection.objects.link(o);cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');rigid(o,bone)
    return o

for side in ['Left','Right']:
    foot=arm.data.bones[side+'Foot'].head_local;cx=foot.x;cy=.065
    vs=[];fs=[]
    for ring in range(5):
        for i in range(64):
            a=i/64*math.tau
            if ring<3:rx=.059;ry=.137;yy=cy;z=[.012,.028,.042][ring]
            elif ring==3:rx=.056;ry=.128;yy=cy;z=.069+.027*(1-math.sin(a))*.5
            else:rx=.038;ry=.045;yy=-.006;z=.128
            vs.append((cx+rx*math.cos(a),yy+ry*math.sin(a),z))
    for ring in range(4):
        for i in range(64):n=(i+1)%64;fs.append((ring*64+i,ring*64+n,(ring+1)*64+n,(ring+1)*64+i))
    sneaker=mesh(side+'_Trainer',vs,fs,shoe,[{side+'Foot':1} for _ in vs]);sneaker.data.materials.append(sole)
    for poly in sneaker.data.polygons:
        if poly.index<128:poly.material_index=1
    for row in range(5):
        y=.065-row*.014;z=.117+row*.003
        curve_mesh(side+'_Lace_'+str(row),[(cx-.027,y,z),(cx,y+.004,z+.004),(cx+.027,y,z)],.0015,sole,side+'Foot')
    curve_mesh(side+'_ToeSeam',[(cx+.056*math.cos(a),cy+.132*math.sin(a),.046) for a in np.linspace(0,math.tau,65)],.001,sole,side+'Foot')

def rigid(obj,bone):bind(obj,[{bone:1} for _ in obj.data.vertices])
def sphere(name,pos,sizes,mat,bone,segments=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
    o=bpy.context.object;o.name=name;o.scale=sizes
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    rigid(o,bone);return o

# Eyeballs sized to the real sockets. Small iris/pupil surfaces face +Y.
for s in ['Left','Right']:
    old='L' if s=='Left' else 'R';c=joint(rigdata['bones']['eye.'+old]['head'])
    c.y+=.007
    c.z-=.001
    sphere(s+'_Eyeball',c,(.012,.012,.012),eyewhite,s+'Eye')
    sphere(s+'_Iris',c+Vector((0,.0113,0)),(.0055,.0016,.0055),iris,s+'Eye')
    sphere(s+'_Pupil',c+Vector((0,.0126,0)),(.0024,.0006,.0024),pupil,s+'Eye')
    # A thin brow follows the forehead rather than becoming a floating cartoon bar.
    points=[]
    sign=-1 if s=='Left' else 1
    for t in np.linspace(0,1,9):
        x=sign*(.013+.041*t);z=1.733+.006*math.sin(t*math.pi)
        candidates=[vert.co.y for vert in body.data.vertices if abs(vert.co.x-x)<.007 and abs(vert.co.z-z)<.007 and vert.co.y>.1]
        y=max(candidates,default=.158)+.0015
        points.append((x,y,z))
    cu=bpy.data.curves.new(s+'_Brow','CURVE');cu.dimensions='3D';cu.bevel_depth=.002;cu.bevel_resolution=2
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for q,p in zip(sp.points,points):q.co=(*p,1);q.radius=.55+.45*math.sin(math.pi*points.index(p)/(len(points)-1))
    o=bpy.data.objects.new(s+'_Brow',cu);scene.collection.objects.link(o);o.data.materials.append(browmat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');rigid(o,'Head')

# Smooth vertex color masks avoid polygon-shaped lipstick edges.
colors=body.data.color_attributes.new(name='SkinColor',type='FLOAT_COLOR',domain='POINT')
for i,vert in enumerate(body.data.vertices):
    p=vert.co;c=np.array([.48,.285,.19])
    if p.z>1.56 and p.y>.13:
        lips=math.exp(-((p.z-1.619)/.011)**4-(p.x/.025)**4)
        c=c*(1-lips*.55)+np.array([.37,.16,.13])*lips*.55
        cheeks=math.exp(-((abs(p.x)-.048)/.02)**2-((p.z-1.67)/.031)**2)
        c=c*(1-cheeks*.12)+np.array([.47,.21,.16])*cheeks*.12
    colors.data[i].color=(*c,1)

# Portable facial shape controls. Audio integration is intentionally absent.
body.shape_key_add(name='Basis')
face_shapes=['Blink_Left','Blink_Right','Brow_Up','Brow_Down','Smile','Frown','Jaw_Open','Viseme_A','Viseme_E','Viseme_O','Viseme_MBP','Viseme_FV']
for name in face_shapes:
    key=body.shape_key_add(name=name)
    key.value=0.0
    for i,vert in enumerate(body.data.vertices):
        p=vert.co;d=Vector()
        if p.z<1.57 or p.y<.10:continue
        mouth=math.exp(-((p.z-1.619)/.018)**2-(p.x/.035)**4)
        if name.startswith('Blink'):
            cx=-.0305 if name.endswith('Left') else .0305
            eye=math.exp(-((p.x-cx)/.017)**4-((p.z-1.704)/.015)**4)
            d.z=-(p.z-1.704)*eye*.98;d.y=.001*eye
        elif name in ['Brow_Up','Brow_Down']:
            brow=math.exp(-((abs(p.x)-.035)/.023)**4-((p.z-1.739)/.018)**4)
            d.z=(.005 if name=='Brow_Up' else -.004)*brow
        elif name in ['Smile','Frown']:
            corner=math.exp(-((abs(p.x)-.025)/.011)**2-((p.z-1.619)/.014)**2)
            d.z=(.006 if name=='Smile' else -.005)*corner;d.x=math.copysign(.002*corner,p.x)
        elif name in ['Jaw_Open','Viseme_A']:
            lower=math.exp(-((p.z-1.597)/.030)**2-(p.x/.045)**4)
            d.z=-.018*lower;d.y=-.004*lower
        elif name=='Viseme_E':d.x=p.x*.22*mouth;d.z=-(p.z-1.619)*.25*mouth
        elif name=='Viseme_O':d.x=-p.x*.30*mouth;d.y=.006*mouth;d.z=(p.z-1.619)*.8*mouth
        elif name=='Viseme_MBP':d.z=-(p.z-1.619)*.60*mouth
        elif name=='Viseme_FV':d.y=-.004*mouth;d.z=.003*mouth if p.z<1.619 else 0
        key.data[i].co=p+d
body['facial_controls']='Prototype expression/viseme shapes; no voice integration'

# Small ivory teeth and dark cavity sit behind the lips.
sphere('Mouth_Cavity',(0,.134,1.616),(.027,.008,.012),mouthmat,'Jaw')
for upper in [True,False]:
    sphere('Upper_Teeth' if upper else 'Lower_Teeth',(0,.145,1.623 if upper else 1.612),(.023,.005,.0035),teethmat,'Head' if upper else 'Jaw',24,12)

# Scalp shell and directional hair locks; all mesh geometry exports cleanly.
cap=subset('Hair_Scalp',lambda p,f:p[2]>(1.752 if p[1]>.10 else 1.733),hairmat,inflate=.006,subdiv=1)
# Discard inherited facial weights; scalp follows the head only.
cap.vertex_groups.clear();vg=cap.vertex_groups.new(name='Head');vg.add(list(range(len(cap.data.vertices))),1,'REPLACE')
hairtree=BVHTree.FromPolygons([vert.co for vert in cap.data.vertices],[list(poly.vertices) for poly in cap.data.polygons])
fiber=material('Hair_FiberBrown',(.009,.004,.0018),.94)
fiber.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.10
cu=bpy.data.curves.new('Hair_DirectionalStrands','CURVE');cu.dimensions='3D';cu.bevel_depth=.00045;cu.bevel_resolution=0;cu.resolution_u=1
for lock in range(90):
    phi=random.uniform(-math.pi,math.pi);theta=random.uniform(.06,1.2);points=[]
    for j in range(12):
        t=j/11;th=theta+.48*t;ph=phi+.42*t
        guess=Vector((.080*math.sin(th)*math.cos(ph),.055+.105*math.sin(th)*math.sin(ph),1.737+.09*math.cos(th)))
        co,normal,index,distance=hairtree.find_nearest(guess)
        points.append(co+normal*(.0007+.0015*math.sin(math.pi*t)))
    sp=cu.splines.new('NURBS');sp.points.add(len(points)-1);sp.order_u=4;sp.use_endpoint_u=True
    for i,(q,p) in enumerate(zip(sp.points,points)):q.co=(*p,1);q.radius=1-i/len(points)*.8
o=bpy.data.objects.new('Hair_DirectionalStrands',cu);scene.collection.objects.link(o);cu.materials.append(fiber)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');rigid(o,'Head')

# Sweatshirt collar, hem and cuffs follow existing deformation weights.
def band(name,center,rx,ry,height,mat,bone):
    vs=[];fs=[]
    for z in [-height/2,height/2]:
        for i in range(48):
            a=i/48*math.tau;vs.append((center[0]+rx*math.cos(a),center[1]+ry*math.sin(a),center[2]+z))
    for i in range(48):n=(i+1)%48;fs.append((i,n,n+48,i+48))
    return mesh(name,vs,fs,mat,[{bone:1} for _ in vs])
# Garment trims are weighted to their actual boundary, not rigid floating rings.
for obj,ratio in [(sweat,.74),(trousers,.84)]:
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    dec=obj.modifiers.new('GameMesh optimization','DECIMATE');dec.ratio=ratio
    bpy.ops.object.modifier_move_up(modifier=dec.name);bpy.ops.object.modifier_apply(modifier=dec.name)
for obj in objects:
    for vert in obj.data.vertices:
        strongest=sorted([(g.group,g.weight) for g in vert.groups],key=lambda x:-x[1])[:4]
        keep={i for i,w in strongest};total=sum(w for i,w in strongest)
        for g in list(vert.groups):
            if g.group not in keep:obj.vertex_groups[g.group].remove([vert.index])
        for i,w in strongest:obj.vertex_groups[i].add([vert.index],w/total if total else 0,'REPLACE')

def bake_material(obj,mat,name):
    # Bake node-based cloth/skin colors into a portable texture; no external shaders.
    scene.render.engine='CYCLES';scene.cycles.samples=1
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');output=nodes.get('Material Output')
    original=bs.inputs['Base Color'].default_value[:]
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=55;noise.inputs['Detail'].default_value=2
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=tuple(c*.88 for c in original[:3])+(1,)
    ramp.color_ramp.elements[1].color=tuple(min(1,c*1.10) for c in original[:3])+(1,)
    links.new(noise.outputs['Fac'],ramp.inputs[0])
    emit=nodes.new('ShaderNodeEmission');links.new(ramp.outputs['Color'],emit.inputs['Color']);links.new(emit.outputs[0],output.inputs['Surface'])
    if obj==body:
        attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='SkinColor';links.new(attr.outputs['Color'],emit.inputs['Color'])
    image=bpy.data.images.new(name,width=1024,height=1024);image.filepath_raw=str(OUT/'Textures'/f'{name}.png');image.file_format='PNG'
    tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
    auxiliaries=[]
    for other in obj.data.materials:
        if other==mat:continue
        ns=other.node_tree.nodes;ls=other.node_tree.links;ob=ns.get('Principled BSDF');oo=ns.get('Material Output')
        oe=ns.new('ShaderNodeEmission');oe.inputs['Color'].default_value=ob.inputs['Base Color'].default_value[:];ls.new(oe.outputs[0],oo.inputs['Surface'])
        ot=ns.new('ShaderNodeTexImage');ot.image=image;ns.active=ot;auxiliaries.append((other,oe,ot))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type='EMIT',margin=8,use_clear=True)
    image.save();image.pack();links.new(bs.outputs[0],output.inputs['Surface']);links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    for other,oe,ot in auxiliaries:
        other.node_tree.links.new(other.node_tree.nodes['Principled BSDF'].outputs[0],other.node_tree.nodes['Material Output'].inputs['Surface']);other.node_tree.nodes.remove(oe);other.node_tree.nodes.remove(ot)
    nodes.remove(emit);nodes.remove(ramp);nodes.remove(noise)
    normal_image=bpy.data.images.new(name+'_Normal',width=1024,height=1024);normal_image.colorspace_settings.name='Non-Color';normal_image.filepath_raw=str(OUT/'Textures'/f'{name}_Normal.png');normal_image.file_format='PNG'
    normal_tex=nodes.new('ShaderNodeTexImage');normal_tex.image=normal_image;nodes.active=normal_tex
    bpy.ops.object.bake(type='NORMAL',margin=8,use_clear=True)
    normal_image.save();normal_image.pack()
    normal_node=nodes.new('ShaderNodeNormalMap');links.new(normal_tex.outputs['Color'],normal_node.inputs['Color']);links.new(normal_node.outputs['Normal'],bs.inputs['Normal'])
for obj,mat,name in [(body,skin,'Skin_BaseColor'),(sweat,cloth,'Sweatshirt_BaseColor'),(trousers,pants,'Trousers_BaseColor')]:bake_material(obj,mat,name)

# Import a corrected COPY of V1; original data remains untouched.
raw=(ROOT/'Characters/Elliot/Model/elliot_rigged.glb').read_bytes();size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size]);binary=raw[28+size:]
for ac in g['accessors']:
    for k in ['min','max']:
        if k in ac and not isinstance(ac[k],list):ac[k]=[ac[k]]
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
importpath=OUT/'assets/V1_import_compat.glb';importpath.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(importpath));imported=set(bpy.data.objects)-before
source=next(o for o in imported if o.type=='ARMATURE');source.name='V1_Retarget_Source'
source_actions=list(bpy.data.actions)
new_actions=[];mapping={name:name for name in ['Hips','Spine','Chest','Neck','Head','LeftUpperArm','LeftLowerArm','LeftHand','RightUpperArm','RightLowerArm','RightHand','LeftUpperLeg','LeftLowerLeg','LeftFoot','RightUpperLeg','RightLowerLeg','RightFoot']}
align={}
for side in ['Left','Right']:
    for bone,nextbone in [(side+'UpperArm',side+'LowerArm'),(side+'LowerArm',side+'Hand'),(side+'UpperLeg',side+'LowerLeg'),(side+'LowerLeg',side+'Foot')]:
        srcdir=(source.data.bones[nextbone].head_local-source.data.bones[bone].head_local).normalized()
        # Direction across split twist bones rather than their short visual tails.
        newdir=(arm.data.bones[nextbone].head_local-arm.data.bones[bone].head_local).normalized()
        align[bone]=newdir.rotation_difference(srcdir)
for action in source_actions:
    original_name=action.name;action.name='V1_'+original_name
    source.animation_data.action=action
    if action.slots:source.animation_data.action_slot=action.slots[0]
    target=bpy.data.actions.new(original_name);arm.animation_data_create();arm.animation_data.action=target
    start,end=action.frame_range;duration=(end-start)/30
    # glTF import uses the current scene's 30 fps time base.
    ordered=sorted(mapping,key=lambda n:len(arm.data.bones[n].parent_recursive))
    for frame in range(int(math.ceil(duration*30))+1):
        srcframe=start+frame;scene.frame_set(int(srcframe),subframe=srcframe%1)
        for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
        bpy.context.view_layer.update()
        for name in ordered:
            sb=source.pose.bones[name];nb=arm.pose.bones[name]
            delta=sb.matrix.to_quaternion() @ source.data.bones[name].matrix_local.to_quaternion().inverted()
            desired=delta @ align.get(name,Quaternion()) @ arm.data.bones[name].matrix_local.to_quaternion()
            parentq=nb.parent.matrix.to_quaternion() if nb.parent else Quaternion()
            localrest=nb.bone.matrix_local.to_quaternion()
            if nb.parent:localrest=nb.parent.bone.matrix_local.to_quaternion().inverted() @ localrest
            nb.rotation_quaternion=localrest.inverted() @ parentq.inverted() @ desired
            if name=='Hips':
                srcdelta=sb.matrix.translation-source.data.bones[name].head_local
                nb.location=nb.bone.matrix_local.to_quaternion().inverted() @ srcdelta
                nb.keyframe_insert('location',frame=frame)
            nb.keyframe_insert('rotation_quaternion',frame=frame)
            bpy.context.view_layer.update()
    target.use_fake_user=True;new_actions.append(target)
    print('RETARGETED',original_name,round(duration,3),flush=True)
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
for a in source_actions:bpy.data.actions.remove(a)
arm.animation_data.action=None
for pb in arm.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
scene.render.fps=30

# Neutral studio scene and three honest inspection views.
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world.color=(.12,.12,.12)
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.18,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Studio_Ground';ground.data.materials.append(material('Studio_Grey',(.065,.075,.085),.85))
def light(name,pos,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(2.5,3.5,4),450,3,(1,.87,.72));light('Fill',(-3,1.5,2.5),240,3,(.74,.85,1));light('Rim',(.5,-2,3),400,2,(.8,.9,1))
cd=bpy.data.cameras.new('InspectionCamera');cam=bpy.data.objects.new('InspectionCamera',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.lens=60
scene.view_settings.view_transform='AgX'
idle=next((a for a in new_actions if a.name=='IDLE_NERVOUS_A'),new_actions[0]);arm.animation_data.action=idle
for key in body.data.shape_keys.key_blocks:key.value=0.0
scene.frame_set(0)
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
views=[('Elliot_V2_FullBody',(2.5,4.6,1.65),(0,0,1.02),65),('Elliot_V2_Face',(.58,1.28,1.74),(0,.07,1.70),85),('Elliot_V2_Profile',(2.2,.1,1.72),(0,.04,1.70),85)]
for name,pos,look,lens in views:
    cam.location=pos;cam.rotation_euler=(Vector(look)-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=lens
    scene.render.filepath=str(OUT/'Previews'/f'{name}.png');bpy.ops.render.render(write_still=True)

# Pack materials, keep an immediately inspectable master file.
cam.location=(2.5,4.6,1.65);cam.rotation_euler=(Vector((0,0,1.02))-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=65
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=3.2;area.spaces.active.region_3d.view_location=(0,0,1.0)
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Blender/Elliot_V2.blend'))

bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=arm
scene.frame_start=0;scene.frame_end=120
bpy.ops.export_scene.gltf(filepath=str(OUT/'Godot/Elliot_V2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_morph=True,export_morph_animation=False,export_skins=True,export_all_influences=False,export_def_bones=True,export_materials='EXPORT')
# FBX exports mesh + morphs; separate baked animation files avoid ambiguous take naming.
bpy.ops.export_scene.fbx(filepath=str(OUT/'Unreal/Elliot_V2.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',path_mode='COPY',embed_textures=True,use_mesh_modifiers=False)
for a in new_actions:
    arm.animation_data.action=a;scene.frame_start=0;scene.frame_end=int(math.ceil(a.frame_range[1]));scene.frame_set(0)
    bpy.ops.export_scene.fbx(filepath=str(OUT/'Unreal'/f'{a.name}.fbx'),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,axis_forward='-Z',axis_up='Y')
arm.animation_data.action=idle;scene.frame_set(0);scene.frame_start=0;scene.frame_end=120
for key in body.data.shape_keys.key_blocks:key.value=0.0
manifest={'source_asset_commit':'a8bc2d54ff0ac92e78ff71431b1023eda42bf482','base_asset_license':'CC0','voice_integration':False,'height_m':1.82,'bones':len(arm.data.bones),'facial_shapes':face_shapes,'animations':[{'name':a.name,'duration':round(a.frame_range[1]/30,4),'status':'retargeted; visual cleanup review required'} for a in new_actions],'rig_rename_map':rename,'triangle_count':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'meshes':len(objects)}
(OUT/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Blender/Elliot_V2.blend'))
print('ELLIOT_V2_BUILD_COMPLETE',json.dumps({k:manifest[k] for k in ['bones','triangle_count','meshes','voice_integration']}),flush=True)
