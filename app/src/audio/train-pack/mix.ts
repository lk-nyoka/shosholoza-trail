import type { TrainAudioMix, TrainAudioState } from "./types.js";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Pure, deterministic mix calculation so it can be unit-tested outside the browser. */
export function computeTrainAudioMix(state: TrainAudioState): TrainAudioMix {
  const speed = Math.max(0, Number.isFinite(state.speedKph) ? state.speedKph : 0);
  const speed01 = clamp01(speed / 120);
  const acceleration = Number.isFinite(state.accelerationMps2) ? state.accelerationMps2 : 0;
  const cameraDistanceM = Math.max(0, Number.isFinite(state.cameraDistanceM) ? state.cameraDistanceM : 0);
  const masterGain = clamp01(state.masterVolume ?? 1);

  const distanceAtten = 1 / (1 + Math.max(0, cameraDistanceM - 8) / 45);

  let engineVolume = 0.10 + speed01 * 0.22 + Math.max(0, acceleration) * 0.03;
  let idleVolume = Math.max(0, 0.20 * (1 - speed01 * 1.35));
  let windVolume = Math.pow(speed01, 1.8) * 0.30;
  let rumbleVolume = 0.025 + speed01 * 0.23;

  if (state.cameraMode === "WINDOW") {
    engineVolume *= 0.56;
    idleVolume *= 0.55;
    windVolume *= 0.40;
    rumbleVolume *= 1.10;
  } else if (state.cameraMode === "CINEMATIC") {
    engineVolume *= 0.25;
    idleVolume *= 0.20;
    windVolume *= 0.28;
    rumbleVolume *= 0.34;
  } else if (state.cameraMode === "STATION") {
    engineVolume *= 0.48;
    windVolume *= 0.16;
    rumbleVolume *= 0.55;
  }

  if (state.atStation || state.environment === "STATION") {
    windVolume *= 0.20;
    rumbleVolume *= 0.45;
    idleVolume = Math.max(idleVolume, 0.12);
  }

  engineVolume *= distanceAtten;
  idleVolume *= distanceAtten;
  rumbleVolume *= distanceAtten;

  const tunnelWet = state.environment === "TUNNEL" ? 0.22 : 0;
  const bridgeVolume = state.environment === "BRIDGE" ? 0.20 * distanceAtten : 0;

  return {
    speed01,
    engineHz: 42 + speed01 * 82 + Math.max(0, acceleration) * 6,
    engineFilterHz: state.environment === "TUNNEL" ? 360 : 260 + speed01 * 720,
    engineVolume: clamp01(engineVolume),
    idleVolume: clamp01(idleVolume),
    windVolume: clamp01(windVolume),
    rumbleVolume: clamp01(rumbleVolume),
    bridgeVolume: clamp01(bridgeVolume),
    tunnelWet,
    masterGain,
  };
}
