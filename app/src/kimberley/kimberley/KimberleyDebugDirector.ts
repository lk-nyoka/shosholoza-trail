import type { KimberleyAdapters } from "../adapters/contracts.js";
import { playHeritageMorph } from "./HeritageMorph.js";
import { playHeritageTimeMachine } from "./HeritageTimeMachine.js";
import { playTramCinematic } from "./TramCinematic.js";
import { playBigHoleCinematic, playBigHoleFallback } from "./BigHoleCinematic.js";
import { resolveQualityTier } from "../core/QualityManager.js";
import { KIMBERLEY_CONFIG } from "./config.js";

export class KimberleyDebugDirector {
  constructor(private readonly adapters: KimberleyAdapters) {}

  async previewHeritage(): Promise<void> {
    const tier = resolveQualityTier(this.adapters);
    await playHeritageMorph(this.adapters, tier);
    await playHeritageTimeMachine(this.adapters);
  }

  async previewTram(): Promise<void> {
    const tier = resolveQualityTier(this.adapters);
    await playTramCinematic(this.adapters, tier);
  }

  async previewBigHole(useFallback = false): Promise<void> {
    const tier = resolveQualityTier(this.adapters);
    if (useFallback) await playBigHoleFallback(this.adapters);
    else await playBigHoleCinematic(this.adapters, tier);
  }

  async reset(): Promise<void> {
    await this.adapters.tram.despawn();
    await this.adapters.world.deactivateHeroScene(KIMBERLEY_CONFIG.assets.bigHole);
    await this.adapters.world.deactivateFallbackScene?.(KIMBERLEY_CONFIG.assets.bigHoleFallback);
    await this.adapters.world.setEraBlend?.(0);
    await this.adapters.world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.modern, true, 300);
    await this.adapters.world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritage, false, 300);
    await this.adapters.world.setEnvironmentState(KIMBERLEY_CONFIG.environments.presentDay, 300);
    await this.adapters.camera.setMode("FOLLOW");
    await this.adapters.audio.setCameraMode("FOLLOW");
    await this.adapters.audio.setEnvironment("OPEN");
    await this.adapters.ui.setCinematicBars?.(false, 200);
    await this.adapters.camera.setCinematicBars?.(false, 200);
  }
}
