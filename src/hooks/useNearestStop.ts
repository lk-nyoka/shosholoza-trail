/**
 * useNearestStop — Geolocation auto-board hook
 *
 * On mount (or on explicit `request()` call) asks for the device position,
 * snaps it to the nearest point on the mapped rail corridor, and returns
 * the corresponding route km so the Live Journey page can auto-position.
 *
 * Uses the same haversine + rail-node interpolation logic as the backend.
 */
import { useCallback, useRef, useState } from "react";
import { stops } from "../data";
import type { Stop } from "../types";

export type GeoState =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "snapped"; km: number; stop: Stop; accuracyM: number }
  | { phase: "error"; reason: string };

const R = 6371.0088;

function haversineDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Find the stop whose km value is closest to a given lat/lon. */
function snapToCorridorKm(lat: number, lon: number): { km: number; stop: Stop } {
  let best = stops[0];
  let bestDist = Infinity;
  for (const stop of stops) {
    const d = haversineDeg(lat, lon, stop.lat, stop.lon);
    if (d < bestDist) { bestDist = d; best = stop; }
  }
  // Interpolate km between the snapped stop and its successor for smoother position
  const idx = stops.indexOf(best);
  const next = stops[idx + 1];
  if (next) {
    const dBest = haversineDeg(lat, lon, best.lat, best.lon);
    const dNext = haversineDeg(lat, lon, next.lat, next.lon);
    const t = dBest / (dBest + dNext);
    const interpolatedKm = best.km + t * (next.km - best.km);
    return { km: Math.round(interpolatedKm * 10) / 10, stop: best };
  }
  return { km: best.km, stop: best };
}

export function useNearestStop() {
  const [state, setState] = useState<GeoState>({ phase: "idle" });
  const watchRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ phase: "error", reason: "Geolocation is not supported by this browser." });
      return;
    }
    setState({ phase: "locating" });
    stopWatch();

    // Single high-accuracy fix first
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const { km, stop } = snapToCorridorKm(latitude, longitude);
        setState({ phase: "snapped", km, stop, accuracyM: Math.round(accuracy) });
      },
      (err) => {
        const reason =
          err.code === GeolocationPositionError.PERMISSION_DENIED
            ? "Location permission denied. Enable it in your browser settings."
            : err.code === GeolocationPositionError.TIMEOUT
            ? "Location request timed out. Please try again."
            : "Could not determine your location.";
        setState({ phase: "error", reason });
      },
      { enableHighAccuracy: true, timeout: 14000, maximumAge: 60000 }
    );
  }, [stopWatch]);

  return { state, request, stopWatch };
}
