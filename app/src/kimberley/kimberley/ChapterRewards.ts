import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { ChapterSummary } from "../core/types.js";
import { KIMBERLEY_CONFIG } from "./config.js";

export async function awardKimberleyChapter(
  adapters: KimberleyAdapters,
  usedFallback: boolean,
  diamondActivated: boolean,
): Promise<ChapterSummary> {
  const discoveries = ["Kimberley heritage", "Historic tram", "The Big Hole"];
  if (diamondActivated) discoveries.push("Diamond discovery");

  const summary: ChapterSummary = {
    city: "Kimberley",
    label: KIMBERLEY_CONFIG.rewards.label,
    discoveries,
    stampId: KIMBERLEY_CONFIG.rewards.stampId,
    usedFallback,
  };

  if (KIMBERLEY_CONFIG.featureFlags.passportReward) {
    await adapters.rewards?.unlock(summary.stampId, {
      city: summary.city,
      chapter: KIMBERLEY_CONFIG.chapterId,
      discoveries,
    });
    await adapters.ui.showPassportStamp?.(summary.stampId, summary.label);
  }

  await adapters.ui.showChapterSummary?.(summary);
  return summary;
}
