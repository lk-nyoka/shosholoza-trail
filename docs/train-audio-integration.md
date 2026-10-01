# Procedural train audio integration

## Source and ownership

The user-supplied `../train_audio_pack` engine, deterministic mixer and all eight WAVs are used directly. Core files live in `app/src/audio/train-pack`; WAVs live in `public/audio/train`. `SUPPLIED_HANDOFF.md` preserves the original handoff. The optional supplied React hook is reference code, not mounted: both Three.js scenes use the shared `TrainSound` adapter. No second movement simulation, external audio host, map request or dependency was introduced.

Claude's latest committed Pretoria work and the existing Johannesburg geometry, passengers, arrival/departure, cameras and preferences are retained. The satellite ride's separate audio remains unchanged. No automatic bridge sound is attached to overhead road bridges.

## Connections

- Pretoria: scene distance and measured speed, frame delta, crossing proximity, actual camera distance, cinematic/follow/free mode, journey pause and visibility.
- Johannesburg: `stationMotion` distance/speed, measured acceleration/brake effort, camera distance, cinematic/follow/station/free mode, station envelope, pause, visibility and page lifecycle.
- Future cities supply `SoundState` to the same adapter; do not instantiate another engine in a render loop.
- Enable audio from a user gesture. There is one lazy AudioContext per scene. Disable suspends it; dispose closes it and removes the development panel.
- Local assets are included in the regenerated offline pack and standalone Johannesburg build. A first visit/download still requires access to the local or deployed host.

## Necessary adaptations to supplied engine

1. Optional authoritative `distanceM` drives joints. Reverse/discontinuous seeks and resume reset the impact baseline; there is no catch-up burst.
2. Brake detection uses acceleration, avoiding the original per-frame speed difference threshold that changes with frame rate.
3. Suspend cancels crossing timers and active one-shots. Disposal closes the context.
4. Per-layer tuning multipliers and distance attenuation for wind, reverb and one-shots complement the supplied mix. Oscillators, samples and mix curves remain supplied implementations.
5. Existing scene sound controls use the adapter. Pretoria reports loading errors instead of leaving a false Sound-on state.
6. The old animation-only synthesized soundscape is replaced by the pack; the map ride is untouched.

## Run and listen

From the repository: `npm run build:app`, `node scripts/build-assets.mjs`, then `npx wrangler dev --port 8791`.

- http://127.0.0.1:8791/animation?audioDebug
- http://127.0.0.1:8791/johannesburg.html?audioDebug

Click Sound, then start/resume the journey. Open **Train audio ? development**. It displays real speed, acceleration, braking, environment, camera and route distance, with master/traction/rail/wind/rumble/bridge/brakes controls. Bridge and Tunnel are explicitly simulated five-second overrides; Route clears them. Horn and Crossing are manual test cues. These controls do not alter movement.

Listening sequence: Pretoria departure from rest (up to 79.2 km/h), rising rail/wind layers, Bridge test and fade, Tunnel test and fade, Horn/Crossing, pause/resume and mute. In Johannesburg, listen to the slowing arrival and braking, dwell, then Depart station. Compare close follow/platform views with the distant city view.

## Validation and boundary

`npm run check:app`, `npm test` (176 passing), `python scripts/validate-train-audio.py` (all eight pass), and `node scripts/check-train-audio.mjs` cover build/type surface, supplied mix properties, WAV integrity and browser lifecycle. Browser checks establish loading/control behavior, not subjective sound quality or phone performance.

The supplied integration instructions require a visual and audible human check before further audio-design tuning. This is the first integration milestone. Verified natural rail-bridge/tunnel route triggers remain future work; synthetic test controls must not be presented as real geography. This work is local, not a new production deployment.
