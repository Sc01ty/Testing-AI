Latest scope, 30 September 2026: preserve every voice line; do not integrate audio yet. Any audio integration milestone below is deferred. See README.md and VALIDATION.md for completed work and remaining checks.

# Elliot — complete character redesign

Date: 2026-09-30
Project: `D:\Video Projects\NPC Package`
Scope: Alfie explicitly requested a complete visual redesign. This supersedes the older polish-only direction for the character asset. Keep existing gameplay as the integration target.

## Outcome

A convincing, grounded human NPC with an editable Blender master, a smoothly weighted humanoid rig, useful facial expressions and speech shapes, and tested Godot and Unreal exports. Preserve Elliot's socially awkward, nervous, observant personality. His appearance can change completely.

Portable means reusable mesh, skeleton, textures and baked animations. Engine-specific controllers, collision, navigation, audio, gaze and decision logic need adapters; no single file makes a working NPC in every game.

## Verified starting point

- Blender is running from `G:\SteamLibrary\steamapps\common\Blender\blender.exe`.
- No Blender tool is exposed to this chat; the plugin directory search returned no Blender plugin. Live connection is not established.
- Existing character sources include `build_elliot_model.py`, `rig_elliot.py`, `elliot_animations.py`, and `Characters\Elliot\Model\elliot_rigged.glb`.
- Existing rig source has 17 bones and rigid weights for segmented geometry. Existing preview shows primitive limbs, simple facial features and mitten-like hands.
- Voice files exist under `Characters\Elliot\Voice`. Alfie reports recording and splitting Gama's lines; this plan does not certify their completeness or audio quality.
- Vault notes report 59 existing actions. Recount and inspect actual clips before retargeting; their existence does not establish visual quality.

## 1. Blender access and preservation

Establish live control through an explicitly installed/configured Blender bridge if available. Otherwise author Blender Python scripts that run inside Blender's Scripting workspace, with saved files and rendered previews for each checkpoint. Running a separate background Blender process is an alternative for repeatable builds, but is not control of the currently open scene.

Read the current scene before changing it. Save the redesign under a new `Characters/Elliot/V2/` directory in the project; retain V1 model, animations and captures. Never overwrite an unsaved Blender scene. Connection/setup work is a separate first implementation step; this planning session has not installed a bridge or changed Blender.

## 2. Art direction and first visible proof

Proposed direction: believable stylized realism. Young adult, ordinary build, slightly asymmetrical face, tired/observant eyes, natural messy hair, relaxed hoodie or sweatshirt, trousers and worn trainers. Nervousness comes from posture and performance rather than exaggerated anatomy. Avoid a glossy hero appearance.

Build a head-and-shoulders study first, including real eyelids, lips, eyeballs and hair silhouette. Review neutral-lit front, profile and three-quarter renders at gameplay distance and dialogue distance. Freeze facial proportions and silhouette before detailed clothes and texture work.

Quality route: use a clean, legally reusable human base mesh when it materially improves anatomy and topology, then redesign the face, silhouette, clothing and textures. Record its origin and redistribution rights. A procedural script can automate construction and exports, but does not itself guarantee artist-quality anatomy. Do not select or buy a base until its suitability and rights are checked.

Gate: the neutral face looks human and intentional before facial animation is added.

## 3. Game-ready geometry and materials

Create continuous deforming body geometry with edge flow around shoulders, elbows, knees and mouth. Give the hands fingers and a usable phone grip. Model clothing with thickness at visible edges and deliberate folds; avoid expensive simulated cloth as a runtime dependency. Use mesh hair or hair cards that survive exports.

Starting desktop budget, subject to profiling: approximately 35–60k triangles for the main character, 2k body/clothing textures and a 2k face set where close-ups justify it. Keep material slots few. Add lower-detail meshes after the hero mesh works; no claim of mobile suitability without separate profiling.

Use UVs and portable base-color, normal, roughness and metallic maps. Bake Blender procedural materials into textures. Recreate skin/eye shading in each engine where necessary, and pack texture channels per export target.

Gate: convincing silhouette, face, hands and clothing in neutral lighting; no holes or obvious clipping in test poses.

## 4. Rig and deformation

Build an A-pose humanoid with a dedicated root, pelvis, spine, neck/head, limbs, feet/toes, finger bones and eye controls. Add twist support where deformation needs it. Keep Blender animator controls separate from the exported deform skeleton. Bake constraints/IK into animation; do not rely on Blender drivers importing into engines.

Smooth-weight the new mesh and inspect shoulder raises, crossed arms, elbow/knee bends, crouch and phone-to-ear poses. Build a mapping from the old 17-bone skeleton to the new rig; keep action names or provide an explicit migration table so gameplay can still select actions.

Gate: no severe shoulder collapse, twisted wrists, broken knees or floating phone. Skeleton scale and rest pose remain consistent across exports.

## 5. Facial performance and recorded speech

Add blinks, brow raise/lower, squint, smile/frown, mouth tension, jaw opening and speech shapes for closed lips, wide vowels, rounded vowels and lip-to-teeth sounds. Include teeth and a modest mouth interior so speech does not reveal an empty head.

Start with one existing line, such as “Bit close, mate.” Author/test its mouth motion against the actual audio. A volume-driven jaw is only an early test; believable speech needs phoneme/viseme timing and controlled blending. Automate the rest only after the sample works. Keep blinks and expressions able to layer over speech.

Gate: the sample line is readable and believable in a close-up, with the mouth returning naturally to rest. Test simultaneous speech, blinking and body animation.

## 6. Animation migration and improvement

Retarget and clean the existing library rather than assuming the old motion will look good on a better mesh. First prove idle, walk, turn, step-back, warning gesture and phone use. Fix foot sliding, hand placement, shoulder motion and abrupt transitions. Add finger articulation and subtle breathing where visible.

Preserve the full useful action library, with a manifest recording clip name, duration, loop status, root-motion policy and retarget status. Use in-place locomotion as the initial engine-driven movement path; provide root-motion variants only when an engine integration needs them. Avoid applying movement twice.

Gate: a short sequence of idle → look at player → speak → step back → walk away works without visible transition failures.

## 7. Export and engine tests

| Deliverable | Purpose |
|---|---|
| `Elliot_V2.blend` | Editable master: model, rig, materials, actions and face shapes |
| `Godot/Elliot_V2.glb` | Mesh, deform skeleton, textures, animations and face shapes |
| `Unreal/Elliot_V2.fbx` plus textures/animation files | Unreal skeletal mesh, baked clips and morph targets |
| `animation_manifest.json` and rig mapping | Stable integration contract |
| Preview renders and test recordings | Evidence of appearance and behavior |
| README and asset license records | Import settings, dependencies, usage rights and limitations |

Godot: test GLB in the existing harness first. Map the humanoid skeleton, preserve gameplay action selection, and refit collision, gaze offsets and phone attachment. Put engine logic in a wrapper scene so reimporting the asset does not erase integration work.

Unreal: test FBX skeletal import, morph targets and baked clips in a small character test scene. Configure humanoid retargeting explicitly if using Unreal's mannequin animation ecosystem. Check unit conversion, axes, root and material channels separately from Godot.

Both engines must pass: correct height/orientation, intact skinning, idle/walk/step-back playback, working face shapes, one audio-synchronized line, phone alignment and reasonable performance on the target machine. Opening a file is not enough.

References: [Godot import configuration](https://github.com/godotengine/godot-docs/blob/master/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.rst), [Godot skeleton retargeting](https://github.com/godotengine/godot-docs/blob/master/tutorials/assets_pipeline/retargeting_3d_skeletons.rst), [Unreal skeletal FBX pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-skeletal-mesh-pipeline-in-unreal-engine), [Unreal morph target pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-morph-target-pipeline-in-unreal-engine).

## Build order and finish line

Connection/access → head study → full mesh/materials → deformation rig → six cleaned actions + one spoken line → Godot proof → Unreal proof → remaining animation migration → detail/LOD pass → packaged exports.

Test a rough rigged export in both engines early, before finishing all textures or migrating all actions. This catches portability problems while they are cheap to fix.

First milestone: new Elliot stands in Godot, notices the player, says a recorded line with facial movement, and steps back convincingly. Final milestone: the finished design and useful animation library pass both engine test scenes and visual review.

For the video, preserve a matched V1/V2 shot with identical camera, lighting, line and action. The strongest payoff is Elliot behaving convincingly in-game. Record failures and genuine reactions; the redesign should reach that payoff before expanding the experiment into another system.

