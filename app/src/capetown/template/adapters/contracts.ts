import type {
  CameraPathKeyframe,
  CapeTownPhase,
  FinaleMoment,
  JourneyStopSummary,
  PanoramaPoint,
  QualityLevel,
} from "../core/types.js";

export interface ClockAdapter {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface CameraAdapter {
  setMode(mode: "FOLLOW" | "WINDOW" | "CINEMATIC" | "FREE" | "PANORAMA"): Promise<void> | void;
  transitionToPath(pathId: string, durationMs: number): Promise<void>;
  playPath(pathId: string, signal?: AbortSignal): Promise<void>;
  playPathWithProgress?(
    pathId: string,
    onProgress: (progress01: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  playKeyframes?(keyframes: CameraPathKeyframe[], signal?: AbortSignal): Promise<void>;
  orbitTarget?(targetId: string, durationMs: number, signal?: AbortSignal): Promise<void>;
  returnToTrain?(durationMs: number): Promise<void>;
}

export interface TrainAdapter {
  setTargetSpeedKph(speed: number): Promise<void> | void;
  waitUntilStopped(signal?: AbortSignal): Promise<void>;
  setVisible(visible: boolean): Promise<void> | void;
}

export interface WorldAdapter {
  setCityProfile(profileId: string): Promise<void>;
  preloadAsset(assetId: string): Promise<void>;
  releaseAsset?(assetId: string): Promise<void>;
  activateHeroScene(sceneId: string): Promise<void>;
  deactivateHeroScene(sceneId: string): Promise<void>;
  setSceneGroupVisibility(groupId: string, visible: boolean, fadeMs?: number): Promise<void>;
  setEnvironmentState(stateId: string, transitionMs?: number): Promise<void>;
  setTimeOfDay?(time01: number, durationMs?: number): Promise<void>;
  setWeatherPreset?(presetId: string, durationMs?: number): Promise<void>;
  setOceanIntensity?(value01: number, durationMs?: number): Promise<void>;
  setMountainCloudAmount?(value01: number, durationMs?: number): Promise<void>;
  setBoKaapColourFocus?(value01: number, durationMs?: number): Promise<void>;
  setQuality?(quality: QualityLevel): Promise<void>;
}

export interface RouteFollowerAdapter {
  spawnVehicle(assetId: string, routeId: string): Promise<void>;
  follow(
    routeId: string,
    durationMs: number,
    signal?: AbortSignal,
  ): Promise<void>;
  followWithProgress?(
    routeId: string,
    durationMs: number,
    onProgress: (progress01: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  despawnVehicle(assetId: string): Promise<void>;
}

export interface AudioAdapter {
  setEnvironment(
    environment:
      | "OPEN"
      | "CITY"
      | "STATION"
      | "MOUNTAIN"
      | "CABLEWAY"
      | "SUMMIT"
      | "WATERFRONT"
      | "OCEAN",
  ): Promise<void> | void;
  setCameraMode(
    mode: "FOLLOW" | "WINDOW" | "CINEMATIC" | "STATION" | "FREE" | "PANORAMA",
  ): Promise<void> | void;
  playCue(cueId: string): Promise<void> | void;
  fadeScene(sceneId: string, target01: number, durationMs: number): Promise<void> | void;
}

export interface UiAdapter {
  setChapterTitle(title: string, subtitle?: string): Promise<void> | void;
  setPhase(phase: CapeTownPhase): Promise<void> | void;
  setProgress(progress01: number): Promise<void> | void;
  showLocationCard(title: string, body?: string, durationMs?: number): Promise<void>;
  showStoryCard(title: string, body: string, durationMs?: number): Promise<void>;
  showPanorama(points: PanoramaPoint[], signal?: AbortSignal): Promise<void>;
  hidePanorama(): Promise<void> | void;
  showFinaleMoment(moment: FinaleMoment): Promise<void>;
  showJourneyRecap(stops: JourneyStopSummary[]): Promise<void>;
  requestContinue?(label: string, signal?: AbortSignal): Promise<void>;
  unlockPassportStamp(cityId: string, label: string): Promise<void>;
  showCompletion(title: string, subtitle?: string): Promise<void>;
  showRecoveryNotice?(message: string): Promise<void>;
}

export interface EffectsAdapter {
  play(effectId: string, options?: Record<string, unknown>): Promise<void>;
  stop?(effectId: string): Promise<void>;
}

export interface CaptureAdapter {
  captureMoment?(id: string, metadata?: Record<string, unknown>): Promise<void>;
}

export interface AnalyticsAdapter {
  event(name: string, data?: Record<string, unknown>): void;
}

export interface CapeTownAdapters {
  clock: ClockAdapter;
  camera: CameraAdapter;
  train: TrainAdapter;
  world: WorldAdapter;
  routeFollower: RouteFollowerAdapter;
  audio: AudioAdapter;
  ui: UiAdapter;
  effects: EffectsAdapter;
  capture?: CaptureAdapter;
  analytics?: AnalyticsAdapter;
}
