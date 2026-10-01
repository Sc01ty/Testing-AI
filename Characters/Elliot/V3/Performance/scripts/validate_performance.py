import json, struct, hashlib, subprocess, wave
from pathlib import Path
import numpy as np
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3'); PERF=P/'Performance'
ROOT=P.parents[2]
ffmpeg=r'C:\Users\Alfie\Downloads\remotion-scary-monster\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
def pcm(path):
    out=PERF/'audio'/('check_'+Path(path).stem+'.wav')
    p=subprocess.run([ffmpeg,'-y','-v','error','-i',str(path),'-ac','1','-ar','16000',str(out)],capture_output=True)
    assert p.returncode==0,p.stderr.decode(errors='replace')
    with wave.open(str(out),'rb') as f: return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float64)
voice=ROOT/'Characters/Elliot/Voice/Bit close, mate.mp3'
source=pcm(voice);movie=pcm(PERF/'Previews/Elliot_First_Talking_Shot.mp4')
n=1 << (len(movie)+len(source)-1).bit_length()
corr=np.fft.irfft(np.fft.rfft(movie,n)*np.conj(np.fft.rfft(source,n)),n)
lag=int(np.argmax(corr[:len(movie)-len(source)+1]))
similarity=float(np.dot(movie[lag:lag+len(source)],source)/(np.linalg.norm(movie[lag:lag+len(source)])*np.linalg.norm(source)))
assert .58 < lag/16000 < .75,(lag/16000,similarity)
assert similarity>.95, similarity
inventory=json.loads((ROOT/'Characters/Elliot/V2/voice_preservation_before.json').read_text(encoding='utf-8-sig'))
folder=voice.parent
assert {p.name for p in folder.iterdir() if p.is_file()}=={i['Name'] for i in inventory}
for item in inventory: assert hashlib.sha256((folder/item['Name']).read_bytes()).hexdigest().upper()==item['SHA256']
b=(P/'Godot/Elliot_Game.glb').read_bytes();g=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
assert len(g['animations'])==59
assert len(g['skins'][0]['joints'])==17
assert max(len(p.get('targets',[])) for m in g['meshes'] for p in m['primitives'])==21
assert all(all(w==0 for w in m.get('weights',[])) for m in g['meshes'])
lock=json.loads((PERF/'style_lock.json').read_text());assert lock['unchanged_after_performance_controls']
report={'voice_audio_files_unchanged':121,'all_voice_folder_files_unchanged':len(inventory),'audio_in_video':True,'recorded_speech_start_seconds':lag/16000,'audio_similarity_to_original':similarity,'animations':59,'bones':17,'facial_controls':21,'neutral_export_weights':True,'appearance_rest_fingerprint':lock['approved_rest_sha256'],'unreal_runtime_tested':False,'listening_review':'Not independently listened to by agent; rendered mouth frames inspected.'}
(PERF/'media_validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
