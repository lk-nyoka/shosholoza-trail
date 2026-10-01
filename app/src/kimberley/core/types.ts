export type KimberleyPhase =
  | "IDLE"
  | "PRELOAD"
  | "APPROACH"
  | "STATION_ARRIVAL"
  | "HERITAGE_MORPH"
  | "HERITAGE_TIME_MACHINE"
  | "TRAM_BOARDING"
  | "TRAM_RIDE"
  | "TRAM_PHOTO_MOMENT"
  | "BIG_HOLE_REVEAL"
  | "BIG_HOLE_DESCENT"
  | "DIAMOND_INTERACTION"
  | "RETURN_TO_TRAIN"
  | "CHAPTER_REWARD"
  | "RECOVERY"
  | "COMPLETE";

export type QualityTier = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";

export interface ExperiencePreferences {
  reducedMotion?: boolean;
  captions?: boolean;
  storyDepth?: "QUICK" | "STANDARD" | "DEEP";
  interactionMode?: "AUTO" | "INTERACTIVE";
  preferredQuality?: QualityTier | "AUTO";
}

export interface CameraPathKeyframe {
  timeMs: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov?: number;
}

export interface HistoricalBeat {
  year: number;
  title: string;
  body: string;
  depth01: number;
  audioCue?: string;
  effectId?: string;
}

export interface ChapterStatus {
  phase: KimberleyPhase;
  startedAtMs: number | null;
  completedAtMs: number | null;
  qualityTier?: QualityTier;
  usedFallback?: boolean;
}

export interface ChapterSummary {
  city: string;
  label: string;
  discoveries: string[];
  stampId: string;
  usedFallback: boolean;
}

export interface DirectorSnapshot {
  phase: KimberleyPhase;
  environment: string;
  cameraMode: string;
  heroSceneActive: boolean;
}
