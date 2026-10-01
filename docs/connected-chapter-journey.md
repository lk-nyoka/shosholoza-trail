# Connected chapter journey

Priority: make the available experiences navigable as one ordered journey before further graphics work.

The shared navigation module is `app/src/journey/ChapterNavigation.ts`. React mounts it through `ChapterNavigationView`; the three standalone city HTML pages import the same module. A shadow root isolates navigation styles from each city's design. Ordinary same-origin links unload the previous page, rather than keeping several WebGL scenes and audio contexts alive. The menu identifies the current chapter, links previous/next available animations, and lists unfinished stops explicitly. Local storage records last opened chapter, not completion.

Available sequence: Pretoria → Johannesburg → Kimberley → De Aar preview → Beaufort West → Cape Town. Matjiesfontein and Worcester remain visible as unavailable chapters. The Pretoria–Johannesburg corridor is linked separately.

Next functional milestones:
1. Normalize scene lifecycle events (ready, playing, paused, completed, error). Each city adapts its existing controller rather than replacing its UI.
2. Add completion-aware departure cards and a continue/resume journey action. Persist actual completed chapters separately from the last opened chapter.
3. Add transitions between cities using the mapped corridor, with explicit travel compression. The current navigation changes pages; it does not represent continuous animated travel.
4. Carry compatible sound, reduced-motion and quality preferences through the shared journey state, while retaining per-city controls.
5. Verify the whole journey and recovery path before visual polish.

De Aar now has a local 40-second candidate-route preview with the existing extrusion train model, staggered mapped switch pulses, rising/descending camera, pause/replay and deterministic timeline seeking. Route selection remains unvalidated. It is not a completed handoff to Beaufort West.
