import { PhaseMachine } from '../core/PhaseMachine';
import type { CapeTownAdapters } from "../adapters/contracts.js";
import type { CapeTownPhase, ChapterStatus } from "../core/types.js";
import { AssetPreloader } from "../core/AssetPreloader.js";
import { QualityManager } from "../core/QualityManager.js";
import { CAPE_TOWN } from "./config.js";
import { playMountainApproach } from "./MountainApproach.js";
import { playBoKaapSequence } from "./BoKaapSequence.js";
import { playCablewaySequence } from "./CablewaySequence.js";
import { playSummitSequence } from "./SummitSequence.js";
import { playWaterfrontFinale } from "./WaterfrontFinale.js";
import { playJourneyRecap } from "./JourneyRecap.js";

export interface CapeTownControllerOptions {
  forceQuality?: "LOW" | "MEDIUM" | "HIGH" | "ULTRA";
  autoContinuePanorama?: boolean;
}

export class CapeTownChapterController {
  private phases = new PhaseMachine();
  private abortController: AbortController | null = null;
  private readonly preloader: AssetPreloader;
  private readonly quality: QualityManager;

  private status: ChapterStatus = {
    phase: "IDLE",
    startedAtMs: null,
    completedAtMs: null,
    recoveryUsed: false,
  };

  constructor(
    private readonly a: CapeTownAdapters,
    options: CapeTownControllerOptions = {},
  ) {
    this.preloader = new AssetPreloader(a.world);
    this.quality = new QualityManager(options.forceQuality);
  }

  addFpsSample(fps: number): void {
    this.quality.addFpsSample(fps);
  }

  getStatus(): Readonly<ChapterStatus> {
    return this.status;
  }

  cancel(reason = "Cape Town chapter cancelled"): void {
    this.abortController?.abort(new Error(reason));
  }

  private async phase(phase: CapeTownPhase): Promise<void> {
    this.phases.enter(phase);
    this.status = { ...this.status, phase };
    await this.a.ui.setPhase(phase);
    this.a.analytics?.event("cape_town_phase", { phase });
  }

  private async recoverMountain(error: unknown): Promise<void> {
    this.status = { ...this.status, recoveryUsed: true };
    await this.phase("RECOVERY");
    this.a.analytics?.event("cape_town_recovery", {
      subsystem: "table-mountain",
      error: String(error),
    });

    await this.a.ui.showRecoveryNotice?.(
      "High-detail Table Mountain scene was unavailable. Continuing with the lightweight finale.",
    );

    await this.a.world.preloadAsset(CAPE_TOWN.assets.fallbackMountain);
    await this.a.world.activateHeroScene(CAPE_TOWN.assets.fallbackMountain);
    await this.a.world.setEnvironmentState(CAPE_TOWN.environments.summit, 700);
    await this.a.camera.playPath(CAPE_TOWN.camera.summitReveal);
  }

  async run(): Promise<void> {
    if (this.abortController) throw new Error("Cape Town chapter is already running.");

    this.phases.reset();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const a = this.a;

    this.status = {
      phase: "IDLE",
      startedAtMs: Date.now(),
      completedAtMs: null,
      recoveryUsed: false,
    };

    try {
      // 0. Adaptive preloading.
      await this.phase("PRELOAD");

      const settings = this.quality.getSettings();
      await a.world.setQuality?.(settings.level);
      await a.world.setCityProfile("cape-town-finale");

      const preload = await this.preloader.preload([
        CAPE_TOWN.assets.station,
        CAPE_TOWN.assets.cityHero,
        CAPE_TOWN.assets.boKaap,
        CAPE_TOWN.assets.cableCar,
      ]);

      a.analytics?.event("cape_town_preload", {
        loaded: preload.loaded.length,
        failed: preload.failed.map((f) => f.id),
        quality: settings.level,
      });

      await a.ui.setChapterTitle("Cape Town", "Mountain to Sea");

      // 1. Mountain appears before arrival.
      await this.phase("MOUNTAIN_APPROACH");
      await a.camera.setMode("FOLLOW");
      await a.audio.setCameraMode("FOLLOW");
      await playMountainApproach(a, signal);

      // 2. Cape Town Station.
      await this.phase("STATION_ARRIVAL");
      await a.audio.setEnvironment("STATION");
      await a.camera.setMode("CINEMATIC");
      await a.audio.setCameraMode("CINEMATIC");
      await a.train.setTargetSpeedKph(CAPE_TOWN.train.platformKph);

      await Promise.all([
        a.camera.playPath(CAPE_TOWN.camera.stationArrival, signal),
        a.audio.playCue("cape-town-station-arrival"),
      ]);

      await a.train.setTargetSpeedKph(0);
      await a.train.waitUntilStopped(signal);

      await a.ui.showLocationCard(
        "Cape Town Station",
        "The rail journey has reached the City Bowl. The finale now moves from city to mountain to sea.",
        CAPE_TOWN.durations.stationCardMs,
      );

      // 3. Let the city physically unfold around the arrival.
      await this.phase("CITY_UNFOLD");
      await a.world.activateHeroScene(CAPE_TOWN.assets.cityHero);
      await a.world.setEnvironmentState(CAPE_TOWN.environments.city, 1000);

      await Promise.all([
        a.camera.playPath(CAPE_TOWN.camera.cityUnfold, signal),
        a.effects.play("cape-town-city-unfold", {
          mountainCloudParticles: settings.mountainCloudParticles,
        }),
        a.audio.playCue("city-bowl-unfold"),
      ]);

      // 4. Short Bo-Kaap chapter.
      await this.phase("BO_KAAP");
      await playBoKaapSequence(a, signal);

      // 5. Transfer visually to Table Mountain cableway.
      await this.phase("CABLEWAY_TRANSFER");
      await a.audio.setEnvironment("MOUNTAIN");
      await a.camera.playPath(CAPE_TOWN.camera.cableTransfer, signal);

      // 6. Cableway ascent.
      await this.phase("CABLEWAY_ASCENT");
      try {
        await this.preloader.preload([
          CAPE_TOWN.assets.mountain,
          CAPE_TOWN.assets.summit,
        ]);

        await playCablewaySequence(a, signal);

        // 7. Summit reveal.
        await this.phase("SUMMIT_REVEAL");
        await playSummitSequence(a, signal);

        // 8. Panorama discovery.
        await this.phase("PANORAMA_DISCOVERY");
        await a.ui.showStoryCard(
          "One city, three landscapes",
          "The finale deliberately connects the City Bowl, mountain and Table Bay in one continuous camera language.",
          2400,
        );
      } catch (error) {
        if (signal.aborted) throw error;
        await this.recoverMountain(error);
      }

      // 9. Mountain to sea.
      await this.phase("MOUNTAIN_TO_SEA");
      await a.camera.setMode("CINEMATIC");
      await a.audio.setCameraMode("CINEMATIC");

      // 10. Waterfront + sunset.
      await this.phase("WATERFRONT");
      await playWaterfrontFinale(a, signal);

      await this.phase("SUNSET_FINALE");
      await a.ui.showStoryCard(
        "Mountain to Sea",
        "The train journey ends where the city meets the harbour.",
        2200,
      );

      // 11. Full trip recap.
      await this.phase("JOURNEY_RECAP");
      await playJourneyRecap(a, signal);

      // 12. Passport/reward.
      await this.phase("REWARD");
      await a.ui.unlockPassportStamp("cape-town", "Mountain to Sea");
      await a.effects.play("final-passport-stamp");
      await a.audio.playCue("journey-complete");

      await this.phase("COMPLETE");
      await a.ui.showCompletion(
        "Journey complete",
        "Pretoria → Johannesburg → Kimberley → Cape Town",
      );

      this.status = {
        ...this.status,
        completedAtMs: Date.now(),
      };

      a.analytics?.event("cape_town_complete", {
        recoveryUsed: this.status.recoveryUsed,
        quality: settings.level,
      });

      // Release largest hero scenes last.
      await this.preloader.release(CAPE_TOWN.assets.mountain);
      await this.preloader.release(CAPE_TOWN.assets.summit);
      await this.preloader.release(CAPE_TOWN.assets.boKaap);
    } finally {
      this.abortController = null;
    }
  }
}
