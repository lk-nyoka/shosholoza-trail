import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { QualityTier } from "../core/types.js";
import { effectDensityForTier } from "../core/QualityManager.js";
import { KIMBERLEY_CONFIG } from "./config.js";

async function runTramStoryCue(
  adapters: KimberleyAdapters,
  cue: (typeof KIMBERLEY_CONFIG.tramStoryCues)[number],
): Promise<void> {
  await adapters.ui.showCaption?.(cue.caption, 1150);
  await adapters.audio.playCue(cue.audioCue);
  await adapters.effects.play(cue.effectId, { progress01: cue.progress01 });
  adapters.analytics?.event("kimberley_tram_story_cue", { cueId: cue.id });
}

export async function playTramCinematic(
  adapters: KimberleyAdapters,
  qualityTier: QualityTier,
  signal?: AbortSignal,
): Promise<void> {
  const { tram, camera, audio, effects, ui, capture, clock } = adapters;

  await tram.spawn(KIMBERLEY_CONFIG.assets.tram);
  await audio.playCue("tram-arrives");
  await tram.boardCamera?.();
  await tram.setSpeedScale?.(adapters.preferences?.reducedMotion ? 0.85 : 1);

  const playedCues = new Set<string>();
  const routeRun = tram.followRouteWithProgress
    ? tram.followRouteWithProgress(
        KIMBERLEY_CONFIG.routes.tram,
        KIMBERLEY_CONFIG.durations.tramRideMs,
        async (progress01) => {
          for (const cue of KIMBERLEY_CONFIG.tramStoryCues) {
            if (!playedCues.has(cue.id) && progress01 >= cue.progress01) {
              playedCues.add(cue.id);
              await runTramStoryCue(adapters, cue);
            }
          }
        },
        signal,
      )
    : tram.followRoute(
        KIMBERLEY_CONFIG.routes.tram,
        KIMBERLEY_CONFIG.durations.tramRideMs,
        signal,
      );

  await Promise.all([
    routeRun,
    camera.playPath(KIMBERLEY_CONFIG.cameraPaths.tramRide, signal),
    audio.playCue("tram-ride"),
    effects.play("tram-track-sparks-subtle", {
      density: effectDensityForTier(qualityTier) * 0.35,
    }),
  ]);

  if (!tram.followRouteWithProgress) {
    for (const cue of KIMBERLEY_CONFIG.tramStoryCues) {
      await runTramStoryCue(adapters, cue);
    }
  }

  if (KIMBERLEY_CONFIG.featureFlags.tramPhotoMoment) {
    await camera.cutToPath?.(KIMBERLEY_CONFIG.cameraPaths.tramPhoto);
    await ui.showCaption?.("A moving postcard from Kimberley", 1000);
    await clock.sleep(KIMBERLEY_CONFIG.durations.tramPhotoHoldMs, signal);
    await capture?.captureMoment("kimberley-tram-postcard", {
      city: "Kimberley",
      chapter: KIMBERLEY_CONFIG.chapterId,
    });
  }
}
