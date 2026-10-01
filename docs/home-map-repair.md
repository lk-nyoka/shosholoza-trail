# Home and map regression repair

Deployment: 30999f8f-0bb1-4bd5-9799-b08c9ddd10f1.

- Authentication and guest entry now target `/home`, preserving the root OAuth callback.
- The MapLibre 6 browser-global build previously lost its import.meta worker URL and omitted the worker asset. Build-assets now bundles the worker separately and sets an explicit same-origin URL for every consumer, including legacy maps.
- Existing map/train/search implementation retained.

Validation: app typecheck and production build passed. Live `check-map-entry.mjs` verifies rendered train features, changing train geometry, Kimberley search/camera selection, and pause/play without worker or JavaScript errors. Live `check-auth-start.mjs` verifies guest navigation and simulated password/Google responses; it does not exercise a real Google account login. The live geocoding endpoint returned HTTP 200.
