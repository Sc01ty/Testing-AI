class_name NPCAnimator
extends Node

## Plays clips from the manifest-driven library.
##
## Priorities and durations come from config/elliot_animations.json rather than
## being hard-coded here, so the Python side owns the vocabulary and this script
## only owns playback policy: crossfade, locking, cooldowns and phone visibility.

@export var character_root: Node

var animation_player: AnimationPlayer
var library: ClipLibrary

var current_state: String = "NERVOUS_IDLE"
var current_clip: String = ""
var current_priority: int = -1
var lock_remaining: float = 0.0
var cooldowns: Dictionary = {}

## Emitted whenever a different clip starts, so the debug panel and the phone
## attachment can react without polling.
signal clip_changed(clip_name: String, priority: int)

const CROSSFADE: float = 0.18


func _ready() -> void:
	library = ClipLibrary.new()
	library.name = "ClipLibrary"
	add_child(library)

	animation_player = _find_animation_player(character_root)
	if animation_player:
		_apply_loop_modes()
		request("IDLE_NERVOUS", 10, 0.0, true)
	else:
		push_warning("Elliot GLB did not expose an AnimationPlayer.")


## Pool to fall back to when a one-shot finishes. The behaviour controller keeps
## this in step with its current state.
var idle_fallback: String = "IDLE_NERVOUS"


func _process(delta: float) -> void:
	lock_remaining = maxf(0.0, lock_remaining - delta)
	for key: Variant in cooldowns.keys():
		cooldowns[key] = maxf(0.0, float(cooldowns[key]) - delta)

	# A non-looping clip leaves the character frozen on its last frame once the
	# AnimationPlayer stops. Returning to the idle pool is what keeps him alive
	# between reactions.
	if animation_player and not animation_player.is_playing() and not library.loops(current_clip):
		request(idle_fallback, 5, 0.0, true)


func set_idle_fallback(pool: String) -> void:
	idle_fallback = pool


## Looping is a property of the clip, declared in the manifest. Without this the
## idles play once and Elliot freezes on the last frame.
func _apply_loop_modes() -> void:
	for library_name: StringName in animation_player.get_animation_library_list():
		var animation_library: AnimationLibrary = animation_player.get_animation_library(library_name)
		for animation_name: StringName in animation_library.get_animation_list():
			var clip: String = String(animation_name)
			if library.loops(clip):
				var animation: Animation = animation_library.get_animation(animation_name)
				if animation:
					animation.loop_mode = Animation.LOOP_LINEAR


## `wanted` may be a pool name or a literal clip name. Pools are resolved through
## the library so repeated requests produce variation.
func request(wanted: String, priority: int = -1, cooldown_s: float = 0.0, force: bool = false) -> bool:
	if not animation_player:
		return false

	var clip: String = wanted
	if ClipLibrary.POOLS.has(wanted):
		clip = library.pick(wanted)
	elif not library.has_clip(wanted):
		# Unknown name: keep the old behaviour of warning rather than failing silently.
		push_warning("NPCAnimator: unknown clip or pool '" + wanted + "'")
		return false

	if clip.is_empty():
		return false

	var resolved_priority: int = priority if priority >= 0 else library.priority_of(clip)

	if not force:
		if wanted == current_state and animation_player.is_playing() and library.loops(clip):
			return false
		if float(cooldowns.get(wanted, 0.0)) > 0.0:
			return false
		if lock_remaining > 0.0 and resolved_priority < current_priority:
			return false

	var resolved: StringName = _resolve_animation(clip)
	if resolved == StringName():
		push_warning("Missing Elliot animation: " + clip)
		return false

	animation_player.play(resolved, CROSSFADE)
	current_state = wanted
	current_clip = clip
	current_priority = resolved_priority
	cooldowns[wanted] = cooldown_s

	# Non-looping reactions hold their slot so a lower-priority idle cannot cut
	# them off mid-movement.
	if library.loops(clip):
		lock_remaining = 0.0
	else:
		lock_remaining = minf(library.duration_of(clip) * 0.82, 1.6)

	clip_changed.emit(clip, resolved_priority)
	return true


## Force-play one exact clip, used by the developer animation browser.
func play(clip_or_pool: String) -> void:
	request(clip_or_pool, 100, 0.0, true)


func can_interrupt(priority: int) -> bool:
	return lock_remaining <= 0.0 or priority >= current_priority


func set_playback_speed(value: float) -> void:
	if animation_player:
		animation_player.speed_scale = clampf(value, 0.25, 1.5)


func current_shows_phone() -> bool:
	return library.shows_phone(current_clip)


func duration_of(clip_or_pool: String) -> float:
	if ClipLibrary.POOLS.has(clip_or_pool):
		var members: Array = ClipLibrary.POOLS[clip_or_pool] as Array
		if not members.is_empty():
			return library.duration_of(String(members[0]))
	return library.duration_of(clip_or_pool)


func _resolve_animation(wanted: String) -> StringName:
	for library_name: StringName in animation_player.get_animation_library_list():
		var animation_library: AnimationLibrary = animation_player.get_animation_library(library_name)
		for animation_name: StringName in animation_library.get_animation_list():
			if String(animation_name).to_upper() == wanted.to_upper():
				var prefix: String = String(library_name) + "/" if library_name != StringName() else ""
				return StringName(prefix + String(animation_name))
	# Fall back to a suffix match, which is how the original importer named them.
	for library_name: StringName in animation_player.get_animation_library_list():
		var animation_library: AnimationLibrary = animation_player.get_animation_library(library_name)
		for animation_name: StringName in animation_library.get_animation_list():
			if String(animation_name).to_upper().ends_with(wanted.to_upper()):
				var prefix: String = String(library_name) + "/" if library_name != StringName() else ""
				return StringName(prefix + String(animation_name))
	return StringName()


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node == null:
		return null
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child: Node in node.get_children():
		var found: AnimationPlayer = _find_animation_player(child)
		if found:
			return found
	return null
