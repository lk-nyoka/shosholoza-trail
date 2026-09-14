// ── Domain types ─────────────────────────────────────────

export type PlaceType = "attraction" | "vendor";

export interface Place {
  id: string;
  name: string;
  category: string;
  type: PlaceType;
  distance: string;
  rating: number;
  price?: string;
  blurb: string;
  image: string;
  featured?: boolean;
}

export interface Stop {
  id: string;
  name: string;
  province: string;
  km: number;
  lat: number;
  lon: number;
  teaser: string;
  places: Place[];
}

export interface RailNode {
  name: string;
  km: number;
  lat: number;
  lon: number;
  station?: boolean;
}

// ── API types ─────────────────────────────────────────────

export type JourneyState = "scheduled" | "moving" | "delayed" | "disrupted" | "arrived";
export type Confidence = "none" | "low" | "medium" | "high";
export type DataMode = "passenger_pings" | "demo_baseline";

export interface Disruption {
  id: number;
  kind: string;
  start_km: number;
  end_km: number;
  title: string;
  message: string;
  shuttle_stop: string | null;
  shuttle_departure: string | null;
}

export interface JourneyStatus {
  journey_id: string;
  state: JourneyState;
  current_km: number;
  total_km: number;
  rolling_speed_kmh: number | null;
  eta_minutes: number | null;
  confidence: Confidence;
  recent_ping_count: number;
  last_ping_at: string | null;
  data_mode: DataMode;
  disruption: Disruption | null;
}

export interface PingAccepted {
  accepted: true;
  ping_id: number;
  route_km: number;
  distance_from_route_km: number;
  journey_status: JourneyStatus;
}

// ── UI state types ────────────────────────────────────────

export type PingState = "idle" | "locating" | "shared" | "error";

export type LatLng = [number, number];

export type PlaybackSpeed = 1 | 4 | 12;
