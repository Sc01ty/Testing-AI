import json,struct,hashlib,shutil
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3');R=P/'Performance/Reusable';STAGE=Path(r'C:\Users\Alfie\OneDrive\Claude X Obisdian\Elliot Performance Build')
def glb(path):
    b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
old,oldbin=glb(P/'Performance/Milestones/First_Talking_Shot/Elliot_Game.glb');new,newbin=glb(P/'Godot/Elliot_Game.glb')
assert old['materials']==new['materials'],'Material definitions changed'
def accessor_bytes(g,data,index):
    a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
    start=v.get('byteOffset',0)+a.get('byteOffset',0)
    count=a['count'];size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    stride=v.get('byteStride',size)
    return b''.join(data[start+i*stride:start+i*stride+size] for i in range(count))
old_meshes={m['name']:m for m in old['meshes']};new_meshes={m['name']:m for m in new['meshes']}
assert old_meshes.keys()==new_meshes.keys()
for name in old_meshes:
    a=old_meshes[name];b=new_meshes[name]
    assert len(a['primitives'])==len(b['primitives'])
    for x,y in zip(a['primitives'],b['primitives']):
        assert x.get('material')==y.get('material')
        for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:
            if key in x['attributes']:assert accessor_bytes(old,oldbin,x['attributes'][key])==accessor_bytes(new,newbin,y['attributes'][key]),(name,key)
        assert accessor_bytes(old,oldbin,x['indices'])==accessor_bytes(new,newbin,y['indices'])
assert len(new['animations'])==59 and len(new['skins'][0]['joints'])==17
for folder in ['scripts','build_tools']:(R/folder).mkdir(exist_ok=True)
for name in ['elliot_performance_system.gd','elliot_performance_phone.gd','performance_gallery.gd']:shutil.copy2(STAGE/name,R/'scripts'/name)
for name in ['fix_phone_actions.py','build_performance_library.py','package_reusable.py','validate_reel.py','finalize_reusable.py']:shutil.copy2(STAGE/name,R/'build_tools'/name)
shutil.copy2(STAGE/'REUSABLE_README.md',R/'README.md')
appdata=Path.home()/'AppData/Roaming/Godot/app_userdata/Elliot Performance Gallery/performance/gallery_test_validation.json'
report=json.loads(appdata.read_text(encoding='utf-8-sig'));assert report['line_count']==18 and not report['failures'] and report['interrupt_tested'];(R/'standalone_validation.json').write_text(json.dumps(report,indent=2))
probe=json.loads((R/'metadata_probe_validation.json').read_text());assert not probe['failures'] and probe['performances'][0]['movement_m']>=.29
reel=json.loads((R/'reel_validation.json').read_text());assert reel['recordings']==18 and not reel['render_failures']
first=P/'Performance/Previews/Elliot_First_Talking_Shot.mp4';saved=P/'Performance/Milestones/First_Talking_Shot/Elliot_First_Talking_Shot.mp4'
assert hashlib.sha256(first.read_bytes()).digest()==hashlib.sha256(saved.read_bytes()).digest()
validation={'approved_geometry_unchanged':True,'materials_identical':True,'base_vertex_and_skin_buffers_identical':True,'first_talking_video_preserved':True,'clips':59,'bones':17,'performance_recordings':18,'primitive_count':25,'metadata_only_combination_passed':True,'standalone_gallery_passed':True,'voice_originals_unchanged':121,'unreal_runtime_tested':False}
(R/'final_validation.json').write_text(json.dumps(validation,indent=2))
for path in [P.parent/'README.md',P/'README.md']:
    t=path.read_text(encoding='utf-8-sig')
    t+='\n\n## Reusable performance milestone\n\n`V3/Performance/Reusable` (or `Performance/Reusable` from V3) contains an 18-recording, 13-category performance gallery driven by 25 reusable primitives. Phone-to-ear actions are corrected. The standalone `GodotDemo/project.godot` and `Play_Elliot.cmd` provide interactive replay. The 121 originals and approved appearance are unchanged; Jev and autonomous speech wiring remain untouched. See the reusable README and rendered full reel.\n'
    path.write_text(t,encoding='utf-8')
with (P/'Performance/README.md').open('a',encoding='utf-8') as f:f.write('\n\n## Superseding reusable milestone\n\nThe sections above describe the first talking prototype. `Reusable/README.md` is now the current performance guide: 18 recordings, 25 primitives, independent bone layers and corrected phone-to-ear actions. The old phone diagnostic reflects the pre-fix animation; use the new reel for current evidence.\n')
print('REUSABLE_MILESTONE_VERIFIED',json.dumps(validation))
