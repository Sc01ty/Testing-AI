import json,subprocess,hashlib,shutil,argparse,re
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3\Performance'); R=P/'Reusable'
PROJECT=Path(r'D:\Video Projects\NPC Package\GodotTest');VOICE=P.parents[1]/'Voice'
FF=r'C:\Users\Alfie\Downloads\remotion-scary-monster\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
RH=P/'tools/Rhubarb-Lip-Sync-1.14.0-Windows/rhubarb.exe'
# These are combinations of reusable pieces, never individual animation bakes.
rows=[
('NOTICE_01','noticing','Oh-Hey.mp3','neutral','look_back','none','neutral_idle','none'),
('NOTICE_04','noticing','Oh- sorry, didn\'t see you there.mp3','uneasy_recognition','look_back','double_take','awkward_idle','none'),
('STARE_01','staring','Can I help you.mp3','nervous','glance_away','none','awkward_idle','none'),
('STARE_06','staring',"Please stop staring, it's weird.mp3",'uncomfortable','look_at_floor','annoyed','nervous_idle','none'),
('CLOSE_01','too_close','Bit close, mate.mp3','nervous','glance_away','boundary_hand','step_back','none'),
('CLOSE_02','too_close','Could you just- back up a bit.mp3','uncomfortable','glance_away','boundary_hand','step_back','none'),
('FOLLOW_01','followed','Why are you following me.mp3','uneasy_recognition','double_take','double_take','nervous_idle','none'),
('WARN_01','warning','Get away from me.mp3','frightened','watch_player','boundary_hand','fast_step_back','none'),
('HIT_01','being_hit','What was that for.mp3','frightened','look_back','startled_recoil','startled_recoil','none'),
('IGNORE_01','ignoring','Anyway.mp3','neutral','phone_screen','none','neutral_idle','check_phone'),
('LEAVE_01','walking_away',"I'm going to go.mp3",'nervous','glance_away','none','nervous_walk_away','none'),
('INSULT_04','insulting_back','Yeah Well your shoes are stupid.mp3','awkward_insult','regret_glance','annoyed','awkward_idle','none'),
('SCARED_01','getting_scared',"Okay, okay- I don't want any trouble.mp3",'frightened','watch_player','scared_posture','step_back','none'),
('TELL_01','using_phone',"Hey- yeah, it's me There's this guy, he won't leave me alone.mp3",'nervous','phone_call','none','weight_shift','phone_call'),
('TELL_04','using_phone','Can you come get me, please.mp3','frightened','phone_call','none','nervous_idle','phone_call'),
('MEMORY_01','remembering','Oh It\'s you again.mp3','uneasy_recognition','double_take','double_take','awkward_idle','none'),
('MEMORY_04','remembering','I remember you.mp3','uneasy_recognition','watch_player','none','hands_by_side','none'),
('TRUST_02','trusting',"You're alright, actually.mp3",'warm','look_back','none','neutral_idle','none')]
primitives={
'neutral_idle':('IDLE_NEUTRAL_A','base',True),'awkward_idle':('IDLE_NERVOUS_B','base',True),'nervous_idle':('IDLE_NERVOUS_A','base',True),'hands_by_side':('IDLE_NEUTRAL_B','base',True),'weight_shift':('WEIGHT_SHIFT_LEFT','base',True),
'glance_away':('GLANCE_AWAY','head',False),'look_at_floor':('LOOK_AT_FLOOR','head',False),'look_back':('LOOK_BACK_AT_PLAYER','head',False),'double_take':('DOUBLE_TAKE','gesture',False),'boundary_hand':('HAND_UP_BOUNDARY','gesture',False),'annoyed':('ANNOYED_REACTION','gesture',False),'startled_recoil':('BUMP_RECOIL_LIGHT','base',False),'scared_posture':('CLOSED_POSTURE','gesture',True),
'step_back':('STEP_BACK','base',False),'fast_step_back':('STEP_BACK_FAST','base',False),'turn_away':('TURN_AWAY_FROM_PLAYER','base',False),'normal_walk':('WALK_FORWARD','base',True),'nervous_walk_away':('WALK_AWAY_NERVOUS','base',True),
'phone_pull_out':('PHONE_PULL_OUT','gesture',False),'phone_look':('PHONE_LOOK_AT','gesture',True),'phone_scroll':('PHONE_SCROLL','gesture',True),'phone_raise':('PHONE_RAISE_TO_EAR','gesture',False),'phone_talk':('PHONE_TALK_IDLE','gesture',True),'phone_lower':('PHONE_END_CALL','gesture',False),'phone_put_away':('PHONE_PUT_AWAY','gesture',False)}
expressions={'neutral':{},'nervous':{'Brow_Concern':.75,'Frown':.10},'uncomfortable':{'Brow_Concern':.85,'Brow_Down':.15,'Frown':.12},'uneasy_recognition':{'Brow_Up':.32,'Brow_Concern':.55},'frightened':{'Brow_Up':.75,'Brow_Concern':.75,'Frown':.14},'awkward_insult':{'Brow_Down':.40,'Frown':.14},'warm':{'Brow_Up':.16,'Smile':.55}}
manifest={'schema_version':1,'appearance_locked':True,'voice_root':'res://performance/audio/','cue_root':'res://performance/cues/','crossfade_seconds':.22,'primitives':{key:{'clip':v[0],'layer':v[1],'loop':v[2]} for key,v in primitives.items()},'expressions':expressions,'mouth_mapping':{'A':'Viseme_MBP','B':'Viseme_I','C':'Viseme_E','D':'Viseme_A','E':'Viseme_O','F':'Viseme_U','G':'Viseme_FV','H':'Viseme_L','X':''},'lines':[]}
parser=argparse.ArgumentParser(description='Batch audio-derived cues from editable performance metadata')
parser.add_argument('--manifest',type=Path,help='Read line combinations from your edited manifest instead of the 18 defaults')
parser.add_argument('--voice-root',type=Path,default=VOICE,help='Folder containing original recordings; read only')
parser.add_argument('--project',type=Path,default=PROJECT,help='Godot project receiving portable audio, cues and manifest')
parser.add_argument('--output',type=Path,default=R,help='Derived audio and cue cache')
parser.add_argument('--ffmpeg',default=FF)
parser.add_argument('--rhubarb',type=Path,default=RH)
args=parser.parse_args();VOICE=args.voice_root;PROJECT=args.project;R=args.output;FF=args.ffmpeg;RH=args.rhubarb
if args.manifest:
    manifest=json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    rows=[(i['id'],i['category'],i['recording'],i['face'],i['eyes'],i['gesture'],i['action'],i['prop']) for i in manifest['lines']]
    manifest['lines']=[]
for directory in [R/'audio',R/'cues',PROJECT/'performance/audio',PROJECT/'performance/cues']:directory.mkdir(parents=True,exist_ok=True)
for index,(id,category,filename,face,eyes,gesture,action,prop) in enumerate(rows):
    assert re.fullmatch('[A-Z0-9_]+',id),id
    source=VOICE/filename;assert source.exists(),source
    wav=R/'audio'/f'{id}.wav';dialog=R/'audio'/f'{id}.txt';output=R/'cues'/f'{id}.json'
    dialog.write_text(filename[:-4].replace('-',', '),encoding='utf-8')
    signature=hashlib.sha256(source.read_bytes()+dialog.read_bytes()).hexdigest();signature_file=R/'cues'/f'{id}.source.sha256'
    if not output.exists() or not signature_file.exists() or signature_file.read_text()!=signature:
        subprocess.run([FF,'-y','-v','error','-i',str(source),'-ac','1','-ar','16000',str(wav)],check=True)
        subprocess.run([str(RH),'-f','json','--dialogFile',str(dialog),'--extendedShapes','GHX','-o',str(output),str(wav)],check=True,capture_output=True)
        signature_file.write_text(signature)
    cues=json.loads(output.read_text());duration=cues['metadata']['duration'];assert duration>0
    line={'id':id,'category':category,'recording':filename,'audio':f'{id}.mp3','cues':f'{id}.json','duration':duration,'face':face,'eyes':eyes,'gesture':gesture,'action':action,'prop':prop,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    manifest['lines'].append(line)
    shutil.copy2(source,PROJECT/'performance/audio'/f'{id}.mp3');shutil.copy2(output,PROJECT/'performance/cues'/f'{id}.json')
    print(f'PREPARED {index+1}/{len(rows)} {id} {duration:.2f}s',flush=True)
(R/'performance_manifest.json').write_text(json.dumps(manifest,indent=2))
(PROJECT/'performance/manifest.json').write_text(json.dumps(manifest,indent=2))
print('REUSABLE_LIBRARY_READY',len(rows),len(primitives),flush=True)
