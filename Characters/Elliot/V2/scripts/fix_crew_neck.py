import bpy,math
from pathlib import Path
from mathutils import Vector
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
bpy.ops.wm.open_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
arm=bpy.data.objects['ElliotRig'];scene=bpy.context.scene;body=bpy.data.objects['Face_Neck_Hands']
sweat=bpy.data.objects['Sweatshirt']
for v in sweat.data.vertices:
    q=v.co
    if q.z>1.505 and abs(q.x)<.12:
        blend=max(0,min(1,(.12-abs(q.x))/.025))
        q.z=q.z*(1-blend)+min(q.z,1.512)*blend
sweat.data.update()
collar=bpy.data.objects['Sweatshirt_CleanCrewNeck']
for r in range(4):
    rx,ry,z=[(.077,.082,1.503),(.069,.074,1.539),(.063,.068,1.541),(.070,.075,1.505)][r]
    for i in range(64):
        a=i/64*math.tau;collar.data.vertices[r*64+i].co=(rx*math.cos(a),.040+ry*math.sin(a),z-.005*math.sin(a))
collar.vertex_groups.clear();collar.vertex_groups.new(name='Chest').add(list(range(256)),1,'REPLACE');collar.data.update()
skin=bpy.data.materials['Skin_WarmNatural'];bs=skin.node_tree.nodes.get('Principled BSDF')
for link in list(bs.inputs['Normal'].links):skin.node_tree.links.remove(link)
cam=scene.camera;scene.cycles.samples=24
for k in body.data.shape_keys.key_blocks:k.value=0
cam.location=(.58,1.32,1.76);cam.rotation_euler=(Vector((0,.085,1.715))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=85
scene.render.filepath=str(P/'Previews/Elliot_V2_Face.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'Blender/Elliot_V2.blend'))
print('CREW_NECK_FIT_COMPLETE',flush=True)
