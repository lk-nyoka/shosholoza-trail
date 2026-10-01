export type CameraMode =
  | "FOLLOW"
  | "WINDOW"
  | "CINEMATIC"
  | "STATION"
  | "FREE";

export type EnvironmentZone =
  | "OPEN"
  | "CITY"
  | "STATION"
  | "BRIDGE"
  | "TUNNEL"
  | "CROSSING";

export interface TrainAudioState {
  /** Authoritative scene distance, including seeks. */
  distanceM?: number;
  speedKph: number;
  accelerationMps2: number;
  brakeIntensity: number; // 0..1
  cameraMode: CameraMode;
  cameraDistanceM: number;
  environment: EnvironmentZone;
  atStation: boolean;
  masterVolume?: number; // 0..1
}

export interface TrainAudioMix {
  speed01: number;
  engineHz: number;
  engineFilterHz: number;
  engineVolume: number;
  idleVolume: number;
  windVolume: number;
  rumbleVolume: number;
  bridgeVolume: number;
  tunnelWet: number;
  masterGain: number;
}
