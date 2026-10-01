import type {
  CameraPathKeyframe,
  ChapterSummary,
  ExperiencePreferences,
  HistoricalBeat,
  KimberleyPhase,
  QualityTier,
} from "../core/types.js";

export interface ClockAdapter {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface CameraAdapter {
  setMode(mode: "FOLLOW" | "WINDOW" | "CINEMATIC" | "FREE"): Promise<void> | void;
  transitionToPath(pathId: string, durationMs: number): Promise<void>;
  playPath(pathId: string, signal?: AbortSignal): Promise<void>;
  playPathWithProgress?(
    pathId: string,
    onProgress: (progress01: number) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void>;
  playKeyframes?(keyframes: CameraPathKeyframe[], signal?: AbortSignal): Promise<void>;
  cutToPath?(pathId: string): Promise<void> | void;
  setCinematicBars?(visible: boolean, durationMs?: number): Promise<void> | void;
  shake?(intensity01: number, durationMs: number): Promise<void> | void;
  returnToTrain(durationMs: number): Promise<void>;
}

export interface TrainAdapter {
  setTargetSpeedKph(speed: number): Promise<void> | void;
  waitUntilSpeedAtMost(speed: number, signal?: AbortSignal): Promise<void>;
  waitUntilStopped(signal?: AbortSignal): Promise<void>;
  setVisible(visible: boolean): Promise<void> | void;
}

export interface WorldAdapter {
  setCityProfile(profileId: string): Promise<void>;
  preloadAsset(assetId: string): Promise<void>;
  unloadAsset?(assetId: string): Promise<void>;
  setSceneGroupVisibility(groupId: string, visible: boolean, fadeMs?: number): Promise<void>;
  setEnvironmentState(stateId: string, transitionMs?: number): Promise<void>;
  activateHeroScene(sceneId: string): Promise<void>;
  deactivateHeroScene(sceneId: string): Promise<void>;
  activateFallbackScene?(sceneId: string): Promise<void>;
  deactivateFallbackScene?(sceneId: string): Promise<void>;
  setEraBlend?(blend01: number): Promise<void> | void;
  setLightingPreset?(presetId: string, transitionMs?: number): Promise<void> | void;
  setPostProcessingPreset?(presetId: string, transitionMs?: number): Promise<void> | void;
  setWeatherPreset?(presetId: string, transitionMs?: number): Promise<void> | void;
}

export interface TramAdapter {
  spawn(assetId: string): Promise<void>;
  boardCamera?(): Promise<void>;
  followRoute(routeId: string, durationMs: number, signal?: AbortSignal): Promise<void>;
  followRouteWithProgress?(
    routeId: string,
    durationMs: number,
    onProgress: (progress01: number) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void>;
  setSpeedScale?(scale: number): Promise<void> | void;
  despawn(): Promise<void>;
}

export interface AudioAdapter {
  setEnvironment(
    environment: "OPEN" | "CITY" | "STATION" | "BRIDGE" | "TUNNEL" | "CROSSING",
  ): Promise<void> | void;
  setCameraMode(
    mode: "FOLLOW" | "WINDOW" | "CINEMATIC" | "STATION" | "FREE",
  ): Promise<void> | void;
  playCue(cueId: string): Promise<void> | void;
  fadeScene(sceneId: string, target01: number, durationMs: number): Promise<void> | void;
  setMusicState?(stateId: string, transitionMs?: number): Promise<void> | void;
  setReverbZone?(zoneId: string, wet01: number, transitionMs?: number): Promise<void> | void;
  duckTrain?(target01: number, durationMs: number): Promise<void> | void;
}

export interface UiAdapter {
  setChapterTitle(title: string, subtitle?: string): Promise<void> | void;
  setPhase(phase: KimberleyPhase): Promise<void> | void;
  showLocationCard(title: string, body?: string, durationMs?: number): Promise<void>;
  showHistoricalBeat(beat: HistoricalBeat): Promise<void> | void;
  clearHistoricalBeat(): Promise<void> | void;
  showCaption?(text: string, durationMs?: number): Promise<void> | void;
  setCinematicBars?(visible: boolean, durationMs?: number): Promise<void> | void;
  setTimeMachineState?(blend01: number, label: string): Promise<void> | void;
  runTimeMachineControl?(
    onChange: (blend01: number) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void>;
  requestDiamondInteraction(
    prompt: string,
    signal?: AbortSignal,
  ): Promise<"activated" | "skipped">;
  showDiamondMessage(title: string, body: string): Promise<void>;
  showDiscoveryCard?(title: string, body: string, icon?: string): Promise<void>;
  showPassportStamp?(stampId: string, label: string): Promise<void>;
  showChapterSummary?(summary: ChapterSummary): Promise<void>;
  showToast?(message: string, tone?: "INFO" | "WARNING" | "SUCCESS"): Promise<void> | void;
  setProgress(progress01: number): Promise<void> | void;
  completeChapter(label: string): Promise<void> | void;
}

export interface EffectsAdapter {
  play(effectId: string, params?: Record<string, unknown>): Promise<void>;
  stop?(effectId: string): Promise<void>;
}

export interface CaptureAdapter {
  captureMoment(momentId: string, metadata?: Record<string, unknown>): Promise<string | void>;
}

export interface RewardsAdapter {
  unlock(stampId: string, metadata?: Record<string, unknown>): Promise<void>;
}

export interface PerformanceAdapter {
  getAverageFps?(): number | undefined;
  setQualityTier?(tier: QualityTier): Promise<void> | void;
}

export interface AnalyticsAdapter {
  event(name: string, data?: Record<string, unknown>): void;
}

export interface KimberleyAdapters {
  clock: ClockAdapter;
  camera: CameraAdapter;
  train: TrainAdapter;
  world: WorldAdapter;
  tram: TramAdapter;
  audio: AudioAdapter;
  ui: UiAdapter;
  effects: EffectsAdapter;
  capture?: CaptureAdapter;
  rewards?: RewardsAdapter;
  performance?: PerformanceAdapter;
  analytics?: AnalyticsAdapter;
  preferences?: ExperiencePreferences;
}
