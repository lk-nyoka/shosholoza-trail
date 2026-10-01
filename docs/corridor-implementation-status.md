# Graphics and corridor implementation — 21 September 2026

## Implemented locally

- Pretoria terrain cutting with local mesh refinement and a raycast clearance regression test. The old ground no longer covers the rails in the sampled 6 km view.
- A trackside opening camera that shows the train instead of the station roof. This is a preset correction, not general camera collision avoidance.
- A shared 18-vehicle asset/spacing contract across Pretoria, Johannesburg and the corridor preview. Source model proportions are retained; separate wheelsets use the correct lateral axle axis. Pretoria bodies now pitch with the rail profile.
- Clustered jacaranda crowns and branches; a less yellow, less intense Pretoria daylight balance.
- Johannesburg's concourse viewpoint, two-sided readable signs and a lower-peak-speed arrival profile.
- Reproducible extraction of `route-gauteng.geojson` from the existing detailed OSM candidate: 3,694 coordinates, 69,537.09 m, projected endpoint 4.96 m from the Park Station anchor. The inherited rail-alignment flag concerns mapped geometry, not operational service verification.
- Corrected full-route length metadata incorrectly inherited by the short Pretoria animation slice.
- `/corridor`: a continuous geographic 3D preview, the same train along the route, existing city models at both ends, four bounded track chunks, overhead equipment, illustrative vegetation, seeking, pause and presentation speeds. Rendering rebases around the train. No external requests are needed by this 3D view.
- Map/3D switching preserves route distance. The separate map uses the extracted route and existing map provider controls. Links connect the corridor to the existing city studies.

## Checks

- 197 automated tests passed, including train proportions/gaps, arrival distance-versus-speed and terrain clearance. After reducing terrain subdivision cost, the four directly affected tests passed again.
- App TypeScript check and Vite production build passed. Existing missing `/theme.css` and large-bundle warnings remain.
- Browser checks passed for travel, pause, seek, bounded chunks, map/3D distance handoff, mobile overflow and city navigation; no captured page errors. The 3D corridor made zero external asset/tile requests in that check.
- Evidence: `evidence/corridor/` and `evidence/geometry-fixes/`. Browser captures are visual checks, not phone performance measurements or proof of every rail/vehicle clearance.

## Still outstanding from the full plan

This is the first connected preview, not completion of the graphics plan. Intermediate terrain is flat and explicitly labelled; it needs sourced elevation, landuse and structure classification. The corridor embeds the authored city models, not every feature and cinematic from their standalone pages. Johannesburg's straight yard has only an approximate tangent alignment and still needs reconciliation with the curved geographic approach. Full camera collision handling, geographic station/landmark orientation review, a reference-correct locomotive, true bogie steering, bridge/tunnel elevation handling, corridor audio, measured phone performance, offline download lifecycle and a full continuous-trip acceptance run remain.

Local preview: `http://127.0.0.1:8791/corridor`. No deployment was performed in this batch.

## Follow-up: connected station and audio

- The connected station now splits long platforms, canopies and secondary tracks into sections following the geographic railway. Its duplicate straight centre track is omitted. This corrects the competing track layouts; it does not make the authored station a surveyed reconstruction. Standalone Johannesburg retains its original local coordinate layout.
- Added the supplied local train audio through `TrainSound`, with explicit sound controls, physical speed rather than presentation multiplier, station/open environment selection, pause suspension and disposal on map switching. Browser verification confirms audio initialisation and control operation; human listening remains outstanding.
- Manual orbit now persists until **Follow train** is selected.
- Reused the local Pretoria building footprints in the connected departure area, excluding near-track sheds around the authored station. Intermediate buildings/elevations remain unimplemented; the local snapshots do not provide corridor-wide coverage.
- Fixed `build-assets.mjs` to copy the corridor route after clearing generated data. A full asset rebuild now retains it and includes it in the pack manifest.
- App typecheck/build passed. Four focused station/consist/motion tests passed, including a new curved-platform regression. The corridor browser suite passed after restoring the preview server and fixing the missing route copy; controls, audio initialisation, map handoff and mobile layout passed with no page errors. Updated screenshots are in `evidence/corridor/`.

The earlier outstanding-work paragraph describes the first batch: corridor audio and basic curved station-track reconciliation are now implemented as described above. Full station scenery alignment, sourced intermediate terrain, performance measurements and offline download acceptance remain outstanding.

## Follow-up: journey continuity and arrival

- Follow camera heading changes now use frame-time-based damping; seeks reset the camera and reduced-motion mode avoids the interpolation.
- Added departure/travel/approach/arrival phases and physical speed readout. Scene reports keep the play button consistent when motion ends or reduced-motion preferences change.
- Added a Park Station arrival panel with city exploration and restart actions, checked at desktop and 390 px width.
- Saved position and presentation speed survive reloads; playback and sound always start inactive. URL `?position=` overrides saved distance, and **Share position** copies a deep link with a visible fallback if clipboard access is unavailable.
- Three progress-state tests passed, including malformed/blocked storage and phase boundaries. The expanded browser suite passed audio controls, arrival, map switching, mobile layout and paused resume at 18 km.
- Vite production build passed. Full app typecheck currently reports TS2722 at `app/src/kimberley/KimberleyThreeAdapters.ts:525`, in parallel work outside these corridor edits; that file was left untouched. Generated build output includes that parallel work and is not part of this source-only follow-up commit.

## Follow-up: rendering and loading lifecycle

- Rendering is now demand-driven: travel, camera changes, seeking and resizing schedule frames; a settled paused scene stops scheduling frames. Hidden tabs cancel scheduled work and suspend audio until visible again.
- Model loading settles all requests and releases successful model allocations when another request fails or the view was cancelled. The React wrapper retains the original container and ignores stale callbacks when switching views during dynamic import/loading.
- `scripts/check-corridor-lifecycle.mjs` passed on the local production build: stable frame counter while paused, repaint after seek, active travel rendering, recovery from an aborted model request, and map switching during delayed model download followed by successful return to 3D. No page errors were captured.
- Production build passed. The same separate Kimberley TS2722 error remains in the full app typecheck; no corridor type errors were reported. This source-only change remains local and is not deployed.
