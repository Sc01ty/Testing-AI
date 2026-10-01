extends "res://tests/talking_elliot_demo.gd"

var prop_controller: PhoneController
var beat: int = -1
var beat_end: float = .5
const PHONE_BEATS = ["PHONE_PULL_OUT", "PHONE_LOOK_AT", "PHONE_SCROLL", "PHONE_RAISE_TO_EAR", "PHONE_TALK_IDLE", "PHONE_END_CALL", "PHONE_PUT_AWAY"]

func build() -> void:
	super.build()
	camera.position=Vector3(.8,1.35,-3.8);camera.look_at(Vector3(0,1.05,0));camera.fov=34
	prop_controller=PhoneController.new();prop_controller.character_root=model;world.add_child(prop_controller)

func tick() -> void:
	total += root.get_process_delta_time()
	if total >= beat_end:
		beat+=1
		if beat >= PHONE_BEATS.size():
			print("ELLIOT_PHONE_SEQUENCE_COMPLETE ",JSON.stringify({"clips":PHONE_BEATS,"attached":is_instance_valid(prop_controller.phone),"bone":"RightHand"}))
			quit(0);return
		var clip: String=PHONE_BEATS[beat]
		director.player.play(clip, .12)
		beat_end=total+director.player.get_animation(clip).length
		if clip=="PHONE_TALK_IDLE": beat_end+=1.0
		if prop_controller.phone: prop_controller.phone.visible=true
