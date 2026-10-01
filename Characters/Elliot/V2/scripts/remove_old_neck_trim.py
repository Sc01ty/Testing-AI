import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;body=bpy.data.objects['Face_Neck_Hands']
trim=bpy.data.objects['Sweatshirt_RibbedEdges'];bm=bmesh.new();bm.from_mesh(trim.data)
bad=[f for f in bm.faces if f.calc_center_median().z>1.40]
bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(trim.data);bm.free();trim.data.update()
meshes=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
manifest=json.loads((P/'animation_manifest.json').read_text());manifest['triangle_count']=sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in meshes)
(P/'animation_manifest.json').write_text(json.dumps(manifest,indent=2))
changed=[]
text=(P/'scripts/finish_silhouette.py').read_text();exec(text[text.index("idle=bpy.data.actions['IDLE_NERVOUS_A']"):])
print('OLD_NECK_TRIM_REMOVED',len(bad),manifest['triangle_count'],flush=True)
