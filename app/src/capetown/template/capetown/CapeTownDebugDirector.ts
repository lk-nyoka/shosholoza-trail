import type { CapeTownAdapters } from "../adapters/contracts.js";
import { CAPE_TOWN } from "./config.js";
import { playBoKaapSequence } from "./BoKaapSequence.js";
import { playCablewaySequence } from "./CablewaySequence.js";
import { playSummitSequence } from "./SummitSequence.js";
import { playWaterfrontFinale } from "./WaterfrontFinale.js";
import { playJourneyRecap } from "./JourneyRecap.js";

export class CapeTownDebugDirector {
  constructor(private readonly a: CapeTownAdapters) {}

  station() {
    return this.a.camera.playPath(CAPE_TOWN.camera.stationArrival);
  }

  boKaap() {
    return playBoKaapSequence(this.a);
  }

  cableway() {
    return playCablewaySequence(this.a);
  }

  summit() {
    return playSummitSequence(this.a);
  }

  waterfront() {
    return playWaterfrontFinale(this.a);
  }

  recap() {
    return playJourneyRecap(this.a);
  }

  async fallbackMountain() {
    await this.a.world.activateHeroScene(CAPE_TOWN.assets.fallbackMountain);
    await this.a.world.setEnvironmentState(CAPE_TOWN.environments.summit, 500);
    await this.a.camera.playPath(CAPE_TOWN.camera.summitReveal);
  }

  async reset() {
    await this.a.world.setEnvironmentState(CAPE_TOWN.environments.city, 500);
    await this.a.world.setTimeOfDay?.(0.55, 500);
    await this.a.world.setOceanIntensity?.(0.35, 500);
    await this.a.world.setMountainCloudAmount?.(0.18, 500);
    await this.a.camera.setMode("FREE");
  }
}
