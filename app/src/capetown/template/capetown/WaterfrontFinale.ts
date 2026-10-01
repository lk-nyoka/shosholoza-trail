import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";

export async function playWaterfrontFinale(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await a.world.preloadAsset(CAPE_TOWN.assets.waterfront);
  await a.audio.setEnvironment("OCEAN");

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.mountainToSea, signal),
    a.world.setOceanIntensity?.(1, 1800),
    a.effects.play("mountain-to-sea-flight"),
  ]);

  await a.world.activateHeroScene(CAPE_TOWN.assets.waterfront);
  await a.world.setEnvironmentState(CAPE_TOWN.environments.waterfront, 900);
  await a.audio.setEnvironment("WATERFRONT");

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.waterfront, signal),
    a.audio.playCue("waterfront-arrival"),
    a.effects.play("harbour-gulls", { subtle: true }),
  ]);

  await a.ui.showLocationCard(
    "V&A Waterfront",
    "The journey ends at the working harbour with Table Mountain behind the city.",
    2200,
  );

  await a.world.setEnvironmentState(CAPE_TOWN.environments.sunset, 1600);
  await a.world.setTimeOfDay?.(0.82, 2200);

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.sunsetFinale, signal),
    a.audio.playCue("cape-town-sunset"),
    a.effects.play("waterfront-sunset-reflections"),
  ]);

  await a.capture?.captureMoment?.("cape-town-sunset-finale", {
    place: "V&A Waterfront",
    type: "finale",
  });
}
