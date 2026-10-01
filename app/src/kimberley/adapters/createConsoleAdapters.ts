import { DefaultClock } from "../core/DefaultClock.js";
import type { KimberleyAdapters } from "./contracts.js";

const log = (...args: unknown[]) => console.log("[Kimberley demo]", ...args);

export function createConsoleAdapters(): KimberleyAdapters {
  return {
    clock: new DefaultClock(),
    preferences: {
      interactionMode: "AUTO",
      preferredQuality: "HIGH",
      storyDepth: "STANDARD",
    },

    camera: {
      setMode: async (mode) => log("camera mode", mode),
      transitionToPath: async (path, duration) => log("camera transition", path, duration),
      playPath: async (path) => log("play camera path", path),
      playPathWithProgress: async (path, onProgress) => {
        log("play camera path with progress", path);
        for (const progress of [0, 0.2, 0.4, 0.7, 0.95, 1]) await onProgress(progress);
      },
      cutToPath: async (path) => log("camera cut", path),
      setCinematicBars: async (visible) => log("camera bars", visible),
      shake: async (intensity, duration) => log("shake", intensity, duration),
      returnToTrain: async (duration) => log("return camera to train", duration),
    },

    train: {
      setTargetSpeedKph: async (speed) => log("train target speed", speed),
      waitUntilSpeedAtMost: async (speed) => log("wait speed <=", speed),
      waitUntilStopped: async () => log("train stopped"),
      setVisible: async (visible) => log("train visible", visible),
    },

    world: {
      setCityProfile: async (id) => log("city profile", id),
      preloadAsset: async (id) => log("preload", id),
      unloadAsset: async (id) => log("unload", id),
      setSceneGroupVisibility: async (id, visible, fade) => log("group", id, visible, fade),
      setEnvironmentState: async (id, transition) => log("environment", id, transition),
      activateHeroScene: async (id) => log("activate hero", id),
      deactivateHeroScene: async (id) => log("deactivate hero", id),
      activateFallbackScene: async (id) => log("activate fallback", id),
      deactivateFallbackScene: async (id) => log("deactivate fallback", id),
      setEraBlend: async (value) => log("era blend", value),
      setLightingPreset: async (id, t) => log("lighting", id, t),
      setPostProcessingPreset: async (id, t) => log("post", id, t),
      setWeatherPreset: async (id, t) => log("weather", id, t),
    },

    tram: {
      spawn: async (id) => log("spawn tram", id),
      boardCamera: async () => log("tram board camera"),
      followRoute: async (id, duration) => log("tram route", id, duration),
      followRouteWithProgress: async (id, duration, onProgress) => {
        log("tram route progress", id, duration);
        for (const progress of [0, 0.2, 0.5, 0.8, 1]) await onProgress(progress);
      },
      setSpeedScale: async (scale) => log("tram speed scale", scale),
      despawn: async () => log("despawn tram"),
    },

    audio: {
      setEnvironment: async (id) => log("audio environment", id),
      setCameraMode: async (mode) => log("audio camera mode", mode),
      playCue: async (cue) => log("audio cue", cue),
      fadeScene: async (scene, value, duration) => log("audio fade", scene, value, duration),
      setMusicState: async (id, t) => log("music", id, t),
      setReverbZone: async (id, wet, t) => log("reverb", id, wet, t),
      duckTrain: async (value, t) => log("duck train", value, t),
    },

    ui: {
      setChapterTitle: async (title, subtitle) => log("title", title, subtitle),
      setPhase: async (phase) => log("phase", phase),
      showLocationCard: async (title, body, duration) => log("location card", title, body, duration),
      showHistoricalBeat: async (beat) => log("history", beat.year, beat.title),
      clearHistoricalBeat: async () => log("clear history"),
      showCaption: async (text, duration) => log("caption", text, duration),
      setCinematicBars: async (visible) => log("ui bars", visible),
      setTimeMachineState: async (blend, label) => log("time machine", blend, label),
      requestDiamondInteraction: async () => "activated",
      showDiamondMessage: async (title, body) => log("diamond message", title, body),
      showDiscoveryCard: async (title, body, icon) => log("discovery", title, body, icon),
      showPassportStamp: async (id, label) => log("stamp", id, label),
      showChapterSummary: async (summary) => log("summary", summary),
      showToast: async (message, tone) => log("toast", tone, message),
      setProgress: async (p) => log("progress", p),
      completeChapter: async (label) => log(label),
    },

    effects: {
      play: async (effect, params) => log("effect", effect, params ?? {}),
      stop: async (effect) => log("stop effect", effect),
    },

    capture: {
      captureMoment: async (id, metadata) => log("capture", id, metadata ?? {}),
    },

    rewards: {
      unlock: async (id, metadata) => log("reward", id, metadata ?? {}),
    },

    performance: {
      getAverageFps: () => 60,
      setQualityTier: async (tier) => log("quality", tier),
    },

    analytics: {
      event: (name, data) => log("analytics", name, data ?? {}),
    },
  };
}
