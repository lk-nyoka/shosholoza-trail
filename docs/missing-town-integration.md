# Missing town integration - supersedes connected draft entry

The original developed town scenes are the primary journey again. Chapter links:
Pretoria /animation; Johannesburg /johannesburg.html; Kimberley /kimberley.html;
De Aar /de-aar; Beaufort West /beaufort-west.html; Cape Town /cape-town.

Only previously empty Matjiesfontein and Worcester use the draft scenery, at
/animation/matjiesfontein and /animation/worcester. Both instantiate the SAME
AnimationRide React component and stylesheet as Pretoria, with colour variables
and place copy supplied per town. MissingTownScene adapts the two lightweight
scenes to its existing engine interface. Camera rigs, orbit, time presets, audio,
pause/seek, visit camera, guide and compact panels work. POI labels are disabled
because there is no surveyed POI set. The 0.7 km stage is explicitly compressed.

The separate /trail player is retired from routing. Old /trail?stop= links resolve
to the restored town entry. Detailed developed scenes have NOT been replaced by
the simplified draft. No detailed-chapter stamps are awarded by the blockouts.

Verification: scripts/check-merged-towns.mjs; captures evidence/merged-towns.
