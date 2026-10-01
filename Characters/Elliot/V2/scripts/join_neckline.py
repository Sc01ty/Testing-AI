import bpy,math,json
from pathlib import Path
from mathutils import Vector
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;body=bpy.data.objects['Face_Neck_Hands'];shirt=bpy.data.objects['Sweatshirt']
import bmesh
bm=bmesh.new();bm.from_mesh(shirt.data)
bad=[f for f in bm.faces if f.calc_center_median().z>1.498 and abs(f.calc_center_median().x)<.195]
bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(shirt.data);bm.free();shirt.data.update()
counts={}
for f in shirt.data.polygons:
    ids=list(f.vertices)
    for a,b in zip(ids,ids[1:]+ids[:1]):e=tuple(sorted((a,b)));counts[e]=counts.get(e,0)+1
adj={}
for (a,b),n in counts.items():
    if n==1 and min(shirt.data.vertices[a].co.z,shirt.data.vertices[b].co.z)>1.40:
        adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
assert adj and all(len(v)==2 for v in adj.values()), {i:len(v) for i,v in adj.items() if len(v)!=2}
start=next(iter(adj));loop=[start];prev=None;cur=start
while True:
    nxt=next(n for n in adj[cur] if n!=prev)
    if nxt==start:break
    loop.append(nxt);prev,cur=cur,nxt
assert len(loop)>20,len(loop)
collar=bpy.data.objects.get('Sweatshirt_CleanCrewNeck')
if collar is None:
    collar=bpy.data.objects.new('Sweatshirt_CleanCrewNeck',bpy.data.meshes.new('NecklineWorking'));scene.collection.objects.link(collar);collar.parent=arm
N=len(loop);vs=[];fs=[];ws=[]
points=[shirt.data.vertices[i].co for i in loop]
area=sum(p.x*points[(i+1)%N].y-points[(i+1)%N].x*p.y for i,p in enumerate(points))
angle0=math.atan2((points[0].y-.047)/.12,points[0].x/.17)
orientation=1 if area>0 else -1
stages=[(0,0),(0.2,0),(0.45,0),(0.7,0),(1,0),(1,.011),(1,.013)]
for r,(t,raise_z) in enumerate(stages):
    for i,idx in enumerate(loop):
        v=shirt.data.vertices[idx];q=v.co.copy();a=math.atan2((q.y-.047)/.12,q.x/.17)
        radius=.068 if r<6 else .059
        target=Vector((radius*math.cos(a),.065+(radius+.045)*math.sin(a),1.561-.010*math.sin(a)+raise_z))
        vs.append(tuple(q.lerp(target,t)))
        weights={shirt.vertex_groups[g.group].name:g.weight*(1-t) for g in v.groups}
        weights['Chest']=weights.get('Chest',0)+t
        best=sorted(weights.items(),key=lambda x:-x[1])[:4];total=sum(w for n,w in best);ws.append({n:w/total for n,w in best if w>0})
for r in range(len(stages)-1):
    for i in range(N):j=(i+1)%N;fs.append((r*N+i,r*N+j,(r+1)*N+j,(r+1)*N+i))
data=bpy.data.meshes.new('JoinedCrewNeck');data.from_pydata(vs,[],fs);data.update();collar.data=data
for iteration in range(10):
    updates={}
    for r in range(1,5):
        for i in range(N):
            idx=r*N+i
            neighbors=[r*N+(i-1)%N,r*N+(i+1)%N,(r-1)*N+i,(r+1)*N+i]
            avg=sum((data.vertices[j].co for j in neighbors),Vector())/4
            updates[idx]=data.vertices[idx].co.lerp(avg,.45)
    for idx,q in updates.items():data.vertices[idx].co=q
data.update()
data.materials.append(bpy.data.materials['Sweatshirt_Ribbing'])
for f in data.polygons:f.use_smooth=True
collar.vertex_groups.clear()
for n in {n for w in ws for n in w}:
    g=collar.vertex_groups.new(name=n)
    for i,w in enumerate(ws):
        if n in w:g.add([i],w[n],'REPLACE')
bpy.ops.object.select_all(action='DESELECT');shirt.select_set(True);collar.select_set(True);bpy.context.view_layer.objects.active=shirt;bpy.ops.object.join()
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
for f in shirt.data.polygons:f.use_smooth=True
meshes=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
manifest=json.loads((P/'animation_manifest.json').read_text());manifest['triangle_count']=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in meshes);manifest['meshes']=len(meshes)
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
changed=[]
text=(P/'scripts/finish_silhouette.py').read_text()
exec(text[text.index("idle=bpy.data.actions['IDLE_NERVOUS_A']"):])
print('JOINED_NECKLINE_COMPLETE',N,manifest['triangle_count'],flush=True)
