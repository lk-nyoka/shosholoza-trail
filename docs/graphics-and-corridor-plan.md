# Pretoria and Johannesburg: graphics audit and connection plan

Date: 21 September 2026. Scope: inspection and implementation plan, not an implemented connection.

## Evidence and limits

Inspected the deployed `/animation` and `/johannesburg.html` scenes with Chromium at 1280 × 900, reduced motion enabled for repeatable viewpoints. Captured Pretoria at 0, 2,800 and 6,000 metres; Johannesburg's four camera presets and its arrived train at sequence time 24 in daylight and dusk. Read the local geometry, terrain, train and station-motion implementations. Captures and renderer counters are in `evidence/geometry-audit/`; repeat with `scripts/capture-geometry-audit.mjs` and `scripts/capture-geometry-arrival.mjs`.

These are sampled views, not an exhaustive survey of every camera, landmark or device. Reduced-motion captures do not establish frame rate or motion quality. Renderer counters are frame-specific, not whole-scene asset totals. No phone performance or geographic survey certification is claimed. No application code or deployment was changed for this audit.

## What is wrong now

| Priority | Finding and evidence | Correction |
| --- | --- | --- |
| P0 | Pretoria's initial side camera is dominated by the station canopy; the train is hidden. See `pretoria-0.png`. | Author a clear departure viewpoint, then constrain the follow rig against canopy, building and terrain occlusion. Test its whole transition, not only its final pose. |
| P0 | At 6,000 m the lower train and track disappear into the terrain. At 2,800 m lower vehicle detail is also obscured. See `pretoria-6000.png` and `pretoria-2800.png`. | Carve the ground mesh along the engineered rail formation. `Terrain.buildFormation()` currently adds side faces but does not lower the existing ground surface through a cutting. Adding walls cannot uncover buried rails. |
| P0 | Pretoria uses a nonuniformly scaled model and 18 vehicles; Johannesburg uniformly scales its models and uses 10. A through journey would visibly change train proportions and consist. | One shared vehicle specification and asset-normalisation pipeline, used in both cities. Preserve intentional coach/loco dimensions and wheel geometry. Do not stretch the whole source mesh to solve a length discrepancy. |
| P0 | Pretoria's `updateTrain()` applies yaw only, even though front/rear samples have different elevations. Every vehicle uses the same ±7.75 m sample spacing. | Define bogie locations per vehicle. Derive body pitch and yaw from their rail contacts, while keeping rigid bodies and separate bogie orientation. Verify contact using the actual asset, rather than assuming the source model has matching axle positions. |
| P1 | The supplied locomotive reads as a streamlined generic train, not the reference South African electric. Recolouring has not changed that silhouette. | Keep the existing asset as interim/far detail. Use local licensed references to correct the cab, roof equipment, underframe and window proportions in the near model. Preserve electric traction; no smoke. |
| P1 | Pretoria's purple trees read as balls on poles; terrain is pale, uniform and sparsely dressed. Several foreground trees overwhelm the train. | Improve a small near-camera jacaranda set with branching and clustered crowns; keep cheap distant versions. Add seeded size/shape variation, placement exclusions and restrained terrain material variation. |
| P1 | Johannesburg has a legible station, but towers repeat facades and sit in a very regular authored grid. The scene ends visibly beyond the station. | Retain useful existing building generators; replace selected footprints/orientations from local sourced data, diversify rooflines and podiums, and extend a low-detail background. Do not pretend the authored grid is surveyed Johannesburg. |
| P1 | Johannesburg's concourse preset gives much of the frame to a blank parapet and dark roof. Platform views are also heavily canopy-dominated. | Place cameras at meaningful standing eye heights above their walking surfaces, aim through usable openings, and account for overlays when composing the shot. Avoid changing architecture solely to rescue one camera. |
| P1 | Day lighting washes out Pretoria. Johannesburg dusk lights produce strong isolated highlights on the train while some vehicle detail remains dark. | Share exposure, tone mapping and material calibration. Tune sun/sky balance, shadow range and roughness first; then local station lights. Check daylight and dusk against identical viewpoints. |
| P1 | Johannesburg arrival moves 340 m in 24 s; `StationMotion.ts` starts at 42.5 m/s (153 km/h) in the station approach. | Replace this demo curve with distance-based motion and a believable deceleration envelope. Keep simulation speed separate from presentation compression and audio speed. This is an authored motion defect, not a claim about real operating speed limits. |
| P2 | Johannesburg signage uses double-sided text planes, allowing mirrored text on their reverse. | Use two correctly oriented faces, reusing the Pretoria signage solution. Check both platform directions. |

The terrain diagnosis is supported by both the capture and source structure. Other contact issues still need a geometry-debug pass: wheel contact, platform gap along every coach, roof/catenary clearance, coupler travel and stair landings. Do not report these as all passing merely because one screenshot looks plausible.

## What should be retained

Keep the geographic route sampler, local terrain inputs, existing city generators, loaded GLB assets, instancing, audio controller, camera director, journey controls and offline asset strategy. Johannesburg's layered platforms, station furniture, stairs and facade variety are useful foundations. Pretoria's geographic landmark placement is useful, but landmarks rotated to face the railway remain authored presentations rather than verified architectural bearings.

Keep the satellite map and the animated world separate. Both can share position and route data; the animated world must not request live satellite tiles to render its surroundings. Photographs remain reference/story material, not replacements for the 3D environment.

## Graphics implementation order

### 1. Establish physical coherence

Add a development-only geometry overlay: rail centreline, railhead height, front/rear bogie contacts, vehicle bounds, platform edges and terrain cross-sections. Capture the current defects before changing them.

Carve a continuous track corridor into the terrain with a formation floor, shoulders and blended cut/fill slopes. Make ground queries and the rendered mesh use the same modified surface. A coarse terrain grid alone may not resolve a narrow railway: locally refine the corridor or use a dedicated corridor mesh with a matching hole in the base terrain. Retain bridge and tunnel classifications separately; do not flatten ground up to bridge decks. Reconcile landmark pads and the railway corridor before rebuilding dependent vegetation and roads.

Unify train dimensions, wheel contacts and orientation. Check an entire rake on curves and grades, including negative chainage behind the departure locomotive. Use per-car rigid transforms; never bend a coach mesh around the curve. Resolve platform, canopy and overhead-wire clearance with the normalised models before adding more detail.

Acceptance: visible continuous rails at 0/2.8/6 km; no terrain crossing the vehicle clearance envelope; debug wheel contacts lie on railheads within a documented modelling tolerance; no platform penetration; no body stretch or sudden heading flips through sampled bends/grades.

### 2. Fix composition and geographic arrangement

Repair departure, platform and concourse presets. Add camera collision/occlusion avoidance without abrupt jumps. Compare window, follow and city-tour views. Keep one camera director responsible for transitions.

Audit local building, road and landmark anchors against the available geometry. Explicitly record measured coordinates, estimated heights, authored bearings and presentation-only changes. Reposition scene dressing with exclusion masks for rail, roads, platforms, stairs and buildings. Add a debug view of masks so random placement cannot silently introduce collisions.

Acceptance: train readable from the opening frame; complete transitions remain outside solid geometry; roads do not cross buildings; local landmark scale and orientation have recorded evidence or an explicit approximation label.

### 3. Improve visual identity, then detail

Correct the near locomotive silhouette. Upgrade a small set of foreground trees, station materials and facade modules using existing local references/assets. Prioritise ballast, sleepers, kerbs, platform edges, underframes and entrances: these establish scale more effectively than adding many distant towers. Use consistent metre-based texture scale, restrained roughness/normal detail and shared material palettes.

Calibrate daylight and dusk with contact shadows, readable roof undersides and distinct vegetation/terrain colours. Add distant city silhouettes and blended terrain edges. Keep each city recognisable through landmark form, skyline and vegetation; do not rely on captions.

Acceptance: side-by-side fixed camera captures show better contact, depth and material separation; train reference comparison passes silhouette/livery review; both cities remain distinguishable with labels hidden.

### 4. Profile before expanding the world

Observed frames: Pretoria approximately 480k–516k rendered triangles and 144–227 calls; Johannesburg sampled presets approximately 171k–213k triangles and 58–182 calls before the arrival capture. These are diagnostic counters, not FPS results or fixed budgets.

Measure frame-time percentiles, memory, load time and draw calls on agreed desktop and phone targets. Start with a provisional 30 FPS phone / 60 FPS desktop goal, then adjust based on measurements. Use distance-based geometry detail, instanced repeated assets, bounded shadow coverage and texture budgets. Avoid adding expensive screen effects until physical/material fixes have been reviewed.

Acceptance: sustained travel and repeated city transitions meet the chosen frame-time/memory budgets; unloaded chunks release resources; cached animation assets work without external tile requests. Do not claim offline success before testing a completed download with the network disabled.

## Connecting Pretoria to Johannesburg

### Existing data: reuse it

Local `data/route-animation.geojson` contains 354 points spanning approximately 6.536 km. Its inherited `lengthMetres` still describes the full route (1,582 km), so sliced route metadata must be corrected before using it for progress or UI.

Local `data/route-ride.geojson` contains 76,536 points for the full candidate corridor. Its nearest vertex to the stored Park Station anchor is index 3,693 at `[28.0422, -26.19764]`, approximately 69.547 km along the route and 11.0 m from the anchor `[28.0423048, -26.1976708]`. Measurements here use an equirectangular segment-distance calculation; production extraction should use the shared geodesic chainage implementation and nearest-segment projection.

This is an OSM graph shortest-path candidate with human operational-route review pending, as the file itself states. It is useful geometry, not proof of a current passenger itinerary. `data/provenance/rail-alignment.json` records the source snapshots and filtering. Preserve its attribution and provenance. The simplified `route.geojson` should not drive close-up wheels or station alignment.

### C1. Extract and validate the corridor

Extract Pretoria to the projected Park Station rail location from the detailed candidate. Regenerate route bounds, length, endpoint IDs, elevation references and source metadata. Check connected segments, implausible jumps, duplicates, turnbacks, crossings versus connected junctions, and route direction. Review railway type/gauge using the existing snapshots before treating the selected path as the current train's corridor. Do not substitute Gautrain geometry merely because it links the same cities.

Render the extracted candidate as an overlay on the existing map for inspection, with route provenance and an approximation notice. This is the first small, reviewable connection deliverable; it does not require rebuilding either city.

### C2. Use one route and coordinate contract

Introduce a shared corridor representation with geographic coordinates, cumulative distance, tangent, engineered elevation and source status. Use an explicit geographic-to-local transform per world chunk, with a common vertical datum. Rebase the render origin as needed to avoid precision issues. Do not stretch Pretoria's current flat projection across the whole corridor without evaluating its error.

Pretoria already samples geographic rail positions. Johannesburg is currently a straight X-axis stage with a single geographic anchor, so its anchor alone is insufficient. Derive the station's world rotation from the chosen rail approach tangent, then reconcile platform/track geometry with the actual approach. A rigid transform can retain the authored station as an acknowledged approximation; it cannot make a straight yard conform to a curved alignment. Adjust those track/platform sections deliberately.

Acceptance: endpoints and shared boundaries agree within a documented tolerance; heading and height remain continuous; the map marker and train represent the same chainage.

### C3. Build the intervening world in chunks

Start with streamed terrain, the rail formation, overhead equipment and sparse surroundings along the extracted route. Use local landuse, road, building and elevation inputs where available; record missing data instead of inventing mapped attractions. Add a few distinctive intermediate areas only after their positions and source material are checked.

Use an initial 1–2 km chunk size as a profiling hypothesis, not a fixed requirement. Keep nearby chunks detailed, forward chunks prefetched and distant land simplified. Retain enough geometry behind the camera for the entire rake and reverse-looking views. Share chunk boundaries to avoid cracks, duplicate assets and rail seams. Make offline corridor download explicit and show its measured size.

### C4. Carry the same train and journey state through

Move both city scenes under the existing journey shell, with lazy-loaded city content. Retain the current standalone Johannesburg entry as a compatible entry point. One controller owns train distance, speed, play/pause, camera mode, lighting, audio and saved progress. Cities contribute scenery and events, not competing animation clocks.

Replace Johannesburg's X-only arrival curve with shared route sampling. Preserve consist, livery and camera identity across boundaries. Crossfade ambient environments while rail rhythm follows physical speed. Base events on chainage crossings with seek/replay rules, not elapsed wall time. Fast travel may skip distance explicitly, but should not accelerate station departure/arrival into a visual teleport.

### C5. Connect the map experience

Display the same extracted corridor on the satellite/map side, with start/end stations, actual progress and source status. Switching to animation transfers chainage and heading; switching back restores geographic position. Loading or failing a map provider must not stop the 3D animation. Preserve a cached route outline for offline navigation, while clearly distinguishing unavailable online imagery.

### C6. Verify the complete trip

Test departure, travel beyond Pretoria's existing 6.5 km, chunk transitions, Johannesburg approach, dwell and return/seek. Check coach continuity, gradients, route seams, audio continuity, camera ownership and memory disposal. Cover reduced motion, manual pause, resumed sessions, missing assets, phone layout and downloaded-offline travel. Capture a continuous departure-to-arrival run with performance measurements; screenshots alone cannot establish a successful connected journey.

## Recommended first delivery

Fix Pretoria's terrain/rail intersection and opening camera, establish the shared train contract, then extract and show the candidate corridor on the map. Next, implement a minimal continuous journey through simple streamed surroundings into the existing Johannesburg stage. Improve near-camera assets and intermediate areas on that working foundation. This order makes the experience physically coherent before spending effort on scenery that may otherwise need repositioning.
