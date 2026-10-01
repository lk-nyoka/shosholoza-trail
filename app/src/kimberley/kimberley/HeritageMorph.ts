import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { QualityTier } from "../core/types.js";
import { effectDensityForTier } from "../core/QualityManager.js";
import { KIMBERLEY_CONFIG } from "./config.js";

export async function playHeritageMorph(
  adapters: KimberleyAdapters,
  qualityTier: QualityTier,
  signal?: AbortSignal,
): Promise<void> {
  const { world, audio, effects, clock, camera, ui } = adapters;
  const d = adapters.preferences?.reducedMotion
    ? Math.min(900, KIMBERLEY_CONFIG.durations.heritageMorphMs)
    : KIMBERLEY_CONFIG.durations.heritageMorphMs;

  await camera.setCinematicBars?.(true, 250);
  await ui.setCinematicBars?.(true, 250);
  await world.setLightingPreset?.(KIMBERLEY_CONFIG.lighting.heritage, d);
  await world.setWeatherPreset?.(KIMBERLEY_CONFIG.weather.heritage, d);
  await world.setPostProcessingPreset?.("kimberley-heritage-film", d);
  await audio.setMusicState?.("kimberley-heritage-transition", d);

  await Promise.all([
    world.setEnvironmentState(KIMBERLEY_CONFIG.environments.heritage, d),
    world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.modern, false, d),
    world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritage, true, d),
    world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritageCrowd, true, d),
    audio.fadeScene("present-city", 0.22, d),
    audio.fadeScene("heritage-city", 1, d),
    effects.play("heritage-dust-transition", {
      density: effectDensityForTier(qualityTier),
      durationMs: d,
    }),
  ]);

  await ui.showCaption?.("Kimberley, then and now", Math.min(1600, d));
  await clock.sleep(d, signal);
}
