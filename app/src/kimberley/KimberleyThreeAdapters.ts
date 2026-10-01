import * as THREE from 'three';
import type {
  KimberleyAdapters,
  ClockAdapter,
  CameraAdapter,
  TrainAdapter,
  WorldAdapter,
  TramAdapter,
  AudioAdapter,
  UiAdapter,
  EffectsAdapter,
  CaptureAdapter,
  RewardsAdapter,
  PerformanceAdapter,
} from './adapters/contracts.js';
import type { HistoricalBeat, KimberleyPhase, QualityTier, ExperiencePreferences } from './core/types.js';
import type { KimberleyWorld, Shot } from '../animation/cities/kimberley/KimberleyScene.js';
import type { TimeKey } from '../animation/TimeOfDay.js';

/** What the chapter's audio calls leave for the frame loop to feed TrainSound. */
export type ChapterAudioState = {
  environment: 'OPEN' | 'CITY' | 'STATION' | 'BRIDGE' | 'TUNNEL' | 'CROSSING';
  cameraMode: 'FOLLOW' | 'WINDOW' | 'CINEMATIC' | 'STATION' | 'FREE';
  /** 0..1 multiplier on the train mix, for ducking under narration moments. */
  trainLevel: number;
};

export interface ThreeAdapterContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  kimberley: KimberleyWorld;
  audioState: ChapterAudioState;
  uiElements: {
    chapterBanner: HTMLElement;
    phaseBadge: HTMLElement;
    locationCard: HTMLElement;
    locationTitle: HTMLElement;
    locationBody: HTMLElement;
    historicalCard: HTMLElement;
    historicalYear: HTMLElement;
    historicalTitle: HTMLElement;
    historicalBody: HTMLElement;
    timeMachineSlider: HTMLInputElement;
    timeMachineLabel: HTMLElement;
    timeMachinePanel: HTMLElement;
    diamondPrompt: HTMLElement;
    diamondCard: HTMLElement;
    passportModal: HTMLElement;
    passportStamp: HTMLElement;
    cinematicTopBar: HTMLElement;
    cinematicBottomBar: HTMLElement;
    toast: HTMLElement;
    progressBar: HTMLElement;
  };
  trainState: {
    x: number;
    speedKph: number;
    targetSpeedKph: number;
    visible: boolean;
  };
  setCameraPose: (pos: THREE.Vector3, target: THREE.Vector3, durationMs?: number) => Promise<void>;
  /** Hand the camera to the chase rig, which tracks the moving train every frame. */
  followTrain: (enabled: boolean) => void;
  /** Where the chase rig would put the camera right now, so a cut back can land on it. */
  followPose: () => Shot;
  setTimeOfDay: (key: TimeKey) => void;
  shakeCamera: (intensity01: number, durationMs: number) => void;
  getFps: () => number;
  /** True while the viewer has paused; chapter waits stand still. */
  isPaused: () => boolean;
  /** Scene time in ms: advances only while not paused. */
  now: () => number;
  preferences?: ExperiencePreferences;
}

/**
 * The chapter's clock. Sleeps count only unpaused time, so Pause holds the
 * story - cards, tram, descent - not just the frame loop.
 */
class ChapterClock implements ClockAdapter {
  private readonly paused: () => boolean;
  constructor(paused: () => boolean) { this.paused = paused; }
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
      if (signal?.aborted) { abort(); return; }
      let left = ms, last = performance.now();
      const tick = () => {
        const now = performance.now();
        if (!this.paused()) left -= now - last;
        last = now;
        if (left <= 0) { signal?.removeEventListener('abort', abort); resolve(); } else timer = setTimeout(tick, Math.min(left, 100));
      };
      timer = setTimeout(tick, Math.min(ms, 100));
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

/** The chapter's lighting presets onto the four shared times of day. */
export function timeForPreset(presetId: string): TimeKey {
  // Low sun leaves a 180 m pit in shadow to the waterline: accurate, and
  // useless for showing it. The Big Hole gets high sun.
  if (/dramatic|mine|deep/i.test(presetId)) return 'day';
  if (/golden|departure|return/i.test(presetId)) return 'dusk';
  if (/heritage/i.test(presetId)) return 'dawn';
  return 'day';
}

export function createKimberleyThreeAdapters(ctx: ThreeAdapterContext): KimberleyAdapters {
  const clock: ClockAdapter = new ChapterClock(ctx.isPaused);
  const shot = (s: Shot, durationMs: number) => ctx.setCameraPose(s.position, s.target, durationMs);

  // -------------------------------------------------------------
  // 1. CAMERA ADAPTER
  // Every pose comes from the scene's shots, which are measured from the real
  // rail, platforms, tramway and pit - not from hand-typed world coordinates.
  // -------------------------------------------------------------
  const camera: CameraAdapter = {
    setMode(mode) {
      ctx.followTrain(mode === "FOLLOW");
    },

    async transitionToPath(pathId, durationMs) {
      ctx.followTrain(false);
      if (pathId.includes("station") || pathId.includes("arrival")) await shot(ctx.kimberley.shots.arrivalWide(), durationMs);
      else if (pathId.includes("heritage")) await shot(ctx.kimberley.shots.heritageWide(), durationMs);
      else if (pathId.includes("hole")) await shot(ctx.kimberley.shots.bigHoleReveal(), durationMs);
    },

    async playPath(pathId, signal) {
      if (signal?.aborted) return;
      ctx.followTrain(false);
      if (pathId.includes("station")) {
        // A tracking run down the platform while the train draws in.
        await shot(ctx.kimberley.shots.arrivalTrack(0), 700);
        const steps = 30, stepMs = 60;
        for (let i = 1; i <= steps; i++) {
          if (signal?.aborted) return;
          void shot(ctx.kimberley.shots.arrivalTrack(i / steps), stepMs);
          await clock.sleep(stepMs, signal);
        }
      } else if (pathId.includes("heritage")) {
        await shot(ctx.kimberley.shots.heritageWide(), 1400);
        await shot(ctx.kimberley.shots.heritageStreet(), 1600);
      } else if (pathId.includes("hole")) {
        await shot(ctx.kimberley.shots.bigHoleCrane(), 1600);
      } else if (pathId.includes("return")) {
        await shot(ctx.kimberley.shots.returnHigh(), 1400);
        await shot(ctx.followPose(), 1000);
      }
    },

    async playPathWithProgress(pathId, onProgress, signal) {
      if (signal?.aborted) return;
      ctx.followTrain(false);
      const steps = 48, stepMs = 70;
      for (let i = 0; i <= steps; i++) {
        if (signal?.aborted) return;
        const progress = i / steps;
        void shot(ctx.kimberley.shots.descent(progress), stepMs);
        await onProgress(progress);
        await clock.sleep(stepMs, signal);
      }
    },

    setCinematicBars(visible) {
      ctx.uiElements.cinematicTopBar.style.transform = visible ? "translateY(0)" : "translateY(-100%)";
      ctx.uiElements.cinematicBottomBar.style.transform = visible ? "translateY(0)" : "translateY(100%)";
      document.body.classList.toggle("cinematic", visible);
    },

    shake(intensity01, durationMs) {
      ctx.shakeCamera(intensity01, durationMs);
    },

    async returnToTrain(durationMs) {
      await shot(ctx.followPose(), durationMs);
      ctx.followTrain(true);
    }
  };

  // -------------------------------------------------------------
  // 2. TRAIN ADAPTER
  // -------------------------------------------------------------
  const train: TrainAdapter = {
    setTargetSpeedKph(speed) {
      ctx.trainState.targetSpeedKph = speed;
    },

    async waitUntilSpeedAtMost(speed, signal) {
      while (ctx.trainState.speedKph > speed) {
        if (signal?.aborted) return;
        await clock.sleep(100, signal);
      }
    },

    async waitUntilStopped(signal) {
      ctx.trainState.targetSpeedKph = 0;
      while (ctx.trainState.speedKph > 0.5) {
        if (signal?.aborted) return;
        await clock.sleep(100, signal);
      }
      ctx.trainState.speedKph = 0;
    },

    setVisible(visible) {
      ctx.trainState.visible = visible;
      ctx.kimberley.trainRoot.visible = visible;
    }
  };

  // -------------------------------------------------------------
  // 3. WORLD ADAPTER
  // -------------------------------------------------------------
  let eraTween = 0;
  /** Ease the era blend to a target. A newer tween supersedes an older one. */
  const tweenEra = (target: number, durationMs: number) => new Promise<void>(resolve => {
    const id = ++eraTween, from = ctx.kimberley.eraBlend, start = ctx.now();
    if (durationMs <= 0 || from === target) { ctx.kimberley.setEraBlend(target); resolve(); return; }
    const step = () => {
      if (id !== eraTween) { resolve(); return; }
      const t = Math.min(1, (ctx.now() - start) / durationMs);
      ctx.kimberley.setEraBlend(from + (target - from) * (t * t * (3 - 2 * t)));
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  const world: WorldAdapter = {
    async setCityProfile() {},

    async preloadAsset() {
      // The world is built up front from local data; nothing streams.
    },

    async setSceneGroupVisibility(groupId, visible, durationMs = 0) {
      // Modern and heritage are two ends of one blend, not two switches:
      // toggling them hid the town before the heritage materials had faded in.
      if (groupId === "kimberley-heritage") {
        await tweenEra(visible ? 1 : 0, durationMs);
      } else if (groupId === "kimberley-modern") {
        await tweenEra(visible ? 0 : 1, durationMs);
      } else if (groupId === "kimberley-big-hole") {
        ctx.kimberley.bigHoleGroup.visible = visible;
      }
    },

    async setEnvironmentState() {},

    async activateHeroScene() {
      ctx.kimberley.bigHoleGroup.visible = true;
    },

    async deactivateHeroScene() {
      // The pit stays: it is part of the town, not a set piece.
    },

    setEraBlend(blend01) {
      eraTween++;
      ctx.kimberley.setEraBlend(blend01);
      ctx.uiElements.timeMachineSlider.value = String(blend01);
      ctx.uiElements.timeMachineLabel.textContent = blend01 > 0.5 ? "1880s Diamond Rush" : "Present Day";
    },

    setLightingPreset(presetId) {
      ctx.setTimeOfDay(timeForPreset(presetId));
    }
  };

  // -------------------------------------------------------------
  // 4. TRAM ADAPTER
  // -------------------------------------------------------------
  /** Beside the tram, a little ahead, looking back along the car and past it. */
  const tramShot = (): Shot => {
    const f = ctx.kimberley.tramFrame();
    return {
      position: f.origin.clone().addScaledVector(f.forward, 9).addScaledVector(f.side, 6.5).setY(f.origin.y + 3.6),
      target: f.origin.clone().addScaledVector(f.forward, -4).setY(f.origin.y + 2),
    };
  };
  const tram: TramAdapter = {
    async spawn() {
      ctx.kimberley.tramRoot.visible = true;
      ctx.kimberley.setTramProgress(0);
    },

    async boardCamera() {
      ctx.followTrain(false);
      await shot(tramShot(), 900);
    },

    async followRoute(routeId, durationMs, signal) {
      const steps = 30;
      const stepMs = durationMs / steps;
      for (let i = 0; i <= steps; i++) {
        if (signal?.aborted) return;
        ctx.kimberley.setTramProgress(i / steps);
        await clock.sleep(stepMs, signal);
      }
    },

    async followRouteWithProgress(routeId, durationMs, onProgress, signal) {
      const steps = 60;
      const stepMs = durationMs / steps;
      for (let i = 0; i <= steps; i++) {
        if (signal?.aborted) return;
        const progress = i / steps;
        ctx.kimberley.setTramProgress(progress);
        void shot(tramShot(), stepMs);
        await onProgress(progress);
        await clock.sleep(stepMs, signal);
      }
    },

    async despawn() {
      ctx.kimberley.tramRoot.visible = false;
    }
  };

  // -------------------------------------------------------------
  // 5. AUDIO ADAPTER
  // The train itself is TrainSound, fed every frame from ctx.audioState. Cues
  // are short Web Audio syntheses on one shared context.
  // -------------------------------------------------------------
  let cueContext: AudioContext | null = null;
  const cues = () => {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    cueContext ??= new AudioContext();
    if (cueContext.state === "suspended") void cueContext.resume();
    return cueContext;
  };
  const tone = (actx: AudioContext, type: OscillatorType, from: number, to: number, level: number, seconds: number, delay = 0) => {
    const osc = actx.createOscillator(), gain = actx.createGain();
    const t = actx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + seconds * 0.8);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(actx.destination);
    osc.start(t); osc.stop(t + seconds);
  };
  const audio: AudioAdapter = {
    setEnvironment(environment) {
      ctx.audioState.environment = environment;
    },

    setCameraMode(mode) {
      ctx.audioState.cameraMode = mode;
    },

    playCue(cueId) {
      const actx = cues();
      if (!actx) return;
      try {
        if (cueId === "tram-bell") {
          // Ding-ding: two strikes of a bell, the second a touch higher.
          tone(actx, "triangle", 1480, 1470, 0.25, 0.6);
          tone(actx, "triangle", 1760, 1750, 0.22, 0.7, 0.28);
        } else if (cueId === "diamond-discovery") {
          tone(actx, "sine", 880, 2640, 0.2, 0.7);
          tone(actx, "sine", 1320, 3960, 0.1, 0.8, 0.08);
        } else if (cueId === "station-stop") {
          // Brake release: a falling hiss approximated by a detuned sweep.
          tone(actx, "sawtooth", 420, 90, 0.05, 0.9);
        } else if (cueId === "tram-board" || cueId === "return-whoosh") {
          tone(actx, "triangle", 240, 110, 0.12, 0.45);
        }
      } catch {
        // A blocked audio context costs the cue, never the chapter.
      }
    },

    fadeScene() {},

    duckTrain(target01) {
      ctx.audioState.trainLevel = THREE.MathUtils.clamp(target01, 0, 1);
    }
  };

  // -------------------------------------------------------------
  // 6. UI ADAPTER
  // -------------------------------------------------------------
  let timeMachineCallback: ((blend01: number) => Promise<void> | void) | null = null;

  ctx.uiElements.timeMachineSlider.addEventListener("input", (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    ctx.kimberley.setEraBlend(val);
    ctx.uiElements.timeMachineLabel.textContent = val > 0.5 ? "1880s Heritage Rush" : "Present Day";
    timeMachineCallback?.(val);
  });

  const ui: UiAdapter = {
    setChapterTitle(title, subtitle) {
      // Same structure as the page's own banner, so it keeps its styling.
      const heading = document.createElement("h1"), line = document.createElement("p");
      heading.textContent = title; line.textContent = subtitle ?? "";
      ctx.uiElements.chapterBanner.replaceChildren(heading, line);
      ctx.uiElements.chapterBanner.style.opacity = "1";
    },

    setPhase(phase: KimberleyPhase) {
      ctx.uiElements.phaseBadge.textContent = phase.replace(/_/g, " ");
    },

    async showLocationCard(title, body, durationMs = 2400) {
      ctx.uiElements.locationTitle.textContent = title;
      ctx.uiElements.locationBody.textContent = body ?? "";
      ctx.uiElements.locationCard.style.display = "block";
      ctx.uiElements.locationCard.style.opacity = "1";
      await clock.sleep(durationMs);
      ctx.uiElements.locationCard.style.opacity = "0";
      setTimeout(() => {
        if (ctx.uiElements.locationCard.style.opacity === "0") {
          ctx.uiElements.locationCard.style.display = "none";
        }
      }, 400);
    },

    showHistoricalBeat(beat: HistoricalBeat) {
      ctx.uiElements.historicalYear.textContent = String(beat.year);
      ctx.uiElements.historicalTitle.textContent = beat.title;
      ctx.uiElements.historicalBody.textContent = beat.body;
      ctx.uiElements.historicalCard.style.display = "block";
      ctx.uiElements.historicalCard.style.opacity = "1";
    },

    clearHistoricalBeat() {
      ctx.uiElements.historicalCard.style.opacity = "0";
      setTimeout(() => {
        ctx.uiElements.historicalCard.style.display = "none";
      }, 300);
    },

    setTimeMachineState(blend01, label) {
      ctx.uiElements.timeMachinePanel.style.display = "flex";
      ctx.uiElements.timeMachineSlider.value = String(blend01);
      ctx.uiElements.timeMachineLabel.textContent = label;
    },

    async runTimeMachineControl(onChange, signal) {
      timeMachineCallback = onChange;
      ctx.uiElements.timeMachinePanel.style.display = "flex";
      // Animate the slider smoothly from 0 to 1 over 2.4 seconds
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        if (signal?.aborted) break;
        const blend = i / steps;
        ctx.kimberley.setEraBlend(blend);
        ctx.uiElements.timeMachineSlider.value = String(blend);
        ctx.uiElements.timeMachineLabel.textContent = blend > 0.5 ? "1880s Diamond Rush" : "Present Day";
        await onChange(blend);
        await clock.sleep(80, signal);
      }
    },

    async requestDiamondInteraction(prompt, signal) {
      // Waits for the viewer: no timeout (WCAG 2.2.1). Focus moves in, and
      // back to where it was when the prompt closes.
      const box = ctx.uiElements.diamondPrompt;
      const opener = document.activeElement as HTMLElement | null;
      const heading = document.createElement("strong");
      heading.id = "diamond-prompt-title";
      heading.textContent = "✨ Discover the Kimberlite Diamond";
      const text = document.createElement("p");
      text.textContent = prompt;
      const act = document.createElement("button");
      act.textContent = "Discover Diamond";
      const skip = document.createElement("button");
      skip.textContent = "Continue";
      box.setAttribute("aria-labelledby", heading.id);
      box.replaceChildren(heading, text, act, " ", skip);
      if (signal?.aborted) return "skipped";
      box.style.display = "block";
      act.focus();
      return new Promise<"activated" | "skipped">((resolve) => {
        const close = (result: "activated" | "skipped") => {
          box.style.display = "none";
          signal?.removeEventListener("abort", onAbort);
          box.removeEventListener("keydown", onKey);
          opener?.focus?.();
          resolve(result);
        };
        const onAbort = () => close("skipped");
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close("skipped"); };
        act.addEventListener("click", () => close("activated"), { once: true });
        skip.addEventListener("click", () => close("skipped"), { once: true });
        box.addEventListener("keydown", onKey);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },

    async showDiamondMessage(title, body) {
      ctx.uiElements.diamondCard.innerHTML = `<h3>${title}</h3><p>${body}</p>`;
      ctx.uiElements.diamondCard.style.display = "block";
      await clock.sleep(2200);
      ctx.uiElements.diamondCard.style.display = "none";
    },

    async showPassportStamp(stampId, label) {
      ctx.uiElements.passportStamp.textContent = `✓ ${label}`;
      ctx.uiElements.passportModal.style.display = "block";
      await clock.sleep(3000);
      ctx.uiElements.passportModal.style.display = "none";
    },

    showToast(message, tone = "INFO") {
      ctx.uiElements.toast.textContent = message;
      ctx.uiElements.toast.dataset.tone = tone;
      ctx.uiElements.toast.style.display = "block";
      setTimeout(() => {
        ctx.uiElements.toast.style.display = "none";
      }, 2500);
    },

    setProgress(progress01) {
      ctx.uiElements.progressBar.style.width = `${Math.round(progress01 * 100)}%`;
    },

    completeChapter(label) {
      this.showToast?.(`Chapter Complete · ${label}`, "SUCCESS");
    }
  };

  // -------------------------------------------------------------
  // 7. EFFECTS ADAPTER
  // -------------------------------------------------------------
  const effects: EffectsAdapter = {
    async play(effectId, params) {
      if (effectId.includes("diamond")) {
        // The scene owns the light's pulse, so the flash is a boost it decays.
        ctx.kimberley.flashDiamond();
      }
    }
  };

  // -------------------------------------------------------------
  // 8. CAPTURE ADAPTER (Tram Postcard)
  // -------------------------------------------------------------
  const capture: CaptureAdapter = {
    async captureMoment(momentId) {
      console.log(`[Capture] Kimberley Postcard Captured: ${momentId}`);
      try {
        // Render and read back in one task: the drawing buffer is not
        // preserved between frames (preserving it costs every frame).
        ctx.renderer.render(ctx.scene, ctx.camera);
        const dataUrl = ctx.renderer.domElement.toDataURL("image/webp", 0.85);
        return dataUrl;
      } catch {
        return undefined;
      }
    }
  };

  // -------------------------------------------------------------
  // 9. REWARDS ADAPTER (Passport Stamp)
  // -------------------------------------------------------------
  const rewards: RewardsAdapter = {
    async unlock(stampId, metadata) {
      console.log(`[Rewards] Unlocked Rail Passport Stamp: ${stampId}`, metadata);
      await ui.showPassportStamp?.(stampId, "Kimberley · Rails to Diamonds");
    }
  };

  // -------------------------------------------------------------
  // 10. PERFORMANCE ADAPTER
  // -------------------------------------------------------------
  const performanceAdapter: PerformanceAdapter = {
    getAverageFps() {
      return ctx.getFps();
    },
    setQualityTier(tier: QualityTier) {
      // Resolution is the cheapest lever and the one that scales with the
      // Big Hole's fill cost; geometry is already instanced throughout.
      const ceiling = { LOW: 0.75, MEDIUM: 1, HIGH: 1.5, ULTRA: 2 }[tier] ?? 1;
      ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ceiling));
    }
  };

  return {
    clock,
    camera,
    train,
    world,
    tram,
    audio,
    ui,
    effects,
    capture,
    rewards,
    performance: performanceAdapter,
    preferences: ctx.preferences,
  };
}
