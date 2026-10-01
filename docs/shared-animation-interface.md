# Shared interface for all eight original scenes

Entry: /experience/pretoria. Every chapter link targets /experience/<town>.
One React component (experience/SharedExperience.tsx) owns every town's visible
header, place card, camera row, lighting row, playback row, guide and town navigation.
Only data-location colour variables and location content vary.

Existing scenes remain in their original runtimes, loaded in a same-origin scene
frame. Their original page chrome is concealed, and the shared adapter calls their
existing controls. The only draft scenes remain Matjiesfontein and Worcester.
Old town URLs redirect to the matching shared experience except in sceneOnly mode.

Camera bridges relinquish the original cinematic camera before changing the view.
Native actions, including De Aar candidate selection and Cape Town summit choices,
are exposed inside the same guide panel. Controls without runtime support retain
their position but are disabled; no synthetic timeline replaces a chapter controller.

Security: only the eight named scene routes with sceneOnly=1 allow SAMEORIGIN
framing. All other responses retain DENY; external framing remains forbidden.

Validation: check:app, check, unit suite (including framing policy), and
scripts/check-shared-experience.mjs. Browser captures: evidence/shared-experience.
