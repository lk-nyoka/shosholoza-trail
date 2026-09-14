/**
 * One shared index over the mapped rail geometry.
 *
 * Every consumer - the 3D ride, the playback bar, the stop list - has to agree
 * on what "km 69" means, and previously they did not: the stop km values in
 * data.ts were hand-estimated round numbers, so the train sat wherever those
 * numbers landed rather than at the actual station. Johannesburg was the
 * obvious one, coming out well away from Braamfontein. Snapping each stop's
 * real lat/lon onto the polyline fixes it for everyone at once.
 *
 * The geometry itself is src/rail-route.ts, routed station to station over the
 * whole South African OSM rail graph. It replaces the old
 * rail-geometry.ts + gautrain-route.ts splice, which only had a trustworthy
 * alignment between Pretoria and Park Station and carried the original
 * shortest-path-through-the-yards defects everywhere south of it.
 */
import { railRoute, BRUNNEL, type Brunnel } from "../rail-route";

export type LatLng = [number, number];

export const ROUTE: LatLng[] = railRoute as LatLng[];

const radians = (value: number) => (value * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function haversine(a: LatLng, b: LatLng) {
  const dLat = radians(b[0] - a[0]);
  const dLon = radians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(h));
}

/** Cumulative distance along the polyline, in km, one entry per vertex. */
export const distances: number[] = ROUTE.reduce<number[]>((result, point, index) => {
  result.push(index === 0 ? 0 : result[index - 1] + haversine(ROUTE[index - 1], point));
  return result;
}, []);

export const mappedDistance = distances[distances.length - 1] ?? 0;

/**
 * The route's own length. It used to be a hand-set 1582 that the mapped
 * geometry then had to be stretched onto; now the geometry is the authority and
 * the UI scale simply is the measured distance.
 */
export const TOTAL_KM = Math.round(mappedDistance * 10) / 10;

/** Lat/lon at a route distance, interpolated along the mapped geometry. */
export function positionAt(km: number): LatLng {
  const target = clamp(km / TOTAL_KM, 0, 1) * mappedDistance;
  let low = 0;
  let high = distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const end = Math.max(1, low);
  const start = end - 1;
  const span = distances[end] - distances[start];
  const t = span ? clamp((target - distances[start]) / span, 0, 1) : 0;
  return [
    ROUTE[start][0] + (ROUTE[end][0] - ROUTE[start][0]) * t,
    ROUTE[start][1] + (ROUTE[end][1] - ROUTE[start][1]) * t,
  ];
}

/**
 * Route km of the point on the line closest to `target`, by perpendicular
 * projection onto each segment. Returns the UI km scale (0..TOTAL_KM), matching
 * positionAt, plus how far off the line the point actually was - useful for
 * spotting a station that is nowhere near the mapped corridor.
 */
export function kmAtLatLon(target: LatLng): { km: number; offsetKm: number } {
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos(radians(target[0]));
  const tx = target[1] * lonScale;
  const ty = target[0] * latScale;

  let bestDistance = Infinity;
  let bestAlong = 0;

  for (let index = 1; index < ROUTE.length; index += 1) {
    const ax = ROUTE[index - 1][1] * lonScale;
    const ay = ROUTE[index - 1][0] * latScale;
    const bx = ROUTE[index][1] * lonScale;
    const by = ROUTE[index][0] * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? clamp(((tx - ax) * dx + (ty - ay) * dy) / lengthSq, 0, 1) : 0;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distance = Math.hypot(tx - px, ty - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      const segment = distances[index] - distances[index - 1];
      bestAlong = distances[index - 1] + segment * t;
    }
  }

  return { km: (bestAlong / mappedDistance) * TOTAL_KM, offsetKm: bestDistance };
}

/** Replace hand-written km values with positions measured along the line. */
export function snapToRoute<T extends { lat: number; lon: number; km: number }>(items: T[]): T[] {
  return items.map(item => ({ ...item, km: Math.round(kmAtLatLon([item.lat, item.lon]).km * 10) / 10 }));
}

/**
 * Is the line carried or buried at this distance? Straight off the OSM
 * bridge/tunnel tags, resolved through the same km scale everything else uses,
 * so the 3D corridor can put a deck or a portal exactly where the real one is.
 */
export function brunnelAtKm(km: number): Brunnel {
  const target = clamp(km / TOTAL_KM, 0, 1) * mappedDistance;
  let low = 0;
  let high = distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const code = BRUNNEL[Math.max(0, low)];
  return code === "t" ? "tunnel" : code === "b" ? "bridge" : null;
}
