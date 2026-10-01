import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";

export async function playSummitSequence(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await a.world.activateHeroScene(CAPE_TOWN.assets.summit);
  await a.world.setEnvironmentState(CAPE_TOWN.environments.summit, 900);
  await a.audio.setEnvironment("SUMMIT");
  await a.camera.setMode("PANORAMA");
  await a.audio.setCameraMode("PANORAMA");

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.summitReveal, signal),
    a.effects.play("summit-wind-and-clouds"),
    a.audio.playCue("summit-reveal"),
  ]);

  await a.capture?.captureMoment?.("table-mountain-summit", {
    place: "Table Mountain",
    type: "hero",
  });

  await a.ui.showPanorama([...CAPE_TOWN.panorama], signal);
  await a.clock.sleep(CAPE_TOWN.durations.panoramaMs, signal);
  await a.ui.hidePanorama();
}
