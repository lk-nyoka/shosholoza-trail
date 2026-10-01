# The train — build plan (merged and corrected)

**Supersedes the earlier train plan.** This merges a detailed external animation brief with
what is actually true of *this* repo. Read the corrections first — three of them will waste a
day if missed.

**Step 0, before anything:** you were cut off mid-Phase 4. Commit
`app/src/photo-parallax.ts`, `harness/capture-master-phase4.mjs`,
`tests/photo-depth-assets.test.js` and the `localized-scenes` edits as work-in-progress so
they are not lost. Then do the train. **Do not touch Pretoria or the other seven hubs until
the train passes acceptance.**

---

## Corrections to the incoming brief — read these first

**1. This is MapLibre, not Mapbox. `FreeCameraOptions` does not exist.**
The brief cites Mapbox's `free-camera-path` example. I verified earlier that
`getFreeCameraOptions` / `setFreeCameraOptions` are absent from the vendored bundle **and from
the `maplibre-gl` npm package entirely** — it is a Mapbox GL JS v2 API and MapLibre forked
before it. A dead branch on this already existed in `Ride.tsx` and was removed. Do not
reintroduce it. Camera control is `jumpTo` / `easeTo` with `center`, `zoom`, `pitch`,
`bearing`, plus terrain exaggeration. The MapLibre three.js examples are correct and usable;
the Mapbox ones are not.

**2. The livery is whole-coach alternating, not tri-banded per coach.**
The brief describes each coach as turquoise upper / purple lower / yellow sweep. The
photograph you already ship — `public/assets/photos/hero-train.webp`, a real Shosholoza Meyl on
the Highveld — shows something different and more distinctive: **whole coaches in single
colours, alternating turquoise → yellow → violet down the rake**, with lilac-violet locomotives,
light grey roofs and charcoal underframes. **Sample from that photograph. It is the ground
truth, it is licensed, and it is already in the repo.**

| Element | Hex |
|---|---|
| Turquoise coach | `#2FA8C6` |
| Yellow coach | `#EBB937` |
| Violet coach | `#7E63A8` |
| Locomotive body | `#8B76B8` |
| Underframe / bogies | `#3A3F45` |
| Roof | `#A9AFB5` |
| Window band, day | `#1D2A33` |
| Window band, night lit | `#F6D9A0` |

**3. Stage it. Do not start with a GLB pipeline.**
The brief says delete the red object and replace it with a rigged `.glb` with separate bogies,
wheelsets, pantograph and door clips, plus Draco/Meshopt/KTX2 and three LODs. That is days of
3D work and it never says where the model comes from. Build **Stage 1** first — it ships
today, needs no new dependency, works with terrain, and de-risks everything. Then **Stage 2**.

The brief's mechanics are excellent and are adopted below almost wholesale. It is only the
*ordering* and the *asset assumption* that are wrong.

**Asset source for Stage 2, since the brief omits it:**
[Quaternius Modular Train Pack](https://poly.pizza/bundle/Modular-Train-Pack-jYEybkFVr1) — 11
models, GLB, **CC0, commercial use, no attribution required**. Modular means separate
locomotive and coach pieces, which is exactly what a consist needs. Retexture to the livery
above. A generic model in the right colours beats a perfect model in the wrong ones.

---

# Stage 1 — The articulated extrusion rake (do this now)

Replace `ride-world.ts:83` — currently one red box, `fill-extrusion-color: '#9f302c'`,
height 5.2 m.

## The one idea that matters: a train does not bend

On a curve each vehicle is a straight **chord** across the arc. Those visible kinks between
coaches are what make a rake read as a train instead of a coloured snake.

The brief improves on a single-tangent chord, and this is the version to build: **orient each
vehicle from its two bogies.**

```
for vehicle i at head chainage s:
  centre      = s - i * (LENGTH + GAP)
  frontBogie  = sampleRoute(centre + BOGIE_SPACING / 2)
  rearBogie   = sampleRoute(centre - BOGIE_SPACING / 2)
  heading     = bearing(rearBogie, frontBogie)
  footprint   = rectangle centred between the bogies, ±HALF_WIDTH perpendicular to heading
```

Never sample the curve along a vehicle's sides. That is what produces the worm.

## Real Cape-gauge dimensions (1 067 mm)

| Constant | Value |
|---|---|
| `COACH_LENGTH` | 22 m |
| `LOCO_LENGTH` | 19 m |
| `GAP` | 1.2 m |
| `BOGIE_SPACING` | 15.5 m |
| `HALF_WIDTH` | 1.52 m |
| `COACH_HEIGHT` | 4.0 m |
| `LOCO_HEIGHT` | 4.2 m |
| Rake | 2 locos + 16 coaches ≈ **393 m** |

## Three layers, not one — this is what turns a box into a vehicle

1. `ride-train-underframe` — base 0.0, height 1.1, `#3A3F45`
2. `ride-train-body` — base 1.1, height 3.4, livery via `['match', ['get','livery'], ...]`
3. `ride-train-roof` — base 3.4, height 4.0, `#A9AFB5`, footprint inset ~0.25 m

Emit one GeoJSON `FeatureCollection`, one polygon per vehicle, with a `livery` property.
Rebuild it every frame from head chainage and `setData` — cheap for 18 polygons.

## Kinematics — adopt these from the brief, they are all correct

**Chainage is the master variable.** Never `train.x += speed`. Position is
`routeChainageMetres`, sampled against the real GeoJSON.

**Coupler take-up.** The locomotive starts; each coach follows a few centimetres later —
loco t=0, coach 1 +70 ms, coach 2 +140 ms, and so on. The user will not consciously see it.
They will feel weight. This is the single best detail in the incoming brief.

**Motion state machine.** Build only the departure side for now:
`idle → departure-prep → creep → accelerating → cruising`. Creep at 2→5→8 km/h before
acceleration. Use a smoothstep / jerk-limited S-curve, never linear — people are extremely
sensitive to instant acceleration.

**Separate `worldSpeed` from `presentationTimeScale`.** At 16×, geographic progress advances
fast, but departure and arrival animations keep sensible minimum durations (cap them at ~2×).
Otherwise 16× turns the train into a teleporting toy. **This is the most important structural
point in the brief — implement it before the speed buttons touch anything.**

**Wheels from distance, not frames.** Even in Stage 1 with no visible wheels, keep
`wheelAngle += deltaDistance / wheelRadius` in the model so Stage 2 inherits it. Stop means
stop; reverse means reverse; scrubbing stays consistent.

**Smoothed rail elevation profile — do not use raw DEM.** Precompute
`route points → terrain elevation → median/spline smoothing → rail profile`, and derive pitch
from a point ahead and behind, low-pass filtered. Raw Mapzen DEM noise will make the train nod
constantly and look like a car on a field. Railways are engineered; the profile must look it.

**Suspension: barely perceptible.** Vertical `sin(d * fA) * 0.015 m`, lateral
`sin(d * fB) * 0.02 m`, roll clamped to ±1.2°. Disable entirely under
`prefers-reduced-motion`.

## Two cheap details worth more than any model

**Lit windows at night.** When `skyPeriod` is dusk or night, darken the body and add a thin
emissive band in `#F6D9A0`. **Vary which windows are lit, randomised once per journey, not
every frame** — uniform lighting screams CGI. A purple-and-gold train with lit windows crossing
the dark Karoo is the best frame this project can produce.

**Pantograph.** A 0.15 m thin extrusion above each locomotive roof reaching ~5.4 m.
Unmistakably electric, unmistakably this line.

**No steam. Ever.** These are electric locomotives on 3 kV DC. Generic smoke would destroy the
localisation.

## Scaling so it stays visible

Real scale makes a 393 m train invisible at overview zoom. Scale **semantically**, never move
it off the rails: 1.0 close, 1.15–1.35 mid, 1.5–1.8 max at distance, smoothly interpolated,
with a hard apparent-size cap. Beyond that, switch to a simplified silhouette plus a small
glow rather than growing further. Label the exaggeration in the UI, as with the other
presentation compressions.

---

# Stage 2 — GLB consist (only after Stage 1 passes)

Use MapLibre's own
[three.js on terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
or [ThreeLibre](https://github.com/piemonSong/threelibre). Load the Quaternius pack, retexture
to the livery, and keep the same chainage/bogie solver — the geometry layer changes, the
kinematics do not.

Then add what only a model can give: independently rotating bogies (each following the tangent
at its *own* chainage), visible wheelsets, headlights as emissive material even in daylight,
and a locomotive with an actual face — front windows, yellow pilot area, couplers, grilles.

**Perf budget, revised down from the brief.** It proposes 100–180k triangles for the close LOD.
You are already rendering satellite raster + terrain DEM + OpenFreeMap vector + 3D buildings.
On a mid-range Android that budget will drop frames. Target **≤60k close, ≤25k journey,
≤8k far**, one shared 2048² atlas, Draco or Meshopt compression, KTX2 textures. Measure on a
throttled profile before raising it.

Skip door and pantograph animation clips for now — asset complexity for a detail nobody sees
at ride distance.

---

## Camera — the brief is right, with one correction

Do not weld the camera to the train. Spring/damp toward a desired pose so the camera feels like
it has mass. Frame with **lead space**: about 55–60% of the frame ahead of the locomotive, not
centred.

Build a small camera director with named shots — `hero`, `static-trackside`, `side-track`,
`curve-reveal`, `aerial-exit`, `manual` — each defining distance behind, lateral offset,
height, look-ahead, pitch bias and transition duration. Keep it out of React components.

**Correction:** implement all of it with `easeTo`/`jumpTo`. There is no free camera in
MapLibre.

The five Pretoria shots in the brief (hero idle → first movement against a static camera →
side tracking as the coloured coaches pass → curve reveal showing articulation → aerial exit
handing back to the journey) are a good sequence. Build them **after** Stage 1 passes, as the
opening of Task B.

---

## Acceptance — the train alone, before Pretoria

Capture `evidence/train-hero-pretoria.png`, `evidence/train-curve-articulation.png`,
`evidence/train-night-karoo.png`, and place them beside `hero-train.webp`.

1. It reads as a **South African long-distance passenger train**, not a map marker.
2. The rake is visibly many vehicles; colours cycle turquoise / yellow / violet and match the photograph.
3. On a curve the vehicles **articulate as chords** — visible kinks between coaches.
4. Departure is gradual: idle → creep → S-curve acceleration. The locomotive leads; coaches follow with slack.
5. Wheel angle derives from distance (verify by scrubbing backwards).
6. The body barely sways. No bouncing, and none at all under reduced motion.
7. The train does not clip through terrain, and does not nod on DEM noise.
8. At overview zoom it stays visible without becoming enormous.
9. 1× / 4× / 16× all look controlled — departure never collapses to a fraction of a second.
10. At night, windows are lit and **not uniformly**.
11. Route GeoJSON and all measurements are unchanged.
12. **It looks good in a screenshot with every UI panel hidden.**

**A single-coloured box, at any length, fails. So does a rake that bends like a snake.**

Then stop and report. Pretoria comes next, and it will be far easier with a convincing subject
to build the landmarks and camera reveals around.

---

## Gates

```
npm test && npm run check && npm run check:app && npm run security:scan
npx vite build && node scripts/build-assets.mjs
```

## Sources

- `public/assets/photos/hero-train.webp` — livery ground truth, licensed, already shipped
- [Quaternius Modular Train Pack](https://poly.pizza/bundle/Modular-Train-Pack-jYEybkFVr1) — CC0 GLB
- [MapLibre — three.js on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/) · [three.js model example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/) · [ThreeLibre](https://github.com/piemonSong/threelibre)
- [three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) · [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) · [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)
- [three.js — object following a path](https://discourse.threejs.org/t/how-can-i-make-a-3d-object-follow-a-predetermined-path-rotate-as-if-its-on-a-train-track/74513)
- [Shosholoza Meyl](https://en.wikipedia.org/wiki/Shosholoza_Meyl) · [Class 18E Series 1](https://en.wikipedia.org/wiki/South_African_Class_18E,_Series_1) — 3 kV DC sections use class 6E1/18E; diesel on non-electrified Bloemfontein–Noupoort and Bloemfontein–Kimberley
- [Bogie](https://en.wikipedia.org/wiki/Bogie) · [Kenney](https://kenney.nl/) · [awesome-cc0](https://github.com/madjin/awesome-cc0)
