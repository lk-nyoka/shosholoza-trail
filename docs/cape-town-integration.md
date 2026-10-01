# Cape Town finale integration

The supplied `cape_town_finale_template` is the v1 controller/sequence package (19 TypeScript files). The accompanying ARCHITECTURE_V2.md describes additional systems not present in that folder. This integration preserves the template/app adapter boundary and adds a playable React route at `/cape-town`.

Implemented: train arrival using an extract of the existing mapped railway; shared train models and rolling wheels; camera-driven Bo-Kaap, cableway, summit exploration, harbour and sunset; pause/cancel/dispose; explicit panorama continuation; saved discoveries and completion/passport; guarded phase transitions and progress-triggered flight captions. Cape Town is linked from Destinations. No live map tiles are loaded by the animation.

Scenery is deliberately labelled procedural. Cableway alignment, buildings, mountain shape and camera paths are illustrative, not surveyed or supplied hero assets. The template's empty route placeholders are not treated as validated data. Missing voice recordings and environmental sound cues are not replaced with unrelated audio. The existing procedural train audio is optional.

Remaining v2 work: authored hero models and camera exports, real cableway geometry, adaptive scene budgets beyond pixel ratio, asset dependencies/fallback manifests, richer achievement logic, authored environmental audio and quality telemetry. Saved completion and memories persist; interrupted playback restarts at arrival rather than resuming an unsafe mid-transition phase. The recap does not falsely mark Pretoria/Johannesburg/Kimberley as visited.

Verification commands:
- `npm run check:app`
- `npm run build:app`
- `node --experimental-strip-types --test tests/cape-town-runtime.test.ts`
- `node scripts/check-cape-town.mjs` against the local public server at port 8791

Original source folder remains intact. This is a local integration, not a production deployment.

Validation completed: app typecheck and production build passed; two runtime unit tests passed; full browser sequence passed (arrival, panorama selection, completion, reload persistence, replay and cancellation; zero page errors). Mobile viewport 390?844 passed save/pause/stop/navigation with no horizontal overflow or page errors. Screenshots are in evidence/cape-town/.

Touch-up iteration: shared materials; instanced windows and roof caps; steeper, subtly coloured mountain strata; wider opening camera; station-relative arrival framing; brighter Bo-Kaap cornices and stoops; collapsible controls; saved-moment acknowledgement; normalised cableway progress. Desktop/mobile interaction checks pass with no page errors or overflow. Run scripts/check-cape-town-touchups.mjs for evidence.
