import type { JourneyStatus, PingAccepted, Stop, Place } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

// ── Core fetch helper ────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Route geometry ───────────────────────────────────────

export interface RouteFeature {
  type: "Feature";
  properties: { journeyId: string; [k: string]: unknown };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export function fetchRoute(signal?: AbortSignal): Promise<RouteFeature> {
  return request<RouteFeature>("/route", { signal });
}

// ── Stops & places ───────────────────────────────────────

export function fetchStops(signal?: AbortSignal): Promise<Stop[]> {
  return request<Stop[]>("/stops", { signal });
}

export function fetchStop(stopId: string, signal?: AbortSignal): Promise<Stop> {
  return request<Stop>(`/stops/${stopId}`, { signal });
}

export function fetchPlaces(
  stopId: string,
  type?: "attraction" | "vendor",
  signal?: AbortSignal
): Promise<Place[]> {
  const qs = type ? `?type=${type}` : "";
  return request<Place[]>(`/stops/${stopId}/places${qs}`, { signal });
}

// ── Journey status ───────────────────────────────────────

export function fetchJourneyStatus(km: number, signal?: AbortSignal): Promise<JourneyStatus> {
  return request<JourneyStatus>(
    `/journeys/pretoria-cape-town/status?current_km=${km.toFixed(2)}`,
    { signal }
  );
}

// ── Telemetry ────────────────────────────────────────────

function sessionId(): string {
  const key = "shosholoza.session";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function postPassengerPing(position: GeolocationPosition): Promise<PingAccepted> {
  return request<PingAccepted>("/telemetry/pings", {
    method: "POST",
    body: JSON.stringify({
      journey_id: "pretoria-cape-town",
      session_id: sessionId(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_metres: position.coords.accuracy,
      speed_kmh:
        position.coords.speed == null ? null : position.coords.speed * 3.6,
    }),
  });
}
