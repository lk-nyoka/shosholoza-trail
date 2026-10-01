# Reference audit

Phase 0 of the interactive train-tourism plan. Every repository in `Repos/` was opened and
read — licences, the specific files that implement the behaviour we want, and an honest
verdict on whether the code can legally and practically be reused.

Audited 20 September 2026. Main application: `ShosholozaTrail/` (MapLibre GL JS 5.7.1,
React 19 + Vite, Cloudflare Worker). Nothing in the application has been changed yet.

---

## Summary table

| Repository | Licence | Reusable? | What it contributes |
|---|---|---|---|
| Sketchbook-master | MIT | **Yes** | Framerate-independent spring damping (the anti-jitter system) |
| racing-game-main | MIT | **Yes** | Chase-camera rig, dust and skid particle systems |
| triptrail-main | MIT | **Yes** | MapLibre trail reveal, tile pre-caching sweep, deterministic playback |
| deck.gl-master | MIT | **Yes** (as a dependency) | `@deck.gl/maplibre` interleaved overlay, `ScenegraphLayer`, `TripsLayer` |
| threex.proceduralcity-master | MIT | Technique only | Canvas-generated window texture; code itself is dead |
| cesium-certification-main | Apache-2.0 | Legally yes, **practically no** | Vendored CesiumJS 1.107.1; would replace our whole map stack |
| earth-drive-main | MIT | Pattern only | Local-ENU-frame camera bridging; its data source is keyed and paid |
| san_verde-main | **No licence** | **No** | Design docs readable; code must not be copied |
| cape-to-cairo-railway-kml | **No licence** | **No** — and worse data than ours | Coarse hand-plotted KML, no Pretoria |
| SA-Maps-master | **No licence** | **No** | Administrative boundaries; 8 files are Git-LFS stubs |

Four repositories out of ten are safely and usefully reusable. That is a good outcome —
they happen to be the four that cover the systems we actually lack.

---

## The finding that changes the plan

**There are no supplied 3D attractions and no supplied camera paths anywhere in the workspace.**

A full sweep for `.glb .gltf .ply .splat .sog .spz .ksplat` and for camera/keyframe JSON
found only:

- `ShosholozaTrail/public/assets/models/train/quaternius-{electric,passenger}.glb` — CC0,
  already ours, already in use.
- Sample models belonging to the reference repos (Cesium's milk truck, racing-game's muscle
  car, Sketchbook's boxman). Not South African, not attractions.
- No Union Buildings. No Gaussian splat. No photogrammetry. No `camera-path.json`, no COLMAP
  `images.txt`, no SuperSplat keyframes, no GLTF camera animation clips.

The plan's central instruction is *"do not invent camera movement when supplied animation
exists"*. Here, none exists. Phases 11–14 (supplied cinematography, the Union Buildings
attraction, landmark + camera-path assembly) have no source material, and the plan explicitly
forbids me from filling that gap with my own interpretation and calling it done.

So those phases are blocked on you, not on me. Everything else in the plan is not blocked.
What you would need to supply is listed at the end of this document.

---

## Detailed audit

### Sketchbook-master — the most valuable single system

```
Project:   Sketchbook (swift502)
Licence:   MIT, Copyright (c) 2020 swift502 — LICENSE
Useful files:
  src/ts/physics/spring_simulation/SimulatorBase.ts        (fixed-timestep accumulator)
  src/ts/physics/spring_simulation/SpringSimulator.ts      (scalar spring)
  src/ts/physics/spring_simulation/VectorSpringSimulator.ts (vector spring)
  src/ts/physics/spring_simulation/RelativeSpringSimulator.ts
  src/ts/core/FunctionLibrary.ts:232-251                   (spring / springV)
  src/ts/core/CameraOperator.ts                            (orbit rig, followMode)
Useful system: framerate-independent critically-damped smoothing
Can code legally be reused?: Yes — MIT, attribution retained
```

`spring()` is nine lines:

```ts
let acceleration = dest - source;
acceleration /= mass;
velocity += acceleration;
velocity *= damping;
let position = source + velocity;
```

On its own that is an ordinary spring and it is **framerate-dependent** — the same tuning
behaves differently at 30 fps and 144 fps. `SimulatorBase.generateFrames()` is what makes it
correct: it accumulates real elapsed time, runs the spring at a fixed internal frame rate
however many times are needed, keeps the last two frames, and lerps between them by the
leftover offset. That is why Sketchbook's camera never jitters and never changes character
with framerate.

This is precisely the system our camera is missing, and it is about 120 lines across five
small files.

`CameraOperator` itself is a spherical orbit rig (theta/phi/radius around a target) with a
`followMode` and a free-fly mode. Its vehicle camera (`src/ts/vehicles/Vehicle.ts:196-278`)
just sets `target` to the vehicle position and `radius` to 3 — the framing is driven by the
player's mouse, with no automatic look-ahead. **So Sketchbook is the right reference for
damping and for the free-camera/orbit mode, but the wrong reference for an automatic train
chase camera.** That comes from racing-game.

---

### racing-game-main — the chase camera and the particles

```
Project:   pmndrs/racing-game
Licence:   MIT, Copyright 2021 pmdrs, contributors — LICENSE.md
Useful files:
  src/models/vehicle/Vehicle.tsx:81-113   (the entire chase-camera rig)
  src/effects/Dust.tsx                    (instanced dust puffs)
  src/effects/Skid.tsx                    (instanced ground decals)
  src/effects/Cameras.tsx                 (camera mode switching)
  src/store.ts:13,177                     (camera mode cycling)
Useful system: speed-reactive chase camera, instanced particle ring buffers
Can code legally be reused?: Yes — MIT
```

The important architectural insight is easy to miss: **the camera is a child of the chassis**,
so it inherits the vehicle's position and yaw for free. All the per-frame code does is lerp a
*local offset vector*:

```ts
v.set(
  (Math.sin(steeringValue) * speed) / 2.5,                         // lateral swing into turns
  1.25 + (engineValue / 1000) * -0.5,                              // dips under acceleration
  -5 - speed / 15 + (controls.brake ? 1 : 0),                      // pulls back with speed
)
defaultCamera.position.lerp(v, delta)                              // the lag
defaultCamera.rotation.z = lerp(defaultCamera.rotation.z, (-steeringValue * speed) / 40, delta)
```

Then a separate sway pass adds two sine waves to `rotation.z` and `rotation.x`, with amplitude
scaled by `speed / maxSpeed` — 2 normally, 8 while boosting. That sway is most of the "this
feels alive" quality, and it costs nothing.

Mapping onto a train: `steeringValue` becomes track curvature (we can read it from the route
tangent), `speed` becomes `worldSpeed`, boost has no analogue. Everything else transfers
directly.

`Dust.tsx` and `Skid.tsx` are both the same cheap pattern — a single `InstancedMesh` used as a
ring buffer, writing a matrix per emission and shrinking old instances by 0.005 per frame.
No shaders, no texture atlas, no particle library. Dust adapts to wheel/rail contact and to
brake dust on descents; Skid adapts to nothing on a train and should be dropped.

Note: these are React Three Fiber components. We would port the *algorithm and constants*
into plain three.js, not copy the JSX.

---

### triptrail-main — directly compatible with what we already run

```
Project:   TripTrail (Fangyuan Lin)
Licence:   MIT, Copyright (c) 2026 Fangyuan Lin — LICENSE
Useful files:
  app.js:491-520   setTrailReveal — line-progress gradient reveal
  app.js:905-935   pre-recording camera sweep that warms the tile cache
  app.js:938-1070  deterministic time-driven playback (bearingDeg, easeInOut, easeOutCubic)
Useful system: MapLibre route animation without any 3D engine
Can code legally be reused?: Yes — MIT
```

TripTrail is vanilla JS on MapLibre GL v5 with **no API key and no build step** — the same
stack we already run, so this is the lowest-friction reference of the ten.

Two things are worth taking:

1. **Trail reveal via `line-progress`.** Instead of rebuilding a GeoJSON line every frame, it
   sets a gradient stop that steps from the accent colour to transparent at the current
   progress: `['step', ['line-progress'], accent, p, 'rgba(0,0,0,0)']`. One paint-property
   update per frame, GPU-side. Our current track line is a static `ride-track` layer with no
   travelled/untravelled distinction.

2. **The pre-caching sweep.** Before recording, TripTrail jumps the camera along every leg of
   the route to force tiles into the browser cache, showing a "Caching map along route… n%"
   progress readout. This directly addresses a defect I hit while verifying the impostor
   sprites: teleporting the camera into the Karoo rendered flat brown ground because Esri
   imagery had not loaded. A warm-up sweep before the ride starts fixes that class of problem.

---

### deck.gl-master — the cleanest route to a real 3D train on our real map

```
Project:   vis.gl / deck.gl 9.4.0-beta.4
Licence:   MIT, Copyright Vis.gl contributors — LICENSE
Useful modules:
  modules/maplibre/src/overlay.ts            @deck.gl/maplibre — interleaved overlay
  modules/mesh-layers/src/scenegraph-layer   GLB positioned by lon/lat with orientation
  modules/geo-layers/src/trips-layer         animated trail with a fading tail
Useful system: geographic 3D object rendering inside an existing MapLibre map
Can code legally be reused?: Yes — MIT, but use it as an npm dependency, not copied source
```

This is the one reference that solves a problem we have already paid for twice.
`app/src/train-3d.ts` is a hand-written MapLibre `CustomLayerInterface` wrapping three.js and
GLTFLoader. `@deck.gl/maplibre` + `ScenegraphLayer` does that job properly: geographic
positioning, per-feature orientation, correct depth interleaving with the basemap and with
terrain, and LOD/culling handled for us.

Caveat worth stating plainly: adopting deck.gl adds roughly 400–600 KB gzipped to a bundle
that is already 1 MB, and it is a real dependency rather than a snippet. It earns that if we
want multiple 3D objects (train consist, landmark props, moving cameras) on the map. If the
train stays the only 3D object, keeping `train-3d.ts` is defensible.

---

### threex.proceduralcity-master — one idea, dead code

```
Project:   threex.proceduralcity (Jerome Etienne, after mrdoob)
Licence:   MIT, Copyright (c) 2011 Jerome Etienne — MIT-LICENSE.txt
Useful files: threex.proceduralcity.js:74-106  generateTextureCanvas()
Useful system: procedurally generated night-window texture
Can code legally be reused?: Legally yes; practically it does not run
```

The code uses `THREE.Geometry`, `THREE.CubeGeometry`, `faceVertexUvs`, `GeometryUtils.merge`
and `THREE.VertexColors` — all removed from three.js in r125 (2021). It cannot be dropped in.

The one idea worth keeping is the texture trick: paint a 32×64 canvas with randomly-lit 2×1
window rectangles, then upscale it to 512×1024 with `imageSmoothingEnabled = false` so the
windows stay crisp rather than blurring. Combined with a light-to-dark vertex colour ramp
(`#ffffff` at the top, `#303050` at the bottom) that is what sells a night skyline.

It is also the wrong approach for us at the city level: scattering 20,000 random boxes would
give us a generic city, and the plan explicitly forbids that. We already extrude **real OSM
building footprints** for Pretoria. The window texture is worth applying to those.

---

### cesium-certification-main — CesiumJS, and a keyed demo

```
Project:   cesium-certification — a vendored copy of CesiumJS 1.107.1 plus a small demo app
Licence:   Apache-2.0 (CesiumJS); MIT wrapper (LICENSE)
Useful files:
  apps/script.js          the demo — centred on South Africa, fromDegrees(25, -30, ...)
  packages/engine/source  the full CesiumJS engine
Useful system: SampledPositionProperty + VelocityOrientationProperty; CZML camera paths
Can code legally be reused?: Legally yes. Practically, no.
```

The demo requires three separate paid or keyed services — an ArcGIS developer key, a Cesium
Ion token, and a Google Maps Tile API key — all left as `"YOUR ... KEY"` placeholders. The
`apps/tour/` directory is Sandcastle's page-intro styling, not a camera tour; there is no
supplied cinematography here.

Cesium's genuinely good idea is `SampledPositionProperty` + `VelocityOrientationProperty`:
you give it timestamped positions and it derives orientation from the velocity vector
automatically. That is the correct model for a train, and we should reproduce the *concept*
in our own route sampler.

Adopting CesiumJS itself would mean replacing MapLibre — the basemap, the Imhof relief work,
the terrain, the vendored bundle, the offline pack. That is not a trade worth making three
weeks before a hackathon, and Cesium's good imagery needs an Ion token whereas our Esri
imagery is keyless.

**Recommendation: do not adopt Cesium. Borrow the sampled-position concept only.**

---

### earth-drive-main — right pattern, wrong data source

```
Project:   EarthDrive 3D (Vaibhav Rau)
Licence:   MIT, Copyright (c) 2026 Vaibhav Rau — LICENSE
Useful files:
  src/main.js:414-480   camera-mode matrix coordination and the Cesium bridge
  src/geo.js            latLonToMeters / metersToTile (Web Mercator helpers)
Useful system: keeping the vehicle at local origin and mapping a local ENU frame onto the globe
Can code legally be reused?: Yes, MIT — but its data source is not free
```

The architectural pattern is genuinely instructive. The car never moves in three.js space; it
sits at the origin. The camera offset is computed in a flat local frame, then
`Cesium.Transforms.eastNorthUpToFixedFrame` maps that local frame onto the globe at the car's
real lat/lon. That completely sidesteps floating-point precision loss at global scale, which
is the trap every "3D vehicle on a world map" project falls into.

Its chase camera is simple exponential smoothing, but with two details worth stealing:

- Shortest-angle heading interpolation: `diffAlpha = atan2(sin(diff), cos(diff))` before
  smoothing, so the camera never spins the long way round when the heading crosses ±180°.
- Auto-recentre after the user stops dragging (`RESET_DELAY_MS`), which lets the player look
  around without permanently losing the follow framing.

The blocker: `main.js:7-14` reads `VITE_CIAT` into `Cesium.Ion.defaultAccessToken` and loads
Ion asset `2275207` — Google Photorealistic 3D Tiles. That is a keyed, quota'd, billable
product, which conflicts with your free-and-keyless constraint. **I have not verified Google's
photorealistic-tile coverage over Pretoria; that should be checked before anyone counts on
it**, because coverage outside major Northern-Hemisphere metros is patchy.

---

### san_verde-main — cannot be used

```
Project:   San Verde (ryanfitzpatrickio)
Licence:   NONE — no LICENSE file, no licence field in package.json, no licence in README
Useful files (readable, not copyable):
  LOD-PLAN.md                     two-tier LOD design
  CityIdeas.md                    district/catalog design
  src/game/chunk-grid.js          world streaming
  src/game/skid-mark-system.js
  scripts/fetch-osm-roads.mjs     OSM road extraction
  scripts/optimize-web-assets.mjs Draco/meshopt pipeline
Can code legally be reused?: NO
```

With no licence declared, default copyright applies and we have no right to copy, adapt or
redistribute any of it. I have read the design documents — reading is fine, and ideas are not
copyrightable — but no code from this repository will be used.

There is a second, independent blocker: San Verde is **WebGPU-only and states it requires
Chrome or Edge**, with Firefox and Safari unsupported. For a hackathon demo on judges'
machines that is an unacceptable risk regardless of licensing.

Its LOD-PLAN.md does describe a sensible two-tier scheme (procedural boxes beyond 50 m, GLB
models nearer) that matches the plan's own "general city lightweight, landmark detailed"
hierarchy. We arrived at the same structure independently.

---

### cape-to-cairo-railway-kml-master — do not use this route data

```
Project:   cape-to-cairo-railway-kml
Licence:   NONE — no LICENSE file; README links a 2013 blog post
Useful files: capetocairorailway_001..006 (the South African segments)
Can code legally be reused?: No licence granted
```

Beyond the licence problem, this data is **worse than what the project already has**, and that
matters more:

| | Cape-to-Cairo KML | Our `route-ride.geojson` |
|---|---|---|
| Points, Kimberley→Johannesburg | ~167 | — |
| Average spacing | ~3 km | ~20 m |
| Total points, full corridor | ~1,700 | 76,536 |
| Provenance | hand-plotted in Google Maps, 2013 | OpenStreetMap rail geometry |

At 3 km spacing a train would cut straight across every curve — exactly the "jumping between
points" failure the plan's Phase 5 is designed to catch.

It also **does not contain Pretoria**. Segment 005 ends at Johannesburg and segment 006 runs
Johannesburg→Mafeking; there is no Johannesburg–Pretoria link. The vertical slice the plan
asks for is not in this dataset.

**Recommendation: keep `public/data/route-ride.geojson`. Use the KML only as a sanity
cross-check of the corridor's overall shape, if at all.**

---

### SA-Maps-master — marginal, and partly not downloaded

```
Project:   SA Maps (j-norwood-young)
Licence:   NONE declared
Contents:  administrative boundary shapefiles — provinces, districts, municipalities,
           wards, voting districts, schools, CSIR mesozones
Can code legally be reused?: No licence granted; underlying data is government census data
```

Two practical problems. First, **8 of the 45 geographic files are Git-LFS pointer stubs**, not
real data — `Districts/DistrictMunicipalities2011.shp` contains the literal text
`version https://git-lfs.github.com/spec/v1`. A `git lfs pull` would be needed.

Second, and more decisive: these are administrative boundaries. There is no railway geometry,
no building footprints, no terrain, no vegetation. Nothing here contributes to a train
journey. Province outlines might make a nice overview inset; that is the whole of it.

---

## What each reference will contribute, in one line

- **Sketchbook** → `SpringSimulator` + `SimulatorBase`, ported to TypeScript, becomes the
  damping primitive under every camera in the project.
- **racing-game** → the `TrainFollowCamera` offset rig, the speed-scaled sway, and the
  `Dust` instanced ring buffer reused for wheel/rail dust and steam.
- **TripTrail** → `line-progress` trail reveal, and the pre-ride tile-warming sweep.
- **deck.gl** → optional; `ScenegraphLayer` via `@deck.gl/maplibre` if we want to stop
  hand-maintaining `train-3d.ts`.
- **threex.proceduralcity** → the canvas window-texture trick applied to real OSM extrusions.
- **Cesium** → the sampled-position/derived-orientation concept, reimplemented, not imported.
- **earth-drive** → local-ENU-frame thinking and shortest-angle heading interpolation.
- **san_verde, cape-to-cairo, SA-Maps** → nothing. Licence, data quality, or both.

---

## Where this leaves the existing application

Worth being precise about what we already have, because several plan phases are partly done:

| Plan phase | Status in ShosholozaTrail today |
|---|---|
| 4. Real railway route | **Done.** 76,536 points, 1,578 km, OSM-derived, ~20 m spacing |
| 5. Object follows track with correct orientation | **Done.** `ride-model.ts` / `train-model.ts` |
| 6. Real train model | **Done.** Two Quaternius GLBs, CC0, 18-vehicle consist |
| 8. Train follow camera | **Not done as specified.** See below |
| 19. City environment | **Partly.** Real OSM extrusions + the impostor sprites shipped today |
| 20. Localised to South Africa | **Partly.** Real hub names, Imhof relief, SA hypsometric palette |

The camera is the real gap, and it is worth naming exactly. `app/src/train-camera.ts` is a
table of five **discrete shot presets** (`hero`, `static-trackside`, `curve-reveal`, …), each
with a `duration`, driven through `map.easeTo()` once per waypoint
(`Ride.tsx:227-231`). That is a slideshow of camera moves, not a camera. Each `easeTo` restarts
the previous one, there is no per-frame state, and nothing carries velocity across frames —
which is precisely why the result reads as "an overview animation of a train on a map" rather
than a game camera riding with the train.

Replacing that with a per-frame spring-damped follow camera, using Sketchbook's simulator and
racing-game's offset rig, is the highest-value single change available and is unblocked.

---

## What is blocked, and what I need from you

Blocked on assets that do not exist in the workspace:

- **Phase 11–12, cinematic camera playback.** No supplied camera path exists. I can build the
  `CinematicCamera` player and the keyframe format, but I will not author the keyframes
  myself — the plan forbids substituting my interpretation for your direction.
- **Phase 13–14, the first tourist attraction.** No Union Buildings asset exists in any form.

To unblock those, the smallest useful delivery would be:

1. One landmark asset — GLB, or a Gaussian splat (`.ply`/`.sog`/`.spz`), or photogrammetry
   output. Union Buildings, Voortrekker Monument or Freedom Park would all work for the
   Pretoria slice. Real-world metres, origin at base centre.
2. One camera path for it — a Blender/Spline GLTF camera animation, a SuperSplat keyframe
   export, a COLMAP `images.txt`, or simply a screen recording I can match keyframes against.

If neither is available before the hackathon, say so and I will propose a fallback that is
honest about being a fallback — most likely a cinematic built from the real OSM extrusion of
the building plus a hand-authored path, documented in `docs/deviations.md` exactly as
Phase 27 requires.

Not blocked, and ready to start on your word: the engine restructure (Phase 2), the spring
damping port, the `TrainFollowCamera`, the debug overlay and dev control panel, the tile
pre-caching sweep, and the dust effect.
