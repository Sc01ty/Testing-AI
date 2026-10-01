# Elliot — reusable performance system

The approved appearance is locked. This milestone adds a reusable presentation layer, not Jev or microphone input.

Watch `Previews/Elliot_18_Performances.mp4`: 18 actual Gama recordings across 13 categories, rendered from the Godot runtime. The first talking milestone is safely preserved in `../Milestones/First_Talking_Shot`.

## Play and change performances

Open `GodotDemo/project.godot` in Godot, or double-click `GodotDemo/Play_Elliot.cmd` on Alfie's current computer. The standalone project has its own model, phone, 18 byte-identical voice copies and generated timing data. It has no dependency on Jev or the larger behaviour project.

Use Left/Right to choose a recording, Space to replay and Esc to close. Edit `GodotDemo/performance/manifest.json` to change a line's combination. The gallery loads metadata at startup.

Example:

```json
{
  "id":"CLOSE_01",
  "recording":"Bit close, mate.mp3",
  "audio":"CLOSE_01.mp3",
  "cues":"CLOSE_01.json",
  "face":"nervous",
  "eyes":"glance_away",
  "gesture":"boundary_hand",
  "action":"step_back",
  "prop":"none"
}
```

There are 25 named primitives covering neutral/awkward/nervous/hands-down/weight-shift idles; eye/head looks; double-take, boundary, annoyed, recoil and scared gestures; retreats, turn and walking; and the complete phone sequence. These reference the existing 59 clips instead of baking an animation for each recording.

Animation playback is split into disjoint bone masks: base posture/legs, upper-body arms and head/neck. Each player crossfades independently. Facial emotion and pupil direction ease separately; speech mouth shapes use a faster blend. Phone sequences automatically prepare the prop before speech, then lower and stow it afterward. Audio playback time drives mouth timing in live mode; Movie Maker uses fixed frame time.

Expression presets: neutral, nervous, uncomfortable, uneasy recognition, frightened, awkward insult and warm. Gaze presets include watching, glancing away, looking at the floor, recognition double-take, regretful glance and phone attention.

## Drop in another recording

Add an entry to a copy of the manifest, pointing to your recording filename and choosing reusable presets. Run `build_tools/build_performance_library.py` with `--manifest`, `--voice-root`, `--project` and `--output` paths. The source folder is read-only; derived WAVs, timing JSON and portable audio copies go elsewhere. `--ffmpeg` and `--rhubarb` allow different installed tool locations. Source/dialogue hashes cache existing analyses, so unchanged recordings need not be processed again.

Rhubarb supplies eight speech mouth categories plus rest. Those map onto the approved face's available viseme controls. It does not distinguish every vowel independently, and its automatic recognition can require timing corrections. No external API or replacement voice is used. See https://github.com/DanielSWolf/rhubarb-lip-sync for the recognizer.

`scripts/elliot_performance_system.gd` provides `configure(character)`, `play_line(id)`, `stop_performance()` and started/finished/interrupted signals. In a host game, give this module temporary ownership of the actor's animation/gaze channels; pause other controllers while it performs. Autonomous event wiring is deliberately deferred for review. Locomotion here is a presentation displacement; a host game should use its character collision/navigation movement when adopting it.

## Phone correction and export

Five shared phone actions were corrected in the Blender master: raise-to-ear, talking, listening, end-call and lower-slightly. Their GLB and individual FBX exports were updated. The wrist solves beside the head without changing bone lengths, skeleton rest transforms, clothes, materials or mesh geometry. Runtime measurements put the phone centre within 4.4 cm of the ear reference during the two calls; rendered frames show the phone beside the ear.

## Verified results

- 18 rendered performances, 13 categories, 25 reusable primitives; no runtime performance failures.
- All 18 recorded audio playbacks finish. Every soundtrack segment matches its source above 99.5% waveform correlation after fractional-sample alignment for decoder/resampler differences.
- All 121 original recordings and all 123 Voice-folder files match the original SHA256 inventory.
- All 11 pre-existing behaviour scenarios still pass; the larger project's behaviour and Jev remain untouched.
- The standalone gallery passes all 18 performances, interruption/reset checks and a new combination assembled only from metadata. A live audio-clock phone test also passes.
- Approved resting geometry and skeleton transforms retain their original fingerprint. Mesh material definitions and base vertex buffers are compared separately in the final inventory.

Evidence: `reel_validation.json`, `gallery_render_validation.json`, `standalone_validation.json`, `metadata_probe_validation.json`, `phone_pose_validation.json` and `presence_test.log`.

Limits: this is a reusable game presentation system with prototype animation clips, not motion-capture quality. Representative rendered frames were inspected; the agent did not independently listen to the recordings or watch the full reel continuously. Unreal animation/morph playback has not been tested, and its equivalent performance controller remains to be implemented. The JSON timing and selection metadata are portable, while the supplied runtime is Godot.
