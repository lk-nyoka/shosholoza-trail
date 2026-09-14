import { useCallback, useEffect, useRef, useState } from "react";
import { stops } from "../data";
import { ROUTE, TOTAL_KM } from "../lib/routeIndex";
import type { Stop } from "../types";

const EARTH_RADIUS_KM = 6371.0088;
const SIGNAL_TIMEOUT_MS = 15000;
type Coordinate = readonly [number, number];

export type GpsStatus = "idle" | "locating" | "live" | "stale" | "denied" | "error";

export interface GpsTelemetry {
  status: GpsStatus;
  latitude: number | null;
  longitude: number | null;
  km: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  lastUpdated: number | null;
  nearestStop: Stop | null;
  distanceToRouteKm: number | null;
  error: string | null;
}

const route: Coordinate[] = ROUTE;
const toRadians = (value: number) => value * Math.PI / 180;

function haversine(a: Coordinate, b: Coordinate) {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

const cumulativeKm = route.reduce<number[]>((result, point, index) => {
  result.push(index === 0 ? 0 : result[index - 1] + haversine(route[index - 1], point));
  return result;
}, []);
const geometryKm = cumulativeKm[cumulativeKm.length - 1] || TOTAL_KM;

function nearestRoutePosition(latitude: number, longitude: number) {
  const latitudeScale = 111.32;
  const longitudeScale = 111.32 * Math.cos(toRadians(latitude));
  let bestDistanceKm = Infinity;
  let bestKm = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const startX = (start[1] - longitude) * longitudeScale;
    const startY = (start[0] - latitude) * latitudeScale;
    const endX = (end[1] - longitude) * longitudeScale;
    const endY = (end[0] - latitude) * latitudeScale;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection = lengthSquared ? Math.min(1, Math.max(0, -(startX * deltaX + startY * deltaY) / lengthSquared)) : 0;
    const distanceKm = Math.hypot(startX + deltaX * projection, startY + deltaY * projection);

    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm;
      bestKm = ((cumulativeKm[index] + haversine(start, end) * projection) / geometryKm) * TOTAL_KM;
    }
  }

  return { km: Math.min(TOTAL_KM, Math.max(0, bestKm)), distanceKm: bestDistanceKm };
}

function nearestStation(latitude: number, longitude: number) {
  return stops.reduce((closest, stop) => {
    const distance = haversine([latitude, longitude], [stop.lat, stop.lon]);
    return distance < closest.distance ? { stop, distance } : closest;
  }, { stop: stops[0], distance: Infinity });
}

const initialState: GpsTelemetry = {
  status: "idle",
  latitude: null,
  longitude: null,
  km: null,
  speedKmh: null,
  accuracyM: null,
  lastUpdated: null,
  nearestStop: null,
  distanceToRouteKm: null,
  error: null,
};

export function useGpsTelemetry(autoStart = true) {
  const [telemetry, setTelemetry] = useState<GpsTelemetry>(initialState);
  const watchRef = useRef<number | null>(null);
  const lastFixRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const lastUpdatedRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setTelemetry(current => ({ ...current, status: "error", error: "Geolocation is not supported by this browser." }));
      return;
    }

    stop();
    setTelemetry(current => ({ ...current, status: "locating", error: null }));
    watchRef.current = navigator.geolocation.watchPosition(
      position => {
        const { latitude, longitude, accuracy, speed } = position.coords;
        const timestamp = position.timestamp || Date.now();
        const previous = lastFixRef.current;
        const calculatedSpeed = previous && timestamp > previous.timestamp
          ? haversine([previous.latitude, previous.longitude], [latitude, longitude]) / ((timestamp - previous.timestamp) / 3600000)
          : null;
        const routePosition = nearestRoutePosition(latitude, longitude);
        const station = nearestStation(latitude, longitude);
        const speedKmh = speed !== null && speed >= 0 ? speed * 3.6 : calculatedSpeed;
        lastFixRef.current = { latitude, longitude, timestamp };
        lastUpdatedRef.current = Date.now();
        setTelemetry({
          status: "live",
          latitude,
          longitude,
          km: routePosition.km,
          speedKmh: speedKmh === null ? null : Math.round(Math.max(0, speedKmh)),
          accuracyM: Math.round(accuracy),
          lastUpdated: lastUpdatedRef.current,
          nearestStop: station.stop,
          distanceToRouteKm: Number(routePosition.distanceKm.toFixed(2)),
          error: null,
        });
      },
      error => {
        const denied = error.code === GeolocationPositionError.PERMISSION_DENIED;
        setTelemetry(current => ({
          ...current,
          status: denied ? "denied" : "error",
          error: denied ? "Location permission denied. Enable it to follow the train." : error.message,
        }));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, [stop]);

  useEffect(() => {
    if (autoStart) start();
    return stop;
  }, [autoStart, start, stop]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastUpdatedRef.current && Date.now() - lastUpdatedRef.current > SIGNAL_TIMEOUT_MS) {
        setTelemetry(current => current.status === "live" ? { ...current, status: "stale" } : current);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  return { telemetry, start, stop };
}
