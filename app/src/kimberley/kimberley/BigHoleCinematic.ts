import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { QualityTier } from "../core/types.js";
import { effectDensityForTier } from "../core/QualityManager.js";
import { KIMBERLEY_CONFIG } from "./config.js";

async function playHistorySequentially(
  adapters: KimberleyAdapters,
  signal?: AbortSignal,
): Promise<void> {
  for (const beat of KIMBERLEY_CONFIG.history) {
    await adapters.ui.setProgress(beat.depth01);
    await adapters.ui.showHistoricalBeat(beat);
    if (beat.audioCue) await adapters.audio.playCue(beat.audioCue);
    if (beat.effectId) await adapters.effects.play(beat.effectId, { depth01: beat.depth01 });
    await adapters.clock.sleep(KIMBERLEY_CONFIG.durations.historyBeatMs, signal);
  }
}

export async function playBigHoleCinematic(
  adapters: KimberleyAdapters,
  qualityTier: QualityTier,
  signal?: AbortSignal,
): Promise<void> {
  const { world, camera, audio, ui, effects } = adapters;

  await world.preloadAsset(KIMBERLEY_CONFIG.assets.bigHole);
  await world.activateHeroScene(KIMBERLEY_CONFIG.assets.bigHole);
  await world.setEnvironmentState(KIMBERLEY_CONFIG.environments.bigHole, 900);
  await world.setLightingPreset?.(KIMBERLEY_CONFIG.lighting.bigHole, 900);
  await world.setPostProcessingPreset?.("kimberley-big-hole-cinematic", 900);
  await audio.duckTrain?.(0.22, 600);
  await audio.setReverbZone?.("big-hole-open-cavity", 0.32, 600);
  await camera.setCinematicBars?.(true, 250);
  await ui.setCinematicBars?.(true, 250);

  await camera.transitionToPath(
    KIMBERLEY_CONFIG.cameraPaths.bigHoleReveal,
    KIMBERLEY_CONFIG.durations.bigHoleRevealTransitionMs,
  );

  await Promise.all([
    camera.playPath(KIMBERLEY_CONFIG.cameraPaths.bigHoleReveal, signal),
    audio.playCue("big-hole-reveal"),
    effects.play("big-hole-atmospheric-dust", {
      density: effectDensityForTier(qualityTier),
    }),
  ]);

  await ui.showDiscoveryCard?.(
    "The Big Hole",
    "The landmark is now the stage: the camera descends while history is revealed through depth.",
    "landmark",
  );

  if (camera.playPathWithProgress) {
    const shown = new Set<number>();
    await camera.playPathWithProgress(
      KIMBERLEY_CONFIG.cameraPaths.bigHoleDescent,
      async (progress01) => {
        await ui.setProgress(progress01);
        for (let i = 0; i < KIMBERLEY_CONFIG.history.length; i += 1) {
          const beat = KIMBERLEY_CONFIG.history[i];
          if (!shown.has(i) && progress01 >= beat.depth01) {
            shown.add(i);
            await ui.showHistoricalBeat(beat);
            if (beat.audioCue) await audio.playCue(beat.audioCue);
            if (beat.effectId) await effects.play(beat.effectId, { depth01: beat.depth01 });
          }
        }
      },
      signal,
    );
  } else {
    await Promise.all([
      camera.playPath(KIMBERLEY_CONFIG.cameraPaths.bigHoleDescent, signal),
      playHistorySequentially(adapters, signal),
    ]);
  }

  await ui.clearHistoricalBeat();
}

export async function playBigHoleFallback(
  adapters: KimberleyAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await adapters.world.activateFallbackScene?.(KIMBERLEY_CONFIG.assets.bigHoleFallback);
  await adapters.ui.showLocationCard(
    "The Big Hole",
    "High-detail landmark rendering was unavailable, so the experience switched to a lightweight geographic presentation.",
    2200,
  );
  await adapters.camera.playPath(KIMBERLEY_CONFIG.cameraPaths.bigHoleFallback, signal);
  await playHistorySequentially(adapters, signal);
  await adapters.ui.clearHistoricalBeat();
}
