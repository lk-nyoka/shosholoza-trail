# Johannesburg animation — isolated city increment

## Station sequence and saved view

Departure is now an explicit action after arrival. The train dwells until selected,
then follows an integrated smoothstep acceleration profile on the existing local
track. Wheels, sound and following camera consume the same position/speed. The
64-second slider spans arrival, dwell and departure. This is a finite authored
station sequence, not a simulation of onward travel to another city.

Graphics and day/dusk preferences persist locally and safely fall back when storage
is blocked or malformed. Sound is never restored automatically. Under reduced
motion, selecting departure keeps playback paused; the slider remains available.
Motion derivative/continuity and preference validation have unit coverage; mobile
reload and reduced-motion departure are included in the browser checks.

## Reused animated passengers

Johannesburg now consumes the existing `Passengers.ts` API and Sketchbook boxman
GLB, with the project's existing MIT attribution. No model or animation system
was rebuilt. Twenty-four deliberately placed passengers wait or sit across the
four platforms; lightweight mode shows twelve. There is no walking clip in this
asset, so the new crowd does not claim to walk. The whole-figure tint is inherited
from the shared module. Existing simple figures remain if optional loading fails.

Model loading is independent of the train. The source geometry/texture stays alive
while skeleton-aware clones use it and is disposed after the crowd. The standalone
build copies the model and licence alongside the train assets. Passenger placement
and browser model-load/count checks are included in the city verification.

## Arrival and exploration controls

The existing scene now supports projected place-label buttons, contextual cards,
keyboard dismissal and a label visibility toggle. Labels use DOM projection and
the existing viewpoints rather than adding geometry or loading remote content.
The four cards explicitly identify the authored approximations.

An arrival card appears once when playback or seeking crosses the 24-second
stop; dismissal persists until rewind. Return to train follows the current train
position without restarting playback. Manual orbit or a different viewpoint
releases the follow camera. The ArrivalMoment unit test covers crossing,
dismissal and rewind. The city browser check exercises arrival dismissal and
follow selection along with the previous mobile/lifecycle checks.

## Latest city increment (21 September)

Three bounded agents added CityArchitecture, StationDetails and corrected
StreetLife. The existing train GLBs (Quaternius CC0), TrainSound, OrbitControls,
instancing approach and local skyline reference were reused; no replacement
engine, external imagery, paid service or new dependency was introduced.

Visible additions: varied building families with podium shopfronts and stepped
roofs; platform numbers, 3D clocks, tactile strips, stair access, handrails and a
forecourt connection. Traffic now stays on its asphalt and tyres meet the road.
New street-level/concourse presets and lightweight rendering controls are included.
The scene remains an authored approximation, not a verified Park Station model.

Startup renders the city independently of model loading. A failed train request
does not freeze street animation. Persisted page navigation suspends/resumes the
scene, reduced-motion changes pause animation, and paused orbit avoids unnecessary
shadow-map refreshes. The street preset permits looking upward from 2.4 metres.

The standalone development config now serves only the two GLB files from public:
the previously built public/johannesburg.html must not shadow the current source.
Standalone builds copy those models and their licence into their own output.
The main production multipage build remains separate and unchanged.

Verification: nine city geometry tests, both TypeScript checks and the 141-test
project suite passed during integration. Updated source browser captures and
verification are stored in evidence/johannesburg-source-check. The browser script
can take CITY_BASE and CITY_EVIDENCE environment variables to avoid collisions
with another developer's preview or captures. No phone frame-rate claim is made.

## Current integration status

Merged into the main working branch on 2026-09-21 at the user's request.
The production Vite build now includes both `/animation` (Pretoria) and
`/johannesburg.html`, with reciprocal city navigation. These are separate scenes,
not a continuous simulated journey between cities. Pretoria's existing waypoint
work is retained. `scripts/check-city-integration.mjs` validates both directions
on desktop and mobile against the production Worker. All 112 unit tests, both
TypeScript checks, the production build and local navigation checks pass.

The historical isolation/integration notes below describe the development stage;
the separate worktree remains useful for future city-only development.

Branch: `codex/johannesburg-animation`. Worktree: sibling `ShosholozaTrail-johannesburg`.
No Pretoria, shared renderer, application routing, dependencies or production files were modified.

## Preview

Run `node_modules/.bin/vite --config johannesburg.vite.config.ts` from this worktree.
Open http://127.0.0.1:8790/johannesburg.html. Windows: use `vite.cmd`.
The separate entry has arrival playback, scrubbing, platform and city viewpoints,
orbit controls, an authored camera reveal and reduced-motion support. The train
slows to a stop rather than looping or teleporting. Restart explicitly replays it.

## What is grounded and what is approximate

- The station anchor is the existing local OSM node 326084268 in
  `data/provenance/johannesburg.osm` and `data/hubs.json` (OSM contributors, ODbL).
- `public/assets/photos/johannesburg.webp` was inspected for skyline massing,
  varied building heights and stepped roof silhouettes. It is not rendered.
- The railway layout, station architecture, flat grade, camera path and surrounding
  city blocks are authored approximations, NOT surveyed or georeferenced geometry.
  The preview states this visibly. Do not interpret the station anchor as validation
  of the rest of the model. No actual attraction or heritage story is invented.
- Train meshes reuse the existing Quaternius CC0 assets and licence. They are
  generic models, not a specific South African locomotive class. Uniform scaling
  preserves proportions; spacing uses actual model bounds. The preview has ten
  vehicles; production should use its existing train controller instead.
- The local `Repos/threex.proceduralcity-master` README and MIT licence were
  consulted. No source or assets were copied. City geometry is new instanced code.
- Runtime inputs are local. This does not establish service-worker offline caching.

## Integration contract for the shared-renderer owner

`createJohannesburgScene()` returns `root`, `trainRoot`, `update(arrivalSeconds, worldSeconds?)`,
`setNight(boolean)` and `dispose()`. Units are metres; Y up; authored tracks run along local X with their
centre at Z=0. The origin is the centre of this station study, not a surveyed
projection. Keep explicit placement/heading metadata when attaching it to the route.
`trainRoot` is optional: the factory itself loads no train assets. Its caller owns
attached model resources. `dispose()` releases the city's resources and removes
its root; it is idempotent. The city does not modify a camera, global lights or
application state. Camera ownership remains with the shared journey controller.

Do not merge preview.ts camera ownership into RailScene. Mount the scene through
the shared scene registry once its owner is ready, adapt the authored preview
sequence to CinematicCamera, and use the production train/route simulation.
Integration is deliberately pending so Claude's Pretoria work stays untouched.

## Verification

`npm run check:app` checks types. `node scripts/check-johannesburg.mjs` exercises
local-only loading, train loading, pause, seek/stop, restart, mobile width,
reduced motion and idempotent disposal. Evidence is in `evidence/johannesburg/`.
Draw/triangle counts are recorded, not a claim of measured mobile frame rate.

Next fidelity work requires local Park Station architectural references and
surrounding footprints; the current skyline must not be labelled an exact replica.

## Second increment: street life, lighting and physical coherence

- Connected authored streets between the blocks, pavements, crossings, fourteen
  moving vehicles including minibus-like approximations, and a planted forecourt.
  Traffic follows two separate lanes with rounded corners; city time continues
  after the train has stopped. This is not a simulation of actual traffic rules.
- Vehicle parts, trees and street furniture use instancing. Four-sided window
  planes replace window boxes: the measured city view dropped from 325,096 to
  283,656 triangles while adding side/rear facades. This is a geometry count,
  not a measured phone frame rate. The final capture has 325 draw calls.
- Day/dusk control, procedural sky, varied window illumination and four platform
  lights. No new textures, external services or paid dependencies are required.
- Preview reuses the existing TrainSound class without modifying it. Sound is
  off initially, enabled by user gesture, and muted when paused or hidden.
- Source wheel meshes rotate around their own baked centres, driven by travelled
  distance. No smoke. Models retain their documented generic-model limitations.
- Camera enters the rail gap before rising above the canopy. Regression tests
  check the path against canopy volumes and continuity at phase boundaries.
- Concourse stair heights now terminate at the deck, with continuous handrails.
- Paused/reduced-motion views stop issuing rendering work once orbit settles.
  Resizing, seeking, lighting changes and manual camera actions invalidate the view.

Validation: 103 project tests passed; the three city-specific tests pass after
the final geometry changes; app TypeScript and standalone Vite build pass.
The expanded browser check passes with no page errors or cross-origin requests,
including continued traffic after arrival, sound mute, dusk, mobile, paused
rendering and disposal. See verification.json and day/dusk captures.

Standalone production build (does not overwrite the app's public directory):
`node_modules/.bin/vite build --config johannesburg.vite.config.ts --outDir ../dist/johannesburg`.
Vite reports a 667 KB minified entry (~173 KB gzip), mostly the shared Three.js
runtime; its default 500 KB chunk advisory remains. There is no hardware performance
claim and no deployment. All work stays on the isolated Johannesburg branch.
