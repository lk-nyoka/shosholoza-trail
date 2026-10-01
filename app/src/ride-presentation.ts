import type { Coordinate, RideWaypoint } from './ride-model.js';

function haversineMetres(a: Coordinate, b: Coordinate) {
  const r = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function projectToRail(coordinates: Coordinate[], cumulative: number[], point: Coordinate) {
  const mx = 111_320 * Math.cos(point[1] * Math.PI / 180), my = 110_540;
  let best = { coordinate: coordinates[0], alongMetres: 0, distanceMetres: Infinity };
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i];
    const dx = (b[0] - a[0]) * mx, dy = (b[1] - a[1]) * my;
    const t = Math.max(0, Math.min(1, (((point[0] - a[0]) * mx) * dx + ((point[1] - a[1]) * my) * dy) / (dx * dx + dy * dy || 1)));
    const coordinate: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distanceMetres = haversineMetres(coordinate, point);
    if (distanceMetres < best.distanceMetres) best = { coordinate, distanceMetres, alongMetres: cumulative[i - 1] + (cumulative[i] - cumulative[i - 1]) * t };
  }
  return best;
}

export function landmarkPresentation(coordinates: Coordinate[], cumulative: number[], actual: Coordinate, scale = 1) {
  const nearest = projectToRail(coordinates, cumulative, actual);
  const ratio = Math.min(1, 600 / Math.max(1, nearest.distanceMetres));
  const radians = Math.PI / 180, bearing = relativeBearing(nearest.coordinate, actual, 0) * radians;
  const delta = Math.min(600, nearest.distanceMetres) / 6_371_000, lat = nearest.coordinate[1] * radians, lon = nearest.coordinate[0] * radians;
  const lat2 = Math.asin(Math.sin(lat) * Math.cos(delta) + Math.cos(lat) * Math.sin(delta) * Math.cos(bearing));
  const lon2 = lon + Math.atan2(Math.sin(bearing) * Math.sin(delta) * Math.cos(lat), Math.cos(delta) - Math.sin(lat) * Math.sin(lat2));
  const displayed: Coordinate = ratio === 1 ? [...actual] : [lon2 / radians, lat2 / radians];
  return {
    measured: Object.freeze({ coordinate: Object.freeze([...actual]), nearestRailCoordinate: Object.freeze([...nearest.coordinate]), alongMetres: nearest.alongMetres, lateralDistanceMetres: nearest.distanceMetres }),
    presentation: Object.freeze({ coordinate: Object.freeze(displayed), lateralDistanceMetres: Math.min(600, nearest.distanceMetres), heightScale: scale, compressed: ratio < 1 }),
  };
}

export function approachStage(distance: number) { return distance <= 500 ? 3 : distance <= 2_000 ? 2 : distance <= 5_000 ? 1 : 0; }
export function relativeBearing(origin: Coordinate, target: Coordinate, cameraBearing: number) {
  const radians = Math.PI / 180, delta = (target[0] - origin[0]) * radians;
  const angle = Math.atan2(Math.sin(delta) * Math.cos(target[1] * radians), Math.cos(origin[1] * radians) * Math.sin(target[1] * radians) - Math.sin(origin[1] * radians) * Math.cos(target[1] * radians) * Math.cos(delta)) / radians;
  return ((angle - cameraBearing + 540) % 360) - 180;
}

export function pacedWaypoint(waypoints: RideWaypoint[], current: number, hubs: number[], speed: 1 | 4 | 16) {
  const from = waypoints[current].distanceMetres;
  const near = hubs.some(distance => Math.abs(distance - from) <= 5_000);
  let target = from + (near ? 200 : speed === 16 ? 15_000 : speed === 4 ? 10_000 : 5_000);
  // Never jump over the next approach boundary or station.
  for (const hub of hubs) for (const boundary of [hub - 5_000, hub - 2_000, hub - 500, hub]) {
    if (boundary > from + 1 && boundary < target) target = boundary;
  }
  const index = waypoints.findIndex((point, index) => index > current && point.distanceMetres >= target - 1);
  return index < 0 ? waypoints.length - 1 : index;
}
