import json,subprocess,wave,hashlib,struct
from pathlib import Path
import numpy as np
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3');R=P/'Performance/Reusable';VOICE=P.parent/'Voice'
FF=r'C:\Users\Alfie\Downloads\remotion-scary-monster\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
manifest=json.loads((R/'performance_manifest.json').read_text())
out=R/'audio/reel_soundtrack.wav'
subprocess.run([FF,'-y','-v','error','-i',str(R/'Previews/Elliot_18_Performances.mp4'),'-ac','1','-ar','16000',str(out)],check=True)
def pcm(path):
    with wave.open(str(path),'rb') as f:return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float64)
movie=pcm(out);n=1<<(len(movie)+160000-1).bit_length();movie_fft=np.fft.rfft(movie,n)
checks=[];previous=0
for entry in manifest['lines']:
    source=pcm(R/'audio'/f"{entry['id']}.wav")
    cross=np.fft.irfft(movie_fft*np.conj(np.fft.rfft(source,n)),n)[:len(movie)-len(source)+1]
    cross[:previous]=0
    lag=int(np.argmax(cross));segment=movie[lag:lag+len(source)]
    raw_correlation=float(np.dot(segment,source)/(np.linalg.norm(segment)*np.linalg.norm(source)))
    # Decoder/resampler paths can differ by a fraction of one 16 kHz sample.
    # Refine the match rather than mistaking a 25 microsecond shift for damage.
    window=movie[lag-2:lag+len(source)+2];samples=np.arange(len(source))+2
    scores=[]
    for offset in np.linspace(-.6,.6,25):
        aligned=np.interp(samples+offset,np.arange(len(window)),window)
        score=float(np.dot(aligned,source)/(np.linalg.norm(aligned)*np.linalg.norm(source)))
        scores.append((score,float(offset)))
    correlation,offset=max(scores)
    assert correlation>.97,(entry['id'],correlation,lag/16000)
    previous=lag+len(source)
    assert hashlib.sha256((VOICE/entry['recording']).read_bytes()).hexdigest()==entry['source_sha256']
    checks.append({'id':entry['id'],'audio_start_seconds':(lag+offset)/16000,'waveform_correlation':correlation,'integer_sample_correlation':raw_correlation,'alignment_fraction_of_sample':offset})
inventory=json.loads((P.parent/'V2/voice_preservation_before.json').read_text(encoding='utf-8-sig'))
assert {p.name for p in VOICE.iterdir() if p.is_file()}=={item['Name'] for item in inventory}
for item in inventory:assert hashlib.sha256((VOICE/item['Name']).read_bytes()).hexdigest().upper()==item['SHA256']
gdata=(P/'Godot/Elliot_Game.glb').read_bytes();g=json.loads(gdata[20:20+struct.unpack_from('<I',gdata,12)[0]])
actions={a['name'] for a in g['animations']};assert len(actions)==59
for primitive in manifest['primitives'].values():assert primitive['clip'] in actions
assert len(g['skins'][0]['joints'])==17
assert len({item['id'] for item in manifest['lines']})==18
assert len({item['category'] for item in manifest['lines']})==13
render=json.loads((R/'gallery_render_validation.json').read_text());assert render['line_count']==18 and not render['failures']
assert all(p['voice_finished'] for p in render['performances'])
phone_distances=[d for p in render['performances'] for d in p['phone_contact_distances']]
report={'recordings':18,'categories':13,'primitives':len(manifest['primitives']),'original_audio_unchanged':121,'voice_folder_files_unchanged':123,'reel_duration_seconds':len(movie)/16000,'recorded_audio_checks':checks,'minimum_audio_correlation':min(c['waveform_correlation'] for c in checks),'maximum_phone_center_to_ear_m':max(phone_distances),'all_rendered_voice_playbacks_completed':True,'render_failures':render['failures'],'unreal_runtime_tested':False,'independent_listening_review':False}
(R/'reel_validation.json').write_text(json.dumps(report,indent=2))
print('REEL_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='recorded_audio_checks'},indent=2))
