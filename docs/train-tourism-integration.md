# Integration of the supplied train-tourism application

Reviewed locally on 21 September 2026: README, camera rigs/director, event-driven tourism systems, UI, data contracts and checkpoint documentation. The standalone application is React 18 / R3F 8 / Three 0.166; the host uses React 19 / Three 0.185 and an imperative scene. Importing its whole dependency stack would create a second rendering/state system.

The reference README explicitly says its centreline is approximated and unvalidated, its terrain analytic, and its assets partly placeholders. These do not replace the host's validated corridor, local terrain, OSM footprints or existing trains. Its independent standalone build was not validated in this integration.

## First implemented feature: passenger window

Adapted `train-tourism/app/src/engine/cameras/WindowCamera.ts` into `PassengerWindow.ts`. Vehicle-local camera placement, bounded yaw/pitch, left/right selection and 62-degree field of view are retained. The reference assumes +Z forward; host vehicles face +X. Host coaches lack interiors, so the camera sits just outside their 3.04 m exterior shell, explicitly described as an exterior window viewpoint in the UI. Head movement remains outward-facing to avoid looking into an unmodelled interior.

The adapter returns a pose rather than writing the camera. RailScene remains responsible for camera ownership, and existing landmark sequences/returns target the selected window pose. Orbit controls are disabled in window view; pointer drag controls the head, and scene disposal removes those handlers. Audio receives the already-supported WINDOW mode and distance to the passenger coach.

Open `/animation`, select Window view, switch Left/Right window, drag on the scene and start the journey. The camera follows the actual coach through bends. Landmark sequences still take over and return. Returning to Alongside/Behind/Wide restores orbit and normal field of view. Reduced motion allows stationary inspection with the route slider.

## Reuse backlog

The reference's event-driven passport, recap and saved-trip patterns can be integrated into existing tourism state later. Source content and passport claims must be reconciled with actual completed actions and existing sourced places. Do not copy unsourced placeholder stories or move the current corridor to the reference's different centreline. Screen-space POIs should use the host's existing OSM place coordinates, with culling and label limits.

No satellite requests or new dependencies were added. Production deployment is unchanged.

## Saved places integration

The reference TripPlanner's local saved-place pattern is now available in the animation via SavedAnimationPlaces and SavedPlaces. It consumes the existing passing-place callback, retains OSM coordinates, and supports save/remove/reload and external location-map links. It does not issue passport stamps, claim physical visits, or import the reference's placeholder stories. Stored data is bounded and validated; denied storage keeps the list in session memory.

Validation: passenger-window browser checks passed for both sides, FOV and orbit restoration without page errors; all 179 tests passed before saved places, followed by three passing saved-place tests. The saved-place browser harness covers persistence and removal. Camera captures exposed mirrored station signage; double-sided text now uses two outward-facing planes.

## Window place discovery

Adapted the reference PoiLabels projection into WindowPlaces using the host's existing OSM coordinates and terrain projection. At most three non-overlapping labels appear in window mode; behind-camera, off-screen and distant candidates are culled. Title and lower controls retain reserved screen space. Labels indicate mapped locations, not visibility through buildings: building occlusion is not yet modelled. Selecting a label opens the existing saved-place panel; Follow passing places restores the live passing selection. Disposal removes the label layer.

Validation: 184 tests pass, app typecheck and build pass. Projection tests check forward/behind-camera visibility, range and exact projected placement.

## Visibility and mobile follow-up

Window labels now test rays against the local station and OSM building meshes at most four times per second. This is building occlusion only, not terrain or vegetation visibility. Label rectangles avoid actual title/control/saved-place/station panels. Users can switch labels off. Controls wrap on narrow screens; the station invitation becomes a compact button in window view; the duplicate passing card is hidden there to avoid covering the title.

A 390x844 reduced-motion browser check passed window-side controls, label toggling and horizontal overflow with zero page errors. This is browser emulation, not a physical-phone performance pass. The geometry test confirms an intervening building hides a marker while one beyond its anchor does not.

## Accessible discovery and camera control

After building occlusion was enabled, the station could legitimately expose no labels from either window. Saved places now includes all mapped Places along this route, supplied by the same loaded scene data rather than a second fetch. Selecting an entry makes it available to save even when its label is hidden. This is browsing, not an assertion that the location is currently visible or visited.

The scene canvas is keyboard-focusable. In window mode arrow keys adjust the bounded head angle and Home resets it. Keys do not intercept cinematic or station camera control. The keyboard listener is removed on disposal.

## Hosted verification and itinerary export

The combined release was deployed as Cloudflare version 90229fd8-74b2-49fa-8324-4f9188e14a3e. Hosted desktop/mobile city navigation and keyboard window/station-return checks passed. Saved places now offers a plain-text itinerary download containing route-ordered names, coordinates, map links and attribution. It does not claim visits or add network requests.
