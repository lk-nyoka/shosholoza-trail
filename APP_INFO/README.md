# Shosholoza Trail App Handover

Primary experience: `http://127.0.0.1:5174/app`

This folder records the app architecture, the WebGL work, and the current runtime expectations. The source of truth remains the parent project directory.

## Run

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Open `http://127.0.0.1:5174/app`.

## Build check

```powershell
npm run build
```

## Main files

- `src/pages/LiveJourney.tsx`: `/app` live journey screen and GPS tracking state.
- `src/components/map/TrainMap.tsx`: Three.js renderer, train movement, route scene, labels, loaders, and fallback.
- `src/components/map/TrainMap.css`: WebGL scene and fallback presentation.
- `src/hooks/useGpsTelemetry.ts`: continuous browser GPS watch, route projection, speed, accuracy, and signal state.
- `src/hooks/useTrainPlayback.ts`: retained for the non-live Journey demo playback.
- `src/rail-geometry.ts`: generated Pretoria-to-Cape Town railway geometry.
- `public/assets/README.md`: optional binary asset contract.

## Current behavior

`/app` uses the browser's continuous GPS watch as its authoritative position source. Each fix is projected onto the OSM rail geometry, converted to route km, and used to update the 3D train and nearest station. The Pause control pauses GPS tracking; it does not create synthetic movement. Notifications and disruption banners do not affect tracking.

`/ride` is a local simulated first-person journey. It starts paused at Pretoria and provides explicit play/pause, speed multipliers, kilometre stepping, station jumps, a station progress strip, station-arrival cards, bearings, and nearby places while following the Three.js rail scene.
