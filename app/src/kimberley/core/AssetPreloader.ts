import type { KimberleyAdapters } from "../adapters/contracts.js";

export interface PreloadReport {
  loaded: string[];
  failedOptional: string[];
}

export async function preloadChapterAssets(
  adapters: KimberleyAdapters,
  required: string[],
  optional: string[],
): Promise<PreloadReport> {
  const loaded: string[] = [];
  const failedOptional: string[] = [];

  for (const id of required) {
    await adapters.world.preloadAsset(id);
    loaded.push(id);
  }

  await Promise.all(
    optional.map(async (id) => {
      try {
        await adapters.world.preloadAsset(id);
        loaded.push(id);
      } catch (error) {
        failedOptional.push(id);
        adapters.analytics?.event("kimberley_optional_asset_failed", {
          assetId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return { loaded, failedOptional };
}
