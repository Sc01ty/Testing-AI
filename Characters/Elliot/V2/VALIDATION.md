# Elliot V2 validation — 30 September 2026

Verified against the final high-detail exports:

- GLB structure, skin and animation inventory: passed; 164 joints, 59 animations, 12 facial shapes, 57,662 triangles, neutral shape values zero.
- Godot 4.7.1: imported and sampled all 59 animations; required bones and facial controls present; finite head poses and plausible height; no validation errors.
- Active Godot gameplay scene: smoke run without errors. Presence scenarios A–K: 11 passed, zero failures in the latest log.
- Blender inspection renders and five selected Godot animation frames reviewed. These are sampled visual checks, not a complete continuous animation review.
- FBX round trip in Blender: skeletal mesh, skinning, 164 bones, 12 neutral facial shapes and one separate walking animation verified. All 59 animation FBXs exist and are nonempty.
- Voice preservation: all 123 files in the original voice folder match their recorded SHA256 hashes; 121 are audio files. No audio integration added.
- LOD1 export: 32,549 triangles; separate GLB and FBX supplied. Automatic LOD switching is not configured.

Unreal runtime import and playback remain untested. Full animation cleanup, detailed deformation review, facial-performance approval and LOD1 engine playback remain outstanding. Passing structural and behaviour checks does not establish final artistic quality.

Evidence: `export_validation.json`, `fbx_validation.json`, `godot_validation.json`, `lod_manifest.json`, preview images, and the Godot test logs.

The adult midpoint revision was rechecked against the current GLB and FBX exports. All 59 animation samples and 11 presence scenarios passed. Neutral proportion measurements and current front/face renders were inspected. Artistic approval and complete motion review remain outstanding. Both rejected versions remain preserved.
