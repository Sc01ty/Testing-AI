"""Inspect portable export structure and verify untouched voice assets."""
import struct,json,hashlib
from pathlib import Path
root=Path(r'D:\Video Projects\NPC Package');out=root/'Characters/Elliot/V2'
raw=(out/'Godot/Elliot_V2.glb').read_bytes()
assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n])
manifest=json.loads((out/'animation_manifest.json').read_text())
expected={a['name'] for a in manifest['animations']};actual={a['name'] for a in g.get('animations',[])}
assert expected<=actual,(expected-actual)
assert len(expected)==59,len(expected)
shapes=max(len(p.get('targets',[])) for m in g['meshes'] for p in m['primitives'])
assert shapes==12,shapes
for m in g['meshes']:assert all(abs(w)<1e-6 for w in m.get('weights',[])), 'Non-neutral default facial shapes'
for a in g['accessors']:
    for key in ['min','max']:
        if key in a:assert isinstance(a[key],list)
for name in expected:assert (out/'Unreal'/f'{name}.fbx').stat().st_size>1000
assert (out/'Unreal/Elliot_V2.fbx').stat().st_size>10000
before=json.loads((out/'voice_preservation_before.json').read_text(encoding='utf-8-sig'))
voices=root/'Characters/Elliot/Voice';files={p.name:p for p in voices.iterdir() if p.is_file()}
assert set(files)=={e['Name'] for e in before},'Voice folder inventory changed'
for entry in before:
    p=files[entry['Name']];assert p.stat().st_size==entry['Length'];assert hashlib.sha256(p.read_bytes()).hexdigest().upper()==entry['SHA256'],p.name
report={'glb_valid_structure':True,'animations':len(expected),'facial_shapes':shapes,'skin_joints':len(g['skins'][0]['joints']),'triangles':manifest['triangle_count'],'voice_files_preserved':len(before),'voice_audio_files_preserved':sum(p.suffix.lower() in ['.mp3','.wav','.ogg','.flac'] for p in files.values()),'voice_integration':False,'unreal_fbx_files':len(list((out/'Unreal').glob('*.fbx'))),'unreal_runtime_tested':False}
(out/'export_validation.json').write_text(json.dumps(report,indent=2))
print('ELLIOT_V2_EXPORT_VALIDATION',json.dumps(report))
