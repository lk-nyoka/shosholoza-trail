# Priorities 1–6: functional draft

Uses the existing /experience/:town scenes and shared interface.

1. Continue journey runs a 12-second compressed departure, transit and braking/arrival animation, then opens the next original scene. Cape Town ends with a recap. Return to town cancels without credit.
2. Existing shared cameras and pause remain; Restart town resets the scene. Transition playback has pause/resume. The draft does not replace runtime-specific animation controllers.
3. Visit main landmark selects the existing landmark action per town, or opens the guide when the action is unavailable. Matjiesfontein/Worcester retain their illustrative 3D blockouts.
4. A lightweight SVG transition gives Highveld, Karoo, Hex River mountains and Cape coast distinct scenery. This is an illustrative connector, not surveyed rail geometry or a substitute for town 3D scenes.
5. Local storage records current town, completed travel sequences, transition time and available native scene positions. Reload during travel resumes paused. Scenes without seek support restart at chapter entry. Completion of a travel sequence never creates a detailed chapter passport stamp.
6. The existing TrainSound audio pack follows acceleration, cruising and braking during transitions. Sound preference persists; browser gesture rules still apply. Native scene audio uses the same journey sound toggle.

Checks: TypeScript, production build, scripts/check-journey-flow.mjs covering departure, pause, refresh/resume, automatic handoff, persisted state and landmark action.

Remaining beyond this draft: animated track-continuous physical links between the town worlds; exact resume for cinematic controllers without seek; native arrival/departure camera continuity; richer scenery; real-device audio/performance validation.
