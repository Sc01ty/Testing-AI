# Elliot — game-style restart

Current direction: deliberately stylised rounded-polygon NPC, not realistic anatomy. Fresh geometry was authored for the visible clothed character. There is no human body, chest anatomy, genital anatomy or anatomical pelvis hidden underneath.

## Files

- `Blender/Elliot_Game.blend`: editable model, 17-bone rig, 59 named actions, facial controls and inspection scene.
- `Godot/Elliot_Game.glb`: portable model, materials, 59 actions and 21 facial controls.
- `Unreal/Elliot_Game.fbx`: skeletal mesh and morphs; 59 individually named animation FBXs alongside it.
- `Previews`: actual Blender front, side, face and three-quarter renders, plus selected Godot animation captures.
- `animation_manifest.json`, `export_validation.json`, `godot_validation.json`: current inventory and validation evidence.
- `scripts/build_game_elliot.py`: historical geometry build through Blender Python (do not rerun over the approved performance master), using the existing V1 animation source from V2's compatibility copy. No external character-generation service or anatomical base is used.

The character is approximately 2,600 triangles. Plain material colours and restrained facial shapes replace detailed textures and anatomical sculpting. This makes style and pose easier to read and much cheaper to iterate.

## Status and import

Alfie approved this exact appearance on 30 September 2026. Proportions, clothing and style are locked. Performance controls were added without changing base geometry. Structural or gameplay checks do not establish complete animation polish. Prior rejected versions remain in V2 and its History folder.

Godot: import the GLB. The existing Godot demo uses `assets/elliot_game.glb`; `main_before_game_restart.tscn` preserves the previous demo scene. Existing behaviour scripts, blinking, attention and phone attachment remain in place.

Unreal: import the mesh FBX as a Skeletal Mesh with morph targets, then import the individual animation FBXs against its skeleton. This custom 17-bone skeleton is not the Epic mannequin. Retarget other animation libraries as needed. Unreal runtime has not been tested here.

All 121 original voice/audio files are preserved. `Performance/Previews/Elliot_First_Talking_Shot.mp4` is the first audio-driven performance. See `Performance/README.md` for reusable controls, scope and verification.


## Reusable performance milestone

`V3/Performance/Reusable` (or `Performance/Reusable` from V3) contains an 18-recording, 13-category performance gallery driven by 25 reusable primitives. Phone-to-ear actions are corrected. The standalone `GodotDemo/project.godot` and `Play_Elliot.cmd` provide interactive replay. The 121 originals and approved appearance are unchanged; Jev and autonomous speech wiring remain untouched. See the reusable README and rendered full reel.
