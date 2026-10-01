import json,shutil
from pathlib import Path
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V3');R=P/'Performance/Reusable';PROJECT=Path(r'D:\Video Projects\NPC Package\GodotTest')
STAGE=Path(r'C:\Users\Alfie\OneDrive\Claude X Obisdian\Elliot Performance Build');DEMO=R/'GodotDemo'
for folder in ['assets','scripts','performance/audio','performance/cues','build_tools']:(DEMO/folder).mkdir(parents=True,exist_ok=True)
shutil.copy2(P/'Godot/Elliot_Game.glb',DEMO/'assets/elliot_game.glb');shutil.copy2(PROJECT/'assets/elliot_phone.glb',DEMO/'assets/elliot_phone.glb')
for filename in ['elliot_performance_system.gd','elliot_performance_phone.gd']:shutil.copy2(STAGE/filename,DEMO/'scripts'/filename)
shutil.copy2(PROJECT/'performance/manifest.json',DEMO/'performance/manifest.json')
for folder in ['audio','cues']:
    for file in (PROJECT/'performance'/folder).iterdir():
        if file.is_file() and not file.name.endswith('.import'):shutil.copy2(file,DEMO/'performance'/folder/file.name)
gallery=(STAGE/'performance_gallery.gd').read_text(encoding='utf-8')
gallery=gallery.replace('extends SceneTree','extends Node').replace('const OUTPUT="D:/Video Projects/NPC Package/Characters/Elliot/V3/Performance/Reusable"','const OUTPUT="user://performance"')
gallery=gallery.replace('var world: Node3D','var root: Window\nvar world: Node3D')
gallery=gallery.replace('func _initialize() -> void: call_deferred("build")','func _ready() -> void:\n\troot=get_tree().root\n\tDirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT+"/Previews"))\n\tcall_deferred("build")')
gallery=gallery.replace('process_frame.connect(tick)','get_tree().process_frame.connect(tick)').replace('await process_frame','await get_tree().process_frame').replace('quit(','get_tree().quit(')
(DEMO/'scripts/performance_gallery.gd').write_text(gallery,encoding='utf-8')
(DEMO/'main.tscn').write_text('[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://scripts/performance_gallery.gd" id="1"]\n\n[node name="ElliotPerformanceGallery" type="Node"]\nscript=ExtResource("1")\n')
(DEMO/'project.godot').write_text('config_version=5\n\n[application]\nconfig/name="Elliot Performance Gallery"\nrun/main_scene="res://main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n\n[display]\nwindow/size/viewport_width=1280\nwindow/size/viewport_height=720\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
godot=r'C:\Users\Alfie\Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64_console.exe'
(DEMO/'Play_Elliot.cmd').write_text('@echo off\n"'+godot+'" --headless --path "%~dp0" --editor --import > "%~dp0import.log" 2>&1\n"'+godot+'" --path "%~dp0"\n')
for file in ['build_performance_library.py','fix_phone_actions.py']:
    shutil.copy2(STAGE/file,DEMO/'build_tools'/file)
manifest=json.loads((R/'performance_manifest.json').read_text());m=json.loads((P/'animation_manifest.json').read_text())
m['voice_integration']={'scope':'reusable standalone performance gallery','recordings_connected':len(manifest['lines']),'autonomous_game_events':False,'jev_integrated':False};m['phone_ear_pose_corrected']=True
(P/'animation_manifest.json').write_text(json.dumps(m,indent=2))
(R/'API_EXAMPLE.gd').write_text('''# Add the two scripts and assets from GodotDemo to your project.
# Manifest, voice copies and timing cues use portable res:// paths.
var performer := ElliotPerformanceSystem.new()
add_child(performer)
performer.configure($Elliot)
performer.play_line("CLOSE_01")
# performer.stop_performance() safely interrupts audio and resets face/phone.
'''.replace('\n+','\n'))
print('STANDALONE_GALLERY_PACKAGED',DEMO)
