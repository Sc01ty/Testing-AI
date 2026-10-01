class_name ClipLibrary
extends Node

## Manifest-driven access to Elliot's animation vocabulary.
##
## The 59 clips and their metadata are authored in Python and exported to
## config/elliot_animations.json, so the engine never hard-codes a clip name,
## duration or priority. Adding a clip on the Python side makes it selectable
## here without touching GDScript.
##
## Pools group interchangeable clips. Selection avoids the most recent pick so a
## pool of two still reads as variation rather than an alternating pattern.

const MANIFEST_PATH: String = "res://config/elliot_animations.json"

var manifest: Dictionary = {}
var clips: Dictionary = {}
var priorities: Dictionary = {}

var _last_pick: Dictionary = {}
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

## Behavioural pools. Keys are what the behaviour layers ask for; values are the
## authored clips that can satisfy that request.
const POOLS: Dictionary = {
	"IDLE_CALM": ["IDLE_NEUTRAL_A", "IDLE_NEUTRAL_B"],
	"IDLE_NERVOUS": ["IDLE_NERVOUS_A", "IDLE_NERVOUS_B", "NERVOUS_IDLE"],
	"IDLE_FIDGET": ["ADJUST_SLEEVE", "RUB_HANDS", "TOUCH_FACE", "SCRATCH_NECK"],
	"WEIGHT_SHIFT": ["WEIGHT_SHIFT_LEFT", "WEIGHT_SHIFT_RIGHT"],
	"ENVIRONMENT_GLANCE": ["LOOK_AROUND", "CHECK_BEHIND"],
	"FLOOR_GLANCE": ["LOOK_AT_FLOOR"],
	"SIDE_GLANCE": ["LOOK_AROUND"],
	"NOTICE": ["NOTICE_PLAYER", "DOUBLE_TAKE"],
	"BRIEF_PLAYER_CHECK": ["QUICK_GLANCE", "LOOK_BACK_AT_PLAYER"],
	"LOOK_NEAR_PLAYER": ["QUICK_GLANCE", "LONG_GLANCE"],
	"BREAK_CONTACT": ["BREAK_EYE_CONTACT", "GLANCE_AWAY"],
	"GUARDED": ["CLOSED_POSTURE"],
	"CONFUSED": ["CONFUSED_REACTION"],
	"STEP_BACK_SOFT": ["STEP_BACK_SMALL"],
	"STEP_BACK_HARD": ["STEP_BACK_FAST", "STEP_BACK_STARTLED"],
	"RETREAT_CONTINUE": ["BACKPEDAL_SHORT", "SIDE_STEP_LEFT", "SIDE_STEP_RIGHT"],
	"LEAVE": ["TURN_AND_WALK_AWAY", "WALK_AWAY_NERVOUS", "TURN_AWAY_FROM_PLAYER"],
	"FACE_PLAYER": ["TURN_TOWARD_PLAYER_PARTIAL"],
	"TURN_IN_PLACE": ["TURN_LEFT", "TURN_RIGHT"],
	"WALK": ["WALK_FORWARD"],
	"WALK_BACK": ["WALK_BACKWARD"],
	"CHECK_FOLLOW": ["STOP_AND_LOOK_BACK"],
	"WARNING": ["NERVOUS_WARNING", "HAND_UP_BOUNDARY"],
	"ANNOYED": ["ANNOYED_REACTION"],
	"IMPACT_LIGHT": ["BUMP_RECOIL_LIGHT"],
	"IMPACT_MEDIUM": ["BUMP_RECOIL_MEDIUM", "SHOULDER_IMPACT_LEFT", "SHOULDER_IMPACT_RIGHT"],
	"IMPACT_HEAVY": ["STUMBLE_BACK"],
	"RECOVER_BALANCE": ["REGAIN_BALANCE"],
	"CALM_DOWN": ["DEEP_BREATH"],
	"PHONE_START": ["PHONE_NOTICE"],
	"PHONE_OUT": ["PHONE_PULL_OUT"],
	"PHONE_USE": ["PHONE_LOOK_AT", "PHONE_SCROLL"],
	"PHONE_ANSWER": ["PHONE_RAISE_TO_EAR"],
	"PHONE_CALL": ["PHONE_TALK_IDLE", "PHONE_LISTEN_IDLE"],
	"PHONE_INTERRUPTED": ["PHONE_LOWER_SLIGHTLY"],
	"PHONE_HANG_UP": ["PHONE_END_CALL"],
	"PHONE_STOW": ["PHONE_PUT_AWAY"],
}


func _ready() -> void:
	_rng.randomize()
	load_manifest()


func load_manifest() -> bool:
	if not FileAccess.file_exists(MANIFEST_PATH):
		push_warning("ClipLibrary: manifest missing at " + MANIFEST_PATH)
		return false
	var text: String = FileAccess.get_file_as_string(MANIFEST_PATH)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("ClipLibrary: manifest is not valid JSON")
		return false
	manifest = parsed as Dictionary
	clips = manifest.get("clips", {}) as Dictionary
	priorities = manifest.get("priorities", {}) as Dictionary
	return true


func has_clip(clip_name: String) -> bool:
	return clips.has(clip_name)


func info(clip_name: String) -> Dictionary:
	return clips.get(clip_name, {}) as Dictionary


func duration_of(clip_name: String) -> float:
	return float(info(clip_name).get("duration", 1.0))


func priority_of(clip_name: String) -> int:
	return int(info(clip_name).get("priority", 10))


func loops(clip_name: String) -> bool:
	return bool(info(clip_name).get("loop", false))


func shows_phone(clip_name: String) -> bool:
	return bool(info(clip_name).get("phone_visible", false))


func root_motion_of(clip_name: String) -> float:
	return float(info(clip_name).get("root_motion_m", 0.0))


func all_clip_names() -> Array:
	var names: Array = clips.keys()
	names.sort()
	return names


## Pick a clip from a pool, preferring one that was not used last time.
func pick(pool_name: String) -> String:
	var raw: Variant = POOLS.get(pool_name, [])
	var options: Array = []
	for entry: Variant in (raw as Array):
		var clip_name: String = String(entry)
		if has_clip(clip_name):
			options.append(clip_name)
	if options.is_empty():
		# Unknown pool, or the manifest lacks every member. Fall back to the
		# clip guaranteed to exist rather than playing nothing at all.
		return "NERVOUS_IDLE" if has_clip("NERVOUS_IDLE") else ""
	if options.size() == 1:
		_last_pick[pool_name] = options[0]
		return options[0]

	var previous: String = String(_last_pick.get(pool_name, ""))
	var choice: String = options[_rng.randi_range(0, options.size() - 1)]
	var guard: int = 0
	while choice == previous and guard < 5:
		choice = options[_rng.randi_range(0, options.size() - 1)]
		guard += 1
	_last_pick[pool_name] = choice
	return choice
