# Revised implementation: two independent experiences

This revision follows the user's clarification and authorization to implement
immediately. Ignore reference-audit.md. It supersedes interpreting the MapLibre
ride as the intended animated world.

1. Satellite/geographic navigation remains `/ride` and `/journey`.
2. Animation lives at `/animation`: a separate Three.js scene with local models,
   route data and simplified surroundings. No satellite, DEM, vector tile or
   runtime imagery dependency. No photographic billboards or parallax scenes
   inside this animation view. Photos may guide modelling/textures later.
3. First increment: existing CC0 Quaternius train models, 18 independently
   oriented vehicles, first 5 km of actual mapped rail, stylised jacaranda
   trees, low-detail buildings and a station approximation. No claim that these
   are surveyed surroundings or an accurate historic station reconstruction.
4. Train follows bogie-sampled rail coordinates. Start/pause, route seeking,
   camera presets and orbit enable visual inspection. Background tabs pause
   simulation; reduced-motion users can seek without autoplay.
5. Next: detailed important-place scenes from licensed supplied assets, after
   matching asset provenance and authored motion. Do not label generic models
   as actual attractions. No suitable Pretoria landmark/camera asset pair has
   yet been confirmed. Resolve this before landmark acceptance.
6. Refine animation, wheels/couplers, reference-derived camera behaviour and
   surrounding scenery incrementally. Existing photographic story pages are
   separate content, not animation deliverables.

Local references inform implementation where suitable and licensed. This first
scene reuses the existing train assets and bogie sampling. The world geometry
is explicitly a new approximation, not copied/reference-matched scenery.
Orbit is Three.js OrbitControls; it does not claim EarthDrive equivalence.

Acceptance for the separation: `/animation` renders and moves with every
cross-origin request blocked; no MapLibre map instance, photo panels or remote
imagery requests in that page. Test seeking/restart, mobile layout, cleanup and
loading failure. A locally served page is not a claim of installed-PWA caching.

## Station visit increment

`StationScene.ts` replaces the initial station boxes with a grouped 3D study:
platform edge, canopy/braces, framed windows, benches, lamps and clock tower.
The clock hand is geometry and animates without images. This remains an
approximation, not an accurate model of Pretoria Station.

`StationVisit.ts` supplies explicitly new local-space position/target keyframes
played with GSAP: approach 2 seconds, platform 4, clock 4, departure 3, return 2.
No matching supplied Pretoria landmark/camera asset pair has been identified;
these preview keyframes do not claim to reproduce one. They are kept separate
from rail simulation so a suitable authored asset/path can replace them later.

The user starts the visit deliberately. Train playback continues if it was
already running. The return target follows the current train position. Pause
visit pauses the camera; hidden tabs pause both camera and train. Reduced
motion provides a static station view with an explicit return button. Seeking
or selecting a train camera cancels the visit, preventing competing camera
updates. Early return is an immediate user-requested skip; automatic return
interpolates for two seconds.

This proves the place-visit interaction independently of a real landmark asset.
It does not complete the original real-attraction acceptance requirement.
