# Add the two scripts and assets from GodotDemo to your project.
# Manifest, voice copies and timing cues use portable res:// paths.
var performer := ElliotPerformanceSystem.new()
add_child(performer)
performer.configure($Elliot)
performer.play_line("CLOSE_01")
# performer.stop_performance() safely interrupts audio and resets face/phone.
