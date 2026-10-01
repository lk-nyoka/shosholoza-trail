import type { WorldAdapter } from "../adapters/contracts.js";

export interface PreloadResult {
  loaded: string[];
  failed: Array<{ id: string; error: unknown }>;
}

export class AssetPreloader {
  private loaded = new Set<string>();

  constructor(private readonly world: WorldAdapter) {}

  async preload(ids: string[]): Promise<PreloadResult> {
    const result: PreloadResult = { loaded: [], failed: [] };

    await Promise.all(
      ids.map(async (id) => {
        if (this.loaded.has(id)) {
          result.loaded.push(id);
          return;
        }

        try {
          await this.world.preloadAsset(id);
          this.loaded.add(id);
          result.loaded.push(id);
        } catch (error) {
          result.failed.push({ id, error });
        }
      }),
    );

    return result;
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  async release(id: string): Promise<void> {
    if (!this.loaded.has(id)) return;
    await this.world.releaseAsset?.(id);
    this.loaded.delete(id);
  }
}
