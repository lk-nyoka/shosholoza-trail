import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";

export async function playMountainApproach(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await a.world.setEnvironmentState(CAPE_TOWN.environments.approach, 1400);
  await a.world.setMountainCloudAmount?.(0.18, 1800);
  await a.audio.setEnvironment("OPEN");
  await a.train.setTargetSpeedKph(CAPE_TOWN.train.approachKph);

  await Promise.all([
    a.camera.playPath(CAPE_TOWN.camera.mountainApproach, signal),
    a.audio.playCue("cape-town-approach"),
    a.effects.play("mountain-horizon-haze", { intensity: 0.35 }),
  ]);

  await a.ui.showLocationCard(
    "Cape Town",
    "The railway reaches the city between mountain and sea.",
    1800,
  );
}
