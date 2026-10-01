from pathlib import Path
import json,shutil
P=Path(r'D:\Video Projects\NPC Package\Characters\Elliot\V2')
glb=P/'Godot/Elliot_V2.glb'
test=P/'godot_validation.json';presence=P.parents[2]/'GodotTest/presence_test.log'
assert test.stat().st_mtime>=glb.stat().st_mtime and not json.loads(test.read_text())['errors'], 'Current Godot validation is still pending'
assert presence.stat().st_mtime>=glb.stat().st_mtime and 'PRESENCE_SCENARIOS_COMPLETE failures=0' in presence.read_text(), 'Current presence validation is still pending'
m=json.loads((P/'animation_manifest.json').read_text());lod=json.loads((P/'lod_manifest.json').read_text())
readme=(P/'README.md').read_text()
readme=readme.split('## Silhouette correction')[0]
readme=readme.replace('57,755',f"{m['triangle_count']:,}").replace('32,585',f"{lod['LOD1_triangles']:,}")
readme+='''## Adult midpoint — 30 September 2026

Alfie rejected the broad initial model and the overcorrected narrow, oversized-head revision. Both editable versions and their renders are preserved under `History`. The current master is a fresh correction from the original adult foundation, not another warp of the rejected slim build.

Adult head size is restored, shoulder-joint spacing remains moderate, the torso is slightly longer relative to the legs, upper-arm bulk is reduced, arms are moderately shortened, and hands are 20% smaller than the broad source. Everyday idle hands now hang inward with a slight finger curl. The face remains recognisable, with a small jaw adjustment and less vertically exaggerated eyes. Clothing style is unchanged. The existing 164-bone hierarchy, 59 named animations and 12 facial controls remain; retargeting accounts for changed dimensions.

`adult_proportion_measurements.json` records neutral skeleton measurements. Measurements constrain this pass; they do not establish artistic approval or eliminate the need to inspect movement, skinning, hands and materials. Unreal runtime remains untested. Voices remain unchanged and unconnected.

Rebuild with `scripts/build_adult_midpoint.py -- --preview` in Blender, inspect the candidate, then run the same script without `--preview`, followed by `scripts/join_neckline.py`, `scripts/remove_old_neck_trim.py` and `scripts/build_lod1.py`. The candidate preserves the adult neutral pose separately in `Blender/Elliot_Adult_Candidate.blend`. Refresh the Godot asset and rerun validation afterward. Older silhouette helpers are historical.

## Video montage

- `Previews/Montage_01_Broad.png`: first broad version.
- `Previews/Montage_02_Overcorrected.png`: rejected narrow/large-head version.
- `Previews/Montage_03_Adult.png`: current adult midpoint.

These are real Blender renders, not generated concept illustrations. `History/README.md` identifies the corresponding editable models.
'''
(P/'README.md').write_text(readme)
(P/'History/README.md').write_text('''# Elliot redesign history

Both rejected versions are intentionally preserved for the video and comparison.

- `2026-09-30_BroadBuild/Elliot_V2_BroadBuild.blend`: broad first redesign.
- `2026-09-30_OvercorrectedSlim/Elliot_OvercorrectedSlim.blend`: rejected narrow/oversized-head redesign; a GLB and preview folder are also included.
- `../Blender/Elliot_V2.blend`: current adult midpoint.

The three montage images are in `../Previews`. Keep these historical files when cleaning the package.
''')
for source,dest in [(P/'Previews/Elliot_Before_Front.png','Montage_01_Broad.png'),(P/'History/2026-09-30_OvercorrectedSlim/Previews/Elliot_After_Front.png','Montage_02_Overcorrected.png'),(P/'Previews/Elliot_After_Front.png','Montage_03_Adult.png')]:shutil.copy2(source,P/'Previews'/dest)
shutil.copy2(P/'Previews/Elliot_After_Front.png',P/'Previews/Elliot_Adult_Front.png')
validation=(P/'VALIDATION.md').read_text().split('The slimmer silhouette revision')[0]
validation=validation.replace('57,755',f"{m['triangle_count']:,}").replace('32,585',f"{lod['LOD1_triangles']:,}")
validation+='The adult midpoint revision was rechecked against the current GLB and FBX exports. All 59 animation samples and 11 presence scenarios passed. Neutral proportion measurements and current front/face renders were inspected. Artistic approval and complete motion review remain outstanding. Both rejected versions remain preserved.\n'
(P/'VALIDATION.md').write_text(validation)
print('ADULT_PACKAGE_NOTES_COMPLETE',m['triangle_count'],lod['LOD1_triangles'])
