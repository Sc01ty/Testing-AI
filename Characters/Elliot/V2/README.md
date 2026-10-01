# Elliot V2

Built 30 September 2026. Complete visual redesign with an anatomical human foundation, sage sweatshirt, charcoal trousers, swept dark hair and trainers. Existing gameplay is preserved. All 121 audio files are unchanged and remain unconnected.

## Open and use

- `Blender/Elliot_V2.blend`: editable master, currently loaded in Blender.
- `Godot/Elliot_V2.glb`: main model, 57,662 triangles, 164 bones, 59 named animations and 12 facial shapes.
- `Godot/Elliot_V2_LOD1.glb`: 32,549-triangle alternative. Automatic distance switching is not configured.
- `Unreal/Elliot_V2.fbx` and `Elliot_V2_LOD1.fbx`: skeletal meshes. The other 59 FBXs contain individually named animations.
- `Textures`: 1024-pixel skin and clothing base-colour and normal maps.
- `Previews`: Blender inspection renders and selected Godot animation frames.
- `VALIDATION.md`: checks performed and remaining limitations.

The active `D:/Video Projects/NPC Package/GodotTest/main.tscn` uses V2, with blinking and adjusted gaze and phone attachment. `GodotTest/main_v1.tscn` restores the old model. Original assets and integration backups remain available.

## Import

Godot: import GLB, keeping named animations and morph targets. Use the main model or LOD1 according to your performance budget. The existing demo already contains the adapted procedural controllers.

Unreal: import the character FBX as a Skeletal Mesh with Import Morph Targets enabled. Import individual animation FBXs against that skeleton. This is a custom skeleton; map it through Unreal's IK Rig/Retargeter when using mannequin animations. Check materials, scale and orientation in your actual project. Unreal runtime import has not been tested because Unreal is not installed here.

GLB and FBX are interchange formats, not a guarantee of identical behaviour in every engine. Materials, controllers and retargeting need engine-specific setup.

## Quality status

This is a working redesign, not a certified finished production character. All 59 retargeted actions passed technical Godot checks, but the complete set has not received continuous visual review or individual animation cleanup. Remaining art work includes checking foot contact, hand poses, extreme joint bends, clothing intersections and expression quality. No voice playback or lip-sync is integrated.

## Provenance and rebuilding

The anatomical foundation, proportion targets, rig and skin weights use MakeHuman core graphical assets under CC0, pinned to commit `a8bc2d54ff0ac92e78ff71431b1023eda42bf482` at https://github.com/makehumancommunity/makehuman. Licence statements are included under `assets`. Clothing, hair, eyes, textures and facial controls were assembled and authored in Blender for this redesign.

The build sequence is `build_elliot_v2.py`, then `scripts/fit_eyelids.py`, `scripts/fix_texture_padding.py`, and `scripts/build_lod1.py`. Run through Blender's Python environment. Keep facial shape values at zero for neutral exports. Older correction helpers are historical and are not additional required build steps. Regenerating exports requires refreshing the Godot demo asset and rerunning validation.

## Adult midpoint — 30 September 2026

Alfie rejected the broad initial model and the overcorrected narrow, oversized-head revision. Both editable versions and their renders are preserved under `History`. The current master is a fresh correction from the original adult foundation, not another warp of the rejected slim build.

Adult head size is restored, shoulder-joint spacing remains moderate, the torso is slightly longer relative to the legs, upper-arm bulk is reduced, arms are moderately shortened, and hands are 20% smaller than the broad source. Everyday idle hands now hang inward with a slight finger curl. The face remains recognisable, with a small jaw adjustment and less vertically exaggerated eyes. Clothing style is unchanged. The existing 164-bone hierarchy, 59 named animations and 12 facial controls remain; retargeting accounts for changed dimensions.

`adult_proportion_measurements.json` records neutral skeleton measurements. Measurements constrain this pass; they do not establish artistic approval or eliminate the need to inspect movement, skinning, hands and materials. Unreal runtime remains untested. Voices remain unchanged and unconnected.

Rebuild with `scripts/build_adult_midpoint.py -- --preview` in Blender, inspect the candidate, then run the same script without `--preview`, followed by `scripts/join_neckline.py`, `scripts/remove_old_neck_trim.py` and `scripts/build_lod1.py`. The candidate preserves the adult neutral pose separately in `Blender/Elliot_Adult_Candidate.blend`. Refresh the Godot asset and rerun validation afterward. Older silhouette helpers are historical.

## Video montage

- `Previews/Montage_01_Broad.png`: first broad version.
- `Previews/Montage_02_Overcorrected.png`: rejected narrow/large-head version.
- `Previews/Montage_03_Adult.png`: current adult midpoint.

These are real Blender renders, not generated concept illustrations. `History/README.md` identifies the corresponding editable models.
