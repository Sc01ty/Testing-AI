class_name BehaviourEventBus
extends Node

signal behaviour_event(event_name: StringName, context: Dictionary)

@export_file("*.json") var config_path: String = "res://config/elliot_behavior_spec.json"
var definitions: Dictionary = {}
var cooldowns: Dictionary = {}
var serial: int = 0
var context_provider: Node


func _ready() -> void:
	var config: Dictionary = _load_json(config_path)
	definitions = config.get("events", {})


func _process(delta: float) -> void:
	for key in cooldowns.keys():
		cooldowns[key] = maxf(0.0, float(cooldowns[key]) - delta)


func emit_behaviour(event_name: StringName, raw_context: Dictionary = {}, force := false) -> bool:
	var definition: Dictionary = definitions.get(String(event_name), {})
	if not force and float(cooldowns.get(event_name, 0.0)) > 0.0:
		return false
	serial += 1
	var context: Dictionary = raw_context.duplicate(true)
	if context_provider and context_provider.has_method("get_state_name"):
		context["state"] = String(context_provider.call("get_state_name"))
	if context_provider and context_provider.has_method("get_previous_state_name"):
		context["previous_state"] = String(context_provider.call("get_previous_state_name"))
	context["priority"] = int(definition.get("priority", 0))
	context["event_serial"] = serial
	context["variant_seed"] = hash(String(event_name) + ":" + str(serial))
	cooldowns[event_name] = float(definition.get("cooldown_s", 0.0))
	behaviour_event.emit(event_name, context)
	return true


func choose_variant(context: Dictionary, variants: Array) -> Variant:
	if variants.is_empty():
		return null
	return variants[abs(int(context.get("variant_seed", 0))) % variants.size()]


func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Missing behaviour config: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
