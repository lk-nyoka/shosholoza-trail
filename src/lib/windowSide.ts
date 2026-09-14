/**
 * Which window to sit at.
 *
 * This is the feature that defines the scenic-rail genre - Window Seater, The
 * Window Seat Guide, Great Journeys New Zealand all lead with "sit on the left
 * for the gorge". The app already had a LEFT / AHEAD / RIGHT strip, but it read
 * from a hand-written table keyed on station id, so it could not be wrong in an
 * interesting way and could not be right either.
 *
 * Now it is computed from the same geometry the train rides: project the
 * landmark onto the running line, take the track tangent there, and check which
 * side of it the landmark falls on. It follows the route, so it stays correct
 * through every curve - including where the line doubles back and a landmark
 * genuinely swaps sides.
 */
import { ROUTE, TOTAL_KM, distances, mappedDistance, positionAt } from "./routeIndex";

export type LatLng = [number, number];
export type TrackSide = "left" | "right" | "ahead";

const radians = (value: number) => (value * Math.PI) / 180;
const M_PER_DEG_LAT = 111320;
const metresPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos(radians(lat));

export interface SideReading {
  side: TrackSide;
  /** Route km of the closest approach. */
  km: number;
  /** Perpendicular distance from the track, in metres. */
  offsetM: number;
}

/**
 * `aheadConeDeg` is the half-angle within which something counts as "ahead"
 * rather than to one side - a peak on the horizon straight down the line is not
 * a window-seat call.
 */
export function sideOfTrack(target: LatLng, aheadConeDeg = 22): SideReading {
  const lonScale = metresPerDegLon(target[0]);
  const tx = target[1] * lonScale;
  const ty = target[0] * M_PER_DEG_LAT;

  let bestDistance = Infinity;
  let bestAlong = 0;
  let bestIndex = 1;
  let bestT = 0;

  for (let index = 1; index < ROUTE.length; index += 1) {
    const ax = ROUTE[index - 1][1] * lonScale;
    const ay = ROUTE[index - 1][0] * M_PER_DEG_LAT;
    const bx = ROUTE[index][1] * lonScale;
    const by = ROUTE[index][0] * M_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) continue;
    const t = Math.min(1, Math.max(0, ((tx - ax) * dx + (ty - ay) * dy) / lengthSq));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distance = Math.hypot(tx - px, ty - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
      bestT = t;
      const segment = distances[index] - distances[index - 1];
      bestAlong = distances[index - 1] + segment * t;
    }
  }

  const a = ROUTE[bestIndex - 1];
  const b = ROUTE[bestIndex];
  // Track direction and the bearing to the landmark, both in local metres.
  const forwardX = (b[1] - a[1]) * lonScale;
  const forwardY = (b[0] - a[0]) * M_PER_DEG_LAT;
  const pointX = tx - (a[1] * lonScale + forwardX * bestT);
  const pointY = ty - (a[0] * M_PER_DEG_LAT + forwardY * bestT);

  const forwardLength = Math.hypot(forwardX, forwardY) || 1;
  const pointLength = Math.hypot(pointX, pointY) || 1;
  const alongDot = (forwardX * pointX + forwardY * pointY) / (forwardLength * pointLength);
  const offAxisDeg = Math.acos(Math.min(1, Math.max(-1, alongDot))) * (180 / Math.PI);

  // 2D cross product: positive is left of travel, negative is right.
  const cross = forwardX * pointY - forwardY * pointX;

  return {
    side: offAxisDeg < aheadConeDeg ? "ahead" : cross > 0 ? "left" : "right",
    km: (bestAlong / mappedDistance) * TOTAL_KM,
    offsetM: Math.round(bestDistance),
  };
}

/** Bearing the train is travelling at a route km, degrees clockwise from north. */
export function headingAtKm(km: number): number {
  const here = positionAt(km);
  const ahead = positionAt(Math.min(TOTAL_KM, km + 0.2));
  const lonScale = metresPerDegLon(here[0]);
  const bearing = Math.atan2(
    (ahead[1] - here[1]) * lonScale,
    (ahead[0] - here[0]) * M_PER_DEG_LAT,
  );
  return (bearing * (180 / Math.PI) + 360) % 360;
}

export const compassPoint = (degrees: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];
