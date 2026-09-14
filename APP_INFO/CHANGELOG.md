# App Changes

## 2026-09-12

- Migrated the map surface from Leaflet to Three.js WebGL.
- Added PBR materials, directional soft shadows, fog, instanced sleepers and grass, terrain LOD, frustum culling, GLTF/KTX2/HDR loaders, and city labels.
- Added a procedural train fallback so the scene works before binary art assets arrive.
- Added a WebGL-disabled animated Pretoria-to-Cape Town corridor preview.
- Changed `/app` from simulated/SSE motion to continuous browser GPS telemetry.
- Added route-segment projection, GPS-derived speed, accuracy display state, nearest-station updates, and a 15-second signal-lost threshold.
- Restored `/ride` to a local delta-time simulation with explicit play/pause, stepping, stop jumps, and 1x/4x/16x speed controls.
- Added first-person camera follow, route station progress strip, and destination arrival overlay to `/ride`.
- Kept `/app` as the GPS-authoritative experience.
- Centralized delta-time playback and station-only stopping in `useTrainPlayback`.
- Notifications and disruption banners remain independent from movement.
- Added local Basis transcoder runtime under `public/basis`.
- Added Esri World Imagery and Terrarium elevation tile integration.
- Added atmospheric sky scattering, instanced power poles, and railside trees along the OSM corridor.
- Added this `APP_INFO` handover folder.
