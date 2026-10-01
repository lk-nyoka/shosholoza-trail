# Codex / Claude Code Handoff

Integrate this train-audio pack into the main 3D train project.

## Intent

The sound is intentionally procedural and state-driven. It does not attempt to reproduce one named locomotive exactly. It should *perceptually behave like a believable train* as the visual simulation changes.

## Do not replace the system with one looping MP3

Preserve these behaviours:

- idle layer while stopped/slow
- traction/engine tone changes with speed and acceleration
- wind grows non-linearly with speed
- low-frequency rumble grows with movement
- rail impacts trigger from distance travelled
- braking hiss/squeal responds to actual braking/deceleration
- bridge resonance crossfades in for the whole bridge zone
- tunnel reverb stays active while the train is in a tunnel
- crossing sequence fires when entering a crossing trigger
- cinematic/window/station cameras change the mix
- camera distance reduces train prominence

## Integration order

1. Copy `public/audio/train` and `src/audio` into the main app.
2. Mount one `useTrainAudio()` instance near JourneyManager/TrainController.
3. Connect the real train speed, acceleration and brake state.
4. Connect CameraDirector mode and actual camera-to-train distance.
5. Connect route/environment trigger zones.
6. Add an explicit user-facing `Enable sound` or `Start journey` action that calls `resume()`.
7. Tune levels using the real 3D scene.
8. Only after that, consider true spatial `PannerNode`/Three.js positional placement for horn/engine/wheels.

## Validate after integration

Check each independently:

- stopped
- starting
- 30 km/h
- 80 km/h
- 120 km/h
- moderate braking
- hard braking
- bridge
- tunnel
- crossing
- window camera
- cinematic camera
- camera moving far away and back

Do not declare it complete until those cases have been heard in the running application.
