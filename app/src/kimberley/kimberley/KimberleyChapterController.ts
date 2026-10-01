import type { KimberleyAdapters } from "../adapters/contracts.js";
import type { ChapterStatus, KimberleyPhase } from "../core/types.js";
import { preloadChapterAssets } from "../core/AssetPreloader.js";
import { applyQualityTier, resolveQualityTier } from "../core/QualityManager.js";
import { runOptionalStep } from "../core/SafeStep.js";
import { KIMBERLEY_CONFIG } from "./config.js";
import { playHeritageMorph } from "./HeritageMorph.js";
import { playHeritageTimeMachine } from "./HeritageTimeMachine.js";
import { playTramCinematic } from "./TramCinematic.js";
import { playBigHoleCinematic, playBigHoleFallback } from "./BigHoleCinematic.js";
import { playDiamondInteraction } from "./DiamondInteraction.js";
import { awardKimberleyChapter } from "./ChapterRewards.js";

export class KimberleyChapterController {
  private abortController: AbortController | null = null;
  private running: Promise<void> | null = null;

  private status: ChapterStatus = {
    phase: "IDLE",
    startedAtMs: null,
    completedAtMs: null,
    usedFallback: false,
  };

  constructor(private readonly adapters: KimberleyAdapters) {}

  getStatus(): Readonly<ChapterStatus> {
    return this.status;
  }

  /** A real AbortError, so no step mistakes a cancel for a failure and falls back. */
  cancel(reason = "Kimberley chapter cancelled"): void {
    this.abortController?.abort(new DOMException(reason, "AbortError"));
  }

  /** Settles once the current run, if any, has fully unwound. */
  async idle(): Promise<void> {
    await this.running?.catch(() => {});
  }

  private async phase(phase: KimberleyPhase): Promise<void> {
    // Every phase boundary is a cancellation point: steps that do not take the
    // signal would otherwise carry on over a restarted scene.
    this.abortController?.signal.throwIfAborted();
    this.status = { ...this.status, phase };
    this.adapters.analytics?.event("kimberley_phase", { phase });
    await this.adapters.ui.setPhase(phase);
  }

  run(): Promise<void> {
    if (this.abortController) return Promise.reject(new Error("Kimberley chapter is already running."));
    this.running = this.play();
    return this.running;
  }

  private async play(): Promise<void> {

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const qualityTier = resolveQualityTier(this.adapters);

    this.status = {
      phase: "IDLE",
      startedAtMs: Date.now(),
      completedAtMs: null,
      qualityTier,
      usedFallback: false,
    };

    const { camera, train, world, tram, audio, ui, effects, clock } = this.adapters;
    let usedFallback = false;
    let diamondActivated = false;

    try {
      // 0. Preload and quality setup.
      await this.phase("PRELOAD");
      await applyQualityTier(this.adapters, qualityTier);
      await world.setCityProfile(KIMBERLEY_CONFIG.cityProfile);
      await world.setLightingPreset?.(KIMBERLEY_CONFIG.lighting.approach, 500);
      await world.setWeatherPreset?.(KIMBERLEY_CONFIG.weather.approach, 500);

      const preloadReport = await preloadChapterAssets(
        this.adapters,
        [KIMBERLEY_CONFIG.assets.station, KIMBERLEY_CONFIG.assets.tram],
        [KIMBERLEY_CONFIG.assets.heritageProps, KIMBERLEY_CONFIG.assets.diamondParticles],
      );
      this.adapters.analytics?.event("kimberley_preload_complete", { ...preloadReport });
      await world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritage, false, 0);
      await world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritageCrowd, false, 0);
      await ui.setChapterTitle("Kimberley", "Rails to Diamonds");

      // 1. Approach.
      await this.phase("APPROACH");
      await camera.setMode("FOLLOW");
      await audio.setCameraMode("FOLLOW");
      await audio.setEnvironment("OPEN");
      await audio.setMusicState?.("kimberley-approach", 800);
      await train.setTargetSpeedKph(KIMBERLEY_CONFIG.train.approachKph);
      await ui.showLocationCard("Kimberley", "Diamond Fields", 1600);
      await clock.sleep(
        this.adapters.preferences?.reducedMotion ? 1400 : KIMBERLEY_CONFIG.durations.approachMs,
        signal,
      );

      // 2. Station arrival.
      await this.phase("STATION_ARRIVAL");
      await audio.setEnvironment("STATION");
      await camera.setMode("CINEMATIC");
      await audio.setCameraMode("CINEMATIC");
      await camera.setCinematicBars?.(true, 250);
      await ui.setCinematicBars?.(true, 250);
      await train.setTargetSpeedKph(KIMBERLEY_CONFIG.train.platformKph);
      await camera.playPath(KIMBERLEY_CONFIG.cameraPaths.stationArrival, signal);
      await train.setTargetSpeedKph(0);
      await train.waitUntilStopped(signal);
      await audio.playCue("station-stop");
      await ui.showLocationCard(
        "Kimberley Station",
        "The rail journey now shifts into Kimberley's heritage story.",
        KIMBERLEY_CONFIG.durations.stationCardMs,
      );

      // 3. Heritage morph.
      await this.phase("HERITAGE_MORPH");
      await camera.playPath(KIMBERLEY_CONFIG.cameraPaths.heritageReveal, signal);
      await playHeritageMorph(this.adapters, qualityTier, signal);

      // 4. Interactive/automatic time-machine blend.
      await this.phase("HERITAGE_TIME_MACHINE");
      await playHeritageTimeMachine(this.adapters, signal);

      // 5. Tram.
      await this.phase("TRAM_BOARDING");
      await audio.playCue("tram-board");
      await this.phase("TRAM_RIDE");
      await playTramCinematic(this.adapters, qualityTier, signal);
      await this.phase("TRAM_PHOTO_MOMENT");
      await ui.showToast?.("Heritage tram moment captured", "SUCCESS");

      // 6. Big Hole hero sequence with fallback.
      await this.phase("BIG_HOLE_REVEAL");
      await tram.despawn();
      const heroSucceeded = await runOptionalStep(
        this.adapters,
        "Big Hole high-detail scene",
        async () => playBigHoleCinematic(this.adapters, qualityTier, signal),
        async () => {
          usedFallback = true;
          this.status = { ...this.status, usedFallback: true };
          await this.phase("RECOVERY");
          await playBigHoleFallback(this.adapters, signal);
        },
        signal,
      );

      if (heroSucceeded) {
        await this.phase("BIG_HOLE_DESCENT");
        await effects.play("big-hole-depth-settle", { qualityTier });
      }

      // 7. Diamond interaction remains optional and never blocks completion.
      await this.phase("DIAMOND_INTERACTION");
      if (KIMBERLEY_CONFIG.featureFlags.diamondInteraction && heroSucceeded) {
        const result = await playDiamondInteraction(this.adapters, qualityTier, signal);
        diamondActivated = result === "activated";
      } else {
        await ui.showToast?.("Diamond interaction skipped in fallback mode", "INFO");
      }

      // 8. Return to train.
      await this.phase("RETURN_TO_TRAIN");
      await ui.setProgress(1);
      await audio.playCue("return-whoosh");
      await world.setLightingPreset?.(KIMBERLEY_CONFIG.lighting.return, 900);
      await camera.playPath(KIMBERLEY_CONFIG.cameraPaths.returnToTrain, signal);

      if (heroSucceeded) {
        await world.deactivateHeroScene(KIMBERLEY_CONFIG.assets.bigHole);
      } else {
        await world.deactivateFallbackScene?.(KIMBERLEY_CONFIG.assets.bigHoleFallback);
      }

      await world.setEnvironmentState(KIMBERLEY_CONFIG.environments.presentDay, 1200);
      await world.setEraBlend?.(0);
      await world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.modern, true, 1000);
      await world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritage, false, 1000);
      await world.setSceneGroupVisibility(KIMBERLEY_CONFIG.groups.heritageCrowd, false, 1000);
      await audio.duckTrain?.(1, 700);
      await audio.setReverbZone?.("none", 0, 500);
      await camera.returnToTrain(KIMBERLEY_CONFIG.durations.returnToTrainMs);
      await camera.setCinematicBars?.(false, 250);
      await ui.setCinematicBars?.(false, 250);
      await camera.setMode("FOLLOW");
      await audio.setCameraMode("FOLLOW");
      await audio.setEnvironment("OPEN");
      await train.setVisible(true);
      await train.setTargetSpeedKph(KIMBERLEY_CONFIG.train.departureKph);

      // 9. Reward / recap.
      await this.phase("CHAPTER_REWARD");
      await awardKimberleyChapter(this.adapters, usedFallback, diamondActivated);

      // 10. Complete.
      await this.phase("COMPLETE");
      await ui.completeChapter("Kimberley complete");
      this.status = { ...this.status, completedAtMs: Date.now(), usedFallback };
      this.adapters.analytics?.event("kimberley_complete", {
        qualityTier,
        usedFallback,
        diamondActivated,
      });

      // Unload heavyweight chapter-only assets after the train has left.
      await world.unloadAsset?.(KIMBERLEY_CONFIG.assets.bigHole);
      await world.unloadAsset?.(KIMBERLEY_CONFIG.assets.heritageProps);
    } finally {
      this.abortController = null;
      this.running = null;
    }
  }
}
