import type { CapeTownAdapters } from "../adapters/contracts.js";
import type { FinaleMoment } from "../core/types.js";
import { CAPE_TOWN } from "./config.js";

const MOMENTS: FinaleMoment[] = [
  { id: "pretoria", title: "Pretoria", subtitle: "The journey begins" },
  { id: "johannesburg", title: "Johannesburg", subtitle: "Urban energy" },
  { id: "kimberley", title: "Kimberley", subtitle: "Rails to Diamonds" },
  { id: "cape-town", title: "Cape Town", subtitle: "Mountain to Sea" },
];

export async function playJourneyRecap(
  a: CapeTownAdapters,
  signal?: AbortSignal,
): Promise<void> {
  await a.audio.playCue("journey-recap");
  await a.camera.playPath(CAPE_TOWN.camera.recap, signal);

  for (const moment of MOMENTS) {
    await a.ui.showFinaleMoment(moment);
    await a.clock.sleep(CAPE_TOWN.durations.recapMomentMs, signal);
  }

  await a.ui.showJourneyRecap([...CAPE_TOWN.journeyStops]);
  await a.capture?.captureMoment?.("full-journey-recap", {
    route: "pretoria-cape-town",
  });
}
