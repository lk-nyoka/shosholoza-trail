import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { QualityTier } from "./types.js";

export function resolveQualityTier(adapters: KimberleyAdapters): QualityTier {
  const preferred = adapters.preferences?.preferredQuality ?? "AUTO";
  if (preferred !== "AUTO") return preferred;

  const fps = adapters.performance?.getAverageFps?.();
  if (fps == null) return "HIGH";
  if (fps < 28) return "LOW";
  if (fps < 42) return "MEDIUM";
  if (fps < 58) return "HIGH";
  return "ULTRA";
}

export async function applyQualityTier(
  adapters: KimberleyAdapters,
  tier: QualityTier,
): Promise<void> {
  await adapters.performance?.setQualityTier?.(tier);

  const postPreset = {
    LOW: "kimberley-post-low",
    MEDIUM: "kimberley-post-medium",
    HIGH: "kimberley-post-high",
    ULTRA: "kimberley-post-ultra",
  }[tier];

  await adapters.world.setPostProcessingPreset?.(postPreset, 400);
  adapters.analytics?.event("kimberley_quality_tier", { tier });
}

export function effectDensityForTier(tier: QualityTier): number {
  return { LOW: 0.35, MEDIUM: 0.6, HIGH: 0.85, ULTRA: 1 }[tier];
}
