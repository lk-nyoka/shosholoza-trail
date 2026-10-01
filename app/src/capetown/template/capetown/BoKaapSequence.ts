import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";

export async function playBoKaapSequence(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await a.world.preloadAsset(CAPE_TOWN.assets.boKaap);
  await a.world.setEnvironmentState(CAPE_TOWN.environments.boKaap, 900);
  await a.audio.setEnvironment("CITY");

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.boKaap, signal),
    a.world.setBoKaapColourFocus?.(1, 1700),
    a.effects.play("bo-kaap-colour-ribbons", { restrained: true }),
  ]);

  await a.ui.showStoryCard(
    "Bo-Kaap",
    "This is an illustrative streetscape study. Detailed community-sourced heritage stories will be added after review.",
    3000,
  );

  await a.capture?.captureMoment?.("cape-town-bo-kaap-postcard", {
    place: "Bo-Kaap",
    chapter: "cape-town",
  });

  await a.world.setBoKaapColourFocus?.(0.45, 1200);
}
