import { DefaultClock } from "../core/DefaultClock.js";
import type { CapeTownAdapters } from "./contracts.js";

const log = (...args: unknown[]) => console.log("[Cape Town demo]", ...args);

export function createConsoleAdapters(): CapeTownAdapters {
  return {
    clock: new DefaultClock(),

    camera: {
      setMode: async (m) => log("camera mode", m),
      transitionToPath: async (p, d) => log("camera transition", p, d),
      playPath: async (p) => log("camera path", p),
      playPathWithProgress: async (p, cb) => {
        log("camera progress path", p);
        [0, .25, .5, .75, 1].forEach(cb);
      },
      returnToTrain: async (d) => log("return to train", d),
    },

    train: {
      setTargetSpeedKph: async (s) => log("train speed", s),
      waitUntilStopped: async () => log("train stopped"),
      setVisible: async (v) => log("train visible", v),
    },

    world: {
      setCityProfile: async (id) => log("city profile", id),
      preloadAsset: async (id) => log("preload", id),
      releaseAsset: async (id) => log("release", id),
      activateHeroScene: async (id) => log("hero on", id),
      deactivateHeroScene: async (id) => log("hero off", id),
      setSceneGroupVisibility: async (id, visible, fade) => log("group", id, visible, fade),
      setEnvironmentState: async (id, d) => log("environment", id, d),
      setTimeOfDay: async (v, d) => log("time", v, d),
      setWeatherPreset: async (id, d) => log("weather", id, d),
      setOceanIntensity: async (v, d) => log("ocean", v, d),
      setMountainCloudAmount: async (v, d) => log("clouds", v, d),
      setBoKaapColourFocus: async (v, d) => log("bo-kaap focus", v, d),
      setQuality: async (q) => log("quality", q),
    },

    routeFollower: {
      spawnVehicle: async (asset, route) => log("spawn", asset, route),
      follow: async (route, d) => log("follow", route, d),
      followWithProgress: async (route, d, cb) => {
        log("follow progress", route, d);
        [0, .2, .4, .6, .8, 1].forEach(cb);
      },
      despawnVehicle: async (id) => log("despawn", id),
    },

    audio: {
      setEnvironment: async (e) => log("audio environment", e),
      setCameraMode: async (m) => log("audio camera", m),
      playCue: async (id) => log("audio cue", id),
      fadeScene: async (id, v, d) => log("audio fade", id, v, d),
    },

    ui: {
      setChapterTitle: async (t, s) => log("title", t, s),
      setPhase: async (p) => log("phase", p),
      setProgress: async (p) => log("progress", p),
      showLocationCard: async (t, b, d) => log("location", t, b, d),
      showStoryCard: async (t, b, d) => log("story", t, b, d),
      showPanorama: async (points) => log("panorama", points.map((p) => p.label)),
      hidePanorama: async () => log("hide panorama"),
      showFinaleMoment: async (m) => log("finale", m.title),
      showJourneyRecap: async (stops) => log("recap", stops.map((s) => s.city)),
      unlockPassportStamp: async (id, label) => log("stamp", id, label),
      showCompletion: async (t, s) => log("completion", t, s),
      showRecoveryNotice: async (m) => log("recovery", m),
    },

    effects: {
      play: async (id, options) => log("effect", id, options ?? {}),
      stop: async (id) => log("effect stop", id),
    },

    capture: {
      captureMoment: async (id, meta) => log("capture", id, meta ?? {}),
    },

    analytics: {
      event: (name, data) => log("analytics", name, data ?? {}),
    },
  };
}
