# Elliot performance — approved appearance locked

First milestone: Gama's original **Bit close, mate.mp3** drives a talking shot in Godot. Watch `Previews/Elliot_First_Talking_Shot.mp4`.

The performance combines the original audio, audio-derived mouth cues, uncomfortable brows, a blink, eye contact breaking, a hand gesture and a small retreat. Face controls reset after the reaction. The approved base geometry, clothing, material assignments and skeleton rest transforms were fingerprinted before/after and did not change. The untouched approved Blender/GLB are in `ApprovedAppearance`.

## Reuse

`GodotTest/scripts/elliot_performance.gd` exposes `configure(model)` and `play_performance(cue)`. Audio, mouth timing, expression preset and timed body clips are separate data. `stop_performance()` stops sound and clears the facial controls. This isolated demo does not modify Jev or connect speech to autonomous game events yet.

Supported controls: rest (all mouth values zero), A, E, I, O, U, M/B/P, F/V, L and W/Q, plus jaw, blink, brows, smile/frown and four pupil directions. This is a deliberately graphic face; jaw movement opens the mouth graphic rather than deforming the approved head anatomy.

Local Rhubarb speech recognition generated `cues/CLOSE_01.rhubarb.json` from a derived mono WAV, assisted by the known dialogue. Rhubarb supplies eight speech mouth categories plus rest, mapped onto the model's controls; it does not distinguish every requested vowel individually. The extra model controls remain available for authoring or another phoneme source. This is speech-derived timing, not a volume-only jaw flap. Source: https://github.com/DanielSWolf/rhubarb-lip-sync

Expression presets: neutral, uncomfortable, uneasy recognition, frightened and awkward insult. Only the uncomfortable performance is connected to a recording in this milestone. Example cue data:

```json
{"audio":"path/to/recording.mp3", "duration":1.2, "expression":"uncomfortable", "mouthCues":[{"start":0.0,"end":0.1,"value":"A"}], "body":[{"time":0.0,"clip":"HAND_UP_BOUNDARY"},{"time":1.25,"clip":"STEP_BACK_SMALL"},{"time":2.25,"clip":"IDLE_NERVOUS_A"}], "retreat_m":0.16}
```

Live playback uses the audio playback clock with mixer/output latency correction; offline capture uses a fixed frame clock. Audio verification compares the captured soundtrack to the original recording. The MP4 contains Gama's audio, with speech starting approximately 0.64 seconds into the shot.

The existing 59 body clips include the requested idle, walking, glance, recoil, boundary, turn and phone actions. A separate existing phone prop attaches to RightHand; `Previews/Elliot_Phone_Sequence.mp4` is a diagnostic sequence for pull-out, screen look, scroll, raise, talk, end call and put-away. Visual inspection found that the retargeted call pose holds the phone too far from the ear. Phone contact needs an arm-animation correction before this sequence is considered finished. These are reusable prototype clips, not motion-capture polish.

## Validation and limits

- 59 clips, 17 bones and 21 neutral-default face controls in the updated GLB.
- All 11 existing presence scenarios pass with the new facial export.
- Offline and live audio-clock demos exercise multiple speech mouth cues and reset the face.
- All 121 original audio files and all 123 Voice-folder files match the earlier SHA256 inventory.
- Rendered close-up frames were visually inspected. Audio presence/timing was checked numerically; the agent did not independently listen to the performance.
- Updated GLB and skeletal mesh FBX include the facial controls. Unreal playback was not tested. Godot's performance controller needs an equivalent implementation in Unreal; the JSON timing data is engine-independent.

Next: review the first talking shot, correct phone-to-ear contact through animation, then author the frightened and uneasy-recognition performances using their actual recordings. Keep the approved appearance fixed. Jev remains outside this milestone.


## Superseding reusable milestone

The sections above describe the first talking prototype. `Reusable/README.md` is now the current performance guide: 18 recordings, 25 primitives, independent bone layers and corrected phone-to-ear actions. The old phone diagnostic reflects the pre-fix animation; use the new reel for current evidence.
