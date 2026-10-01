import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";

export async function playCablewaySequence(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await Promise.all([
    a.world.preloadAsset(CAPE_TOWN.assets.cableCar),
    a.world.preloadAsset(CAPE_TOWN.assets.mountain),
  ]);

  await a.audio.setEnvironment("CABLEWAY");
  await a.world.setEnvironmentState(CAPE_TOWN.environments.mountain, 1000);

  await a.camera.playPath(CAPE_TOWN.camera.cableTransfer, signal);

  await a.routeFollower.spawnVehicle(
    CAPE_TOWN.assets.cableCar,
    CAPE_TOWN.routes.cableway,
  );

  let cloudTriggered = false;
  let revealTriggered = false;

  const onProgress = async (p: number) => {
    await a.ui.setProgress(0.40 + p * 0.20);

    if (!cloudTriggered && p >= 0.34) {
      cloudTriggered = true;
      await a.world.setMountainCloudAmount?.(0.68, 1400);
      await a.effects.play("tablecloth-cloud-pass", { progress: p });
      await a.audio.playCue("cableway-cloud-pass");
    }

    if (!revealTriggered && p >= 0.72) {
      revealTriggered = true;
      await a.world.setMountainCloudAmount?.(0.22, 1600);
      await a.effects.play("city-bowl-reveal-through-cloud", { progress: p });
    }
  };

  if (a.routeFollower.followWithProgress) {
    await Promise.all([
      a.routeFollower.followWithProgress(
        CAPE_TOWN.routes.cableway,
        CAPE_TOWN.durations.cableAscentMs,
        (p) => { void onProgress(p); },
        signal,
      ),
      a.camera.playPath(CAPE_TOWN.camera.cableAscent, signal),
      a.audio.playCue("cableway-ascent"),
    ]);
  } else {
    await Promise.all([
      a.routeFollower.follow(
        CAPE_TOWN.routes.cableway,
        CAPE_TOWN.durations.cableAscentMs,
        signal,
      ),
      a.camera.playPath(CAPE_TOWN.camera.cableAscent, signal),
      a.audio.playCue("cableway-ascent"),
    ]);
  }

  await a.routeFollower.despawnVehicle(CAPE_TOWN.assets.cableCar);
}
