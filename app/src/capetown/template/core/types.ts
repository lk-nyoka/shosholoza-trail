export type CapeTownPhase =
  | "IDLE"
  | "PRELOAD"
  | "MOUNTAIN_APPROACH"
  | "STATION_ARRIVAL"
  | "CITY_UNFOLD"
  | "BO_KAAP"
  | "CABLEWAY_TRANSFER"
  | "CABLEWAY_ASCENT"
  | "SUMMIT_REVEAL"
  | "PANORAMA_DISCOVERY"
  | "MOUNTAIN_TO_SEA"
  | "WATERFRONT"
  | "SUNSET_FINALE"
  | "JOURNEY_RECAP"
  | "REWARD"
  | "COMPLETE"
  | "RECOVERY";

export type QualityLevel = "LOW" | "MEDIUM" | "HIGH" | "ULTRA";

export interface ChapterStatus {
  phase: CapeTownPhase;
  startedAtMs: number | null;
  completedAtMs: number | null;
  recoveryUsed: boolean;
}

export interface CameraPathKeyframe {
  timeMs: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov?: number;
}

export interface PanoramaPoint {
  id: string;
  label: string;
  coordinates: [number, number];
  description: string;
  category: "city" | "mountain" | "ocean" | "heritage" | "island";
}

export interface JourneyStopSummary {
  id: string;
  city: string;
  label: string;
  icon?: string;
  completed: boolean;
}

export interface FinaleMoment {
  id: string;
  title: string;
  subtitle?: string;
  mediaKey?: string;
}
