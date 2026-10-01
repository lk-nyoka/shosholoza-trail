import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { QualityTier } from "../core/types.js";
import { effectDensityForTier } from "../core/QualityManager.js";

export async function playDiamondInteraction(
  adapters: KimberleyAdapters,
  qualityTier: QualityTier,
  signal?: AbortSignal,
): Promise<"activated" | "skipped"> {
  const { ui, effects, audio, analytics, camera } = adapters;

  await ui.showCaption?.("Something catches the light…", 1400);
  await effects.play("diamond-glint", {
    intensity: qualityTier === "LOW" ? 0.55 : 1,
  });

  const result = await ui.requestDiamondInteraction(
    "Discover the diamond",
    signal,
  );

  if (result === "activated") {
    await Promise.all([
      effects.play("diamond-assemble", {
        density: effectDensityForTier(qualityTier),
        style: "restrained",
      }),
      audio.playCue("diamond-discovery"),
      camera.shake?.(0.08, 280),
    ]);

    await ui.showDiamondMessage(
      "A discovery transformed this landscape",
      "In 1871 diamonds were found on Colesberg Kopje. Within a few years the hill was gone, dug by hand into the Big Hole.",
    );
    await ui.showDiscoveryCard?.(
      "Diamond discovery unlocked",
      "Added to your Kimberley rail passport.",
      "diamond",
    );

    analytics?.event("kimberley_diamond_interaction", { activated: true });
  } else {
    analytics?.event("kimberley_diamond_interaction", { activated: false });
  }

  return result;
}
