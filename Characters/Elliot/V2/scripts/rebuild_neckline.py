import bpy,bmesh,math,json
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;body=bpy.data.objects['Face_Neck_Hands']
for name in ['Sweatshirt','Sweatshirt_RibbedEdges']:
    obj=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(obj.data)
    bad=[f for f in bm.faces if f.calc_center_median().z>1.498 and abs(f.calc_center_median().x)<.195]
    bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(obj.data);bm.free();obj.data.update()
obj=bpy.data.objects['Sweatshirt_CleanCrewNeck'];old=obj.data
N=96;vs=[];fs=[]
# A continuous upper-chest yoke joins the jumper to a simple rounded crew neck.
profiles=[(.190,.127,1.470,0),(.198,.127,1.500,0),(.193,.125,1.533,.010),(.170,.115,1.555,.014),(.105,.092,1.570,.014),(.076,.080,1.582,.014),(.071,.075,1.595,.014),(.061,.065,1.596,.014),(.066,.070,1.580,.014)]
for rx,ry,z,drop in profiles:
    for i in range(N):
        a=i/N*math.tau;vs.append((rx*math.cos(a),.047+ry*math.sin(a),z-drop*math.sin(a)))
for r in range(len(profiles)-1):
    for i in range(N):j=(i+1)%N;fs.append((r*N+i,r*N+j,(r+1)*N+j,(r+1)*N+i))
data=bpy.data.meshes.new('ContinuousCrewNeckYoke');data.from_pydata(vs,[],fs);data.update();obj.data=data
data.materials.append(bpy.data.materials['Sweatshirt_Ribbing'])
for f in data.polygons:f.use_smooth=True
obj.vertex_groups.clear();obj.vertex_groups.new(name='Chest').add(list(range(len(vs))),1,'REPLACE')
manifest=json.loads((P/'animation_manifest.json').read_text())
meshes=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
manifest['triangle_count']=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in meshes);manifest['meshes']=len(meshes)
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
# Save before the common preview/export section.
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
from mathutils import Vector
changed=[]
text=Path(r'C:\Users\Alfie\OneDrive\Claude X Obisdian\Elliot V2 Build\finish_silhouette.py').read_text()
exec(text[text.index("idle=bpy.data.actions['IDLE_NERVOUS_A']"):])
print('CONTINUOUS_NECKLINE_COMPLETE',manifest['triangle_count'],flush=True)
