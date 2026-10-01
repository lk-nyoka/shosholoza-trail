# Pretoria landmark integration

The existing `/experience/pretoria` scene is preserved. The supplied `train-tourism` Union Buildings model and shot list were adapted into its Three.js landmark pipeline; no replacement town runtime was introduced.

- Station departure, train, jacarandas and existing landmarks remain.
- Visit Union Buildings opens an optional off-route cinematic; it is not represented as a landmark passed by the southbound train.
- Pause/resume and Return to train use the shared interface.
- Manual return now interpolates from the actual camera pose instead of starting at the destination pose. Changing camera cancels the landmark director cleanly.
- Geometry and gardens are approximate procedural massing, labelled accordingly.

Validation: app TypeScript check and production build passed. `node scripts/check-pretoria-return.mjs` verified scene loading, reveal, stable paused camera, return to follow and absence of browser errors. Screenshots are in `evidence/shared-experience/pretoria-union-reveal.png` and `pretoria-return.png`.

This change is locally built; deployment is not recorded by this check.

Deployment: Cloudflare Worker version 5393c564-8078-4c93-9c55-35d52344a600 at https://shosholozatrail.giftvundla22.workers.dev/experience/pretoria. Union Buildings JSON returned HTTP 200 after release.
