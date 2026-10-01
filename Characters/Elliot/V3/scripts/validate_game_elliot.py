import json,struct,hashlib
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3');ROOT=P.parents[2]
b=(P/'Godot/Elliot_Game.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n])
assert struct.unpack_from('<III',b)==(0x46546c67,2,len(b))
m=json.loads((P/'animation_manifest.json').read_text());expected={a['name'] for a in m['animations']}
assert len(expected)==59 and expected=={a['name'] for a in g['animations']}
assert len(g['skins'][0]['joints'])==17
assert max(len(p.get('targets',[])) for mesh in g['meshes'] for p in mesh['primitives'])==21
assert all(all(w==0 for w in mesh.get('weights',[])) for mesh in g['meshes'])
inventory=json.loads((ROOT/'Characters/Elliot/V2/voice_preservation_before.json').read_text(encoding='utf-8-sig'))
voices=ROOT/'Characters/Elliot/Voice'
assert {p.name for p in voices.iterdir() if p.is_file()}=={item['Name'] for item in inventory}
for item in inventory:
    assert hashlib.sha256((voices/item['Name']).read_bytes()).hexdigest().upper()==item['SHA256']
for a in expected:assert (P/'Unreal'/f'{a}.fbx').stat().st_size>1000
report={'bones':17,'animations':59,'facial_controls':21,'triangles':m['triangle_count'],'voice_files_preserved':123,'voice_audio_preserved':121,'voice_integration':m['voice_integration'],'anatomical_body':False,'unreal_runtime_tested':False}
(P/'export_validation.json').write_text(json.dumps(report,indent=2));print('GAME_EXPORTS_CHECKED',json.dumps(report))

