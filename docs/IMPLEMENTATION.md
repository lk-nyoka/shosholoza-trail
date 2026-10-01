# Reference-led Pretoria implementation

**Current direction:** `ANIMATION_PLAN.md` supersedes treating the map-based
ride as the animation world. `/animation` is independent local Three.js;
`/ride` remains satellite/geographic navigation. The earlier checkpoints below
record work already done and do not require satellite in the animation view.

The user's attached plan is the direction. Adapt it to the existing application;
ignore `reference-audit.md` as requested on 20 September 2026. The existing
application and the supplied files under `../Repos` are the implementation
sources. Earlier archived build plans do not define this work.

## Current checkpoint: run the existing application

Keep React, MapLibre, Three.js, the Cloudflare Worker and the existing assets.
Do not start another application or replace the national journey to prototype
Pretoria. Check the current application before making graphical changes.
See `RUNNING.md` for startup and verification.

## Visible increment: Pretoria inspection

Following the user's request for a visible implementation, the existing ride
now links to `/ride?inspect=pretoria`. This moves the development controls
forward in the sequence so the user can inspect the starting experience:

- Distance-bounded playback from 0 to 5 km on the existing mapped rail route.
- A keyboard-accessible scrubber and distance shortcuts, with discovery state
  reconstructed on rewind and playback paused on seek.
- Four selectable existing camera presets, without rebuilding the map.
- A separate `RideInspector` component receiving route data and callbacks.

This is not the reference-derived follow camera or a new landmark cinematic.
The train assets and existing camera algorithms are preserved for comparison.
The default full journey remains accessible. Next inspect this short section
before changing camera behaviour or integrating a supplied landmark asset.

## Next visible increment: reference-derived follow mode

The approved preview now includes **Follow the train**. Its orbit/return logic
comes from the local MIT EarthDrive source; the existing preset views remain
available. `camera/TrainFollowCamera.ts` separates smoothing state from the
MapLibre adapter, and `camera/CameraDirector.ts` owns its camera clock. The train
simulation is unchanged. See `camera-reference.md` and `deviations.md` for the
original values and explicit adaptations. This supersedes the statement above
about follow mode not yet existing; landmark cinematics remain future work.

Build and React type checks pass; 61 unit tests and six targeted browser tests
pass, including look-around return, seek, rewind and preset switching. Desktop
and mobile captures of the packaged offline renderer are in
`evidence/pretoria-follow-*.png`. Offline captures are not satellite evidence.

## Adapted sequence

1. **Baseline:** build, type-check, test and run the existing app. Present the
   local ride for visual inspection before changing its behaviour.
2. **Engine boundaries:** extract reusable responsibilities incrementally from
   `app/src/components/Ride.tsx`. Reuse `ride-model.ts` for route sampling,
   `train-model.ts` for the articulated rake, `train-3d.ts` for close rendering,
   and `train-camera.ts` behind a camera director. Show the module interfaces
   before implementing complex graphics. Avoid duplicate simulation loops.
3. **Pretoria slice:** use a distance-bounded section of the existing
   `public/data/route-ride.geojson`. Preserve its OSM provenance and the original
   coordinates. Add an isolated development view to inspect the line, then
   a test vehicle, then the existing train. Existing national pages stay usable;
   new reference-led work is limited to this slice until approved.
4. **Reference follow camera:** compare the local EarthDrive, racing-game and
   Sketchbook camera source. Record the selected implementation, constants,
   coordinate conversion and necessary deviations. MapLibre camera control must
   use its supported APIs, not Mapbox-only free-camera APIs. A director owns
   transitions and follow/free/cinematic modes. Keep debugging and scrubbing.
5. **One real attraction and supplied cinematic:** integrate a matching licensed
   asset and authored camera trajectory, first independently, then with approach
   triggers and return to the train. Do not describe a photograph, generic model
   or unrelated animation as a reconstructed Pretoria attraction.
6. **Effects and environment:** bring in one appropriate effect at a time from
   licensed reference source, retaining its parameters except documented
   adaptations. Use local geographic context and existing terrain/buildings.
   Keep effects independently switchable; no steam on the electric train.
7. **Acceptance:** compare reference behaviour, inspect the complete short
   journey and measure performance before extending to more destinations.

Every major phase ends with a running page, concrete inspection instructions
and a user visual checkpoint, as required by the attached plan. Existing code
and test results are useful starting points, not automatic visual approval.

## Concrete reference candidates

- `../Repos/earth-drive-main/src/main.js`: geographic orbit/recentring camera;
  MIT. Its per-frame recentering and geographic frame conversion need explicit
  treatment when adapting to MapLibre. Its keyed remote tile service is not a
  supplied local asset and is not required for reuse of the camera idea/code.
- `../Repos/racing-game-main/src/models/vehicle/Vehicle.tsx` and
  `src/effects/Cameras.tsx`: speed/steering-driven chase camera and sway; MIT
  code. Source camera is parented to the chassis: detached controlled lag is a
  documented adaptation, not an identical copy. `Dust.tsx` is a possible effect
  reference. The SD40-2 train has separate CC-BY attribution and is not our
  South African electric train replacement.
- `../Repos/Sketchbook-master/src/ts/core/CameraOperator.ts`: orbit/follow
  behaviour; MIT. The separate spring simulation utilities must not be
  misrepresented as the camera's actual follow algorithm.
- `../Repos/triptrail-main/app.js`: route reveal and journey timing; MIT.
  Adapt specific functions only if they improve the existing journey system.

Check the actual local licence and preserve its notice before copying code.
Do not copy unlicensed San Verde, SA-Maps or Cape-to-Cairo material on the
assumption that a downloaded public repository grants reuse. Procedural-city
code and its separately licensed textures must be treated separately.

## Asset dependency still unresolved

The local GLB/GLTF metadata and route/path-file inspection has not identified a
matching Pretoria 3D attraction plus authored camera trajectory. A racing train
animation, an Eiffel Tower tour, a hospital model and existing photographic
scenes do not fill that requirement. Blender files have been inventoried but
their internal scenes still need inspection before concluding that no suitable
camera exists there. Continue independent route/train/camera work first; resolve
the asset pair before claiming the complete cinematic slice is implemented.

No reference repositories are to be fetched from the internet for this task.
