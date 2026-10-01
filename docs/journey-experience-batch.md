# Larger journey experience batch

Built on the existing Pretoria scene and user-supplied train-tourism patterns. No replacement route, duplicate renderer, new content claims or paid service was introduced.

## Implemented

1. Public guide for all three loaded landmark studies; no debug query needed.
2. On-demand landmark sequence buttons with existing tourism text and source credits.
3. Nearby-rail shortcuts from the guide and selected saved places.
4. Route progress bar and remaining distance.
5. Actual scene speed and paused/travelling/section-complete status.
6. Restart at Pretoria while retaining session history and saved places.
7. Copyable route-position links that load paused, with finite/clamped input.
8. Remembered camera, window side, time, labels and graphics preferences; never autoplay audio.
9. Light graphics mode: one device pixel ratio and shadows disabled.
10. Fullscreen toggle with a visible fallback message.
11. Hide/show panels control to leave more space for the scenery.
12. Search the route-place list by name or kind.
13. Undo the most recent saved-place removal.
14. Saved-place updates received from other tabs.
15. GeoJSON export with longitude/latitude ordering and OSM attribution.
16. Session recap: simulated distance, moving time and fully completed sequences. Slider jumps do not count as travel; skipped sequences do not earn completion.
17. React to reduced-motion changes without a reload, pausing movement when enabled.
18. Preserve session-only saved places by hiding, rather than unmounting, their panel during visits.
19. Cancel cinematic camera ownership immediately on a route scrub.
20. Stop cinematic time advancing while the document is hidden.
21. Expose the interactive scene as a group rather than an image with hidden interactive descendants.

## Validation

Both TypeScript configurations pass. New unit checks cover preference validation, bounded shared position, coordinate export and cinematic cancellation. Browser batch checks cover guide availability, graphics, paused links, restart, clean-view controls, search/save/export, undo, reload, live reduced-motion changes and mobile viewport bounds. Fullscreen availability is browser-dependent. A physical phone and subjective graphics/audio quality still require human inspection.

The supplied audio engine's design was not retuned. It receives cinematic mode during landmark sequences, correcting its camera-mode input.

## Completed checks

The local browser batch passed all nine grouped checks, with no page errors. A separate public-landmark check passed entry, return to the train, actual movement and pause. A 390x844 screenshot was inspected for the guide layout. Both TypeScript configurations pass.

Station and landmark panels now use the controls' measured height rather than a fixed bottom offset, and the expanded guide hides during cinematics. This avoids the new controls covering the return button.

## Release

Published source commit `516d4b8` to https://shosholozatrail.giftvundla22.workers.dev on 21 September 2026. Cloudflare version: `70db5f1d-4941-409e-864f-199ccbc11200`. Final full suite: 191 passed, zero failed; secret scan passed.

## Landmark pause follow-up

Pause now holds the current pose during approach, cinematic and return, including a moving train target. Reduced-motion changes preserve a manual pause, and Back to the train cancels the sequence immediately under reduced motion. Tests cover approach/return pause and reset.
