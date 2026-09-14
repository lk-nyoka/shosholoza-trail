/**
 * Full-resolution rail geometry straight from the OpenStreetMap API.
 *
 * Why not the vector tiles: OpenFreeMap's z14 `transportation` layer is
 * generalised, and reconstructing a continuous 80 km alignment from it left the
 * graph in 18 disconnected components. api.openstreetmap.org returns raw,
 * ungeneralised ways and nodes, and it is reachable on this network where
 * Overpass is not (403 at the egress proxy from every path).
 *
 * Measured against this corridor: 831 rail ways / 6,545 nodes for Pretoria to
 * Johannesburg, including 54 bridges and 51 tunnels.
 *
 * The two constraints that shape this file:
 *
 *   1. The map API caps a request at 50,000 nodes and answers 400 above that.
 *      Dense urban boxes must be quartered and retried - Pretoria station
 *      returned nothing at 0.04 degrees and 273 rail ways once split.
 *   2. It has no server-side filter, so every box downloads everything and we
 *      keep only rail. Prune per box or memory balloons.
 */

export type LatLng = [number, number];
export type Brunnel = "bridge" | "tunnel" | null;

export interface OsmWay {
  nodes: number[];
  service: string | null;
  brunnel: Brunnel;
}

export interface OsmRailData {
  ways: OsmWay[];
  nodes: Map<number, LatLng>;
}

const API = "https://api.openstreetmap.org/api/0.6/map.json";
const MAX_SPLIT_DEPTH = 3;

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

/** One bounding box, quartered automatically when the node cap is exceeded. */
async function grabBox(
  data: OsmRailData,
  seen: Set<number>,
  south: number,
  west: number,
  north: number,
  east: number,
  depth = 0,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetch(`${API}?bbox=${west},${south},${east},${north}`, { signal });
  if (!response.ok) {
    if (depth >= MAX_SPLIT_DEPTH) return 0;
    const midLat = (south + north) / 2;
    const midLon = (west + east) / 2;
    let total = 0;
    for (const box of [
      [south, west, midLat, midLon],
      [south, midLon, midLat, east],
      [midLat, west, north, midLon],
      [midLat, midLon, north, east],
    ] as const) {
      total += await grabBox(data, seen, box[0], box[1], box[2], box[3], depth + 1, signal);
    }
    return total;
  }

  const payload = (await response.json()) as { elements: OsmElement[] };
  const byId = new Map<number, OsmElement>();
  for (const element of payload.elements) {
    if (element.type === "node") byId.set(element.id, element);
  }

  let kept = 0;
  for (const element of payload.elements) {
    if (element.type !== "way" || !element.tags || element.tags.railway !== "rail") continue;
    if (seen.has(element.id)) continue;
    seen.add(element.id);
    const tags = element.tags;
    data.ways.push({
      nodes: element.nodes ?? [],
      service: tags.service ?? null,
      brunnel:
        tags.tunnel && tags.tunnel !== "no"
          ? "tunnel"
          : tags.bridge && tags.bridge !== "no"
            ? "bridge"
            : null,
    });
    // Keep only nodes this rail way needs; the rest of the box is discarded.
    for (const id of element.nodes ?? []) {
      if (data.nodes.has(id)) continue;
      const node = byId.get(id);
      if (node?.lat !== undefined && node.lon !== undefined) data.nodes.set(id, [node.lat, node.lon]);
    }
    kept += 1;
  }
  return kept;
}

/**
 * Boxes stepped along a path. Passing the straight chord between two stations
 * is not enough - the real line bows up to 3 km away from it and whole
 * stretches came back empty - so callers should pass a coarse path that
 * actually follows the railway, or fill gaps in a second pass.
 */
export function corridorBoxes(path: LatLng[], steps: number, halfLonDeg = 0.03, padLatDeg = 0.006) {
  const boxes: [number, number, number, number][] = [];
  for (let index = 0; index < steps; index += 1) {
    const t0 = index / steps;
    const t1 = (index + 1) / steps;
    const at = (t: number): LatLng => {
      const scaled = t * (path.length - 1);
      const lower = Math.floor(scaled);
      const upper = Math.min(lower + 1, path.length - 1);
      const frac = scaled - lower;
      return [
        path[lower][0] + (path[upper][0] - path[lower][0]) * frac,
        path[lower][1] + (path[upper][1] - path[lower][1]) * frac,
      ];
    };
    const a = at(t0);
    const b = at(t1);
    const midLon = (a[1] + b[1]) / 2;
    boxes.push([
      Math.min(a[0], b[0]) - padLatDeg,
      midLon - halfLonDeg,
      Math.max(a[0], b[0]) + padLatDeg,
      midLon + halfLonDeg,
    ]);
  }
  return boxes;
}

export async function fetchOsmRail(
  path: LatLng[],
  steps: number,
  options: { halfLonDeg?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<OsmRailData> {
  const data: OsmRailData = { ways: [], nodes: new Map() };
  const seen = new Set<number>();
  const boxes = corridorBoxes(path, steps, options.halfLonDeg);
  for (let index = 0; index < boxes.length; index += 1) {
    const [south, west, north, east] = boxes[index];
    try {
      await grabBox(data, seen, south, west, north, east, 0, options.signal);
    } catch {
      // A failed box leaves a gap; the caller's gap-fill pass handles it.
    }
    options.onProgress?.(index + 1, boxes.length);
  }
  return data;
}

// ── Routing over the extracted network ──────────────────────────────────────

const EARTH_KM = 6371.0088;
const radians = (value: number) => (value * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng) {
  const dLat = radians(b[0] - a[0]);
  const dLon = radians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLon / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.sqrt(h));
}

/** Running line is free; yard and siding trackage is traversable but costly. */
const SERVICE_PENALTY: Record<string, number> = { siding: 5, spur: 6, crossover: 9, yard: 9 };
const penaltyFor = (service: string | null) => (service ? (SERVICE_PENALTY[service] ?? 7) : 1);

interface OsmEdge {
  to: number;
  cost: number;
  brunnel: Brunnel;
}

export function buildOsmGraph(data: OsmRailData) {
  const adjacency = new Map<number, OsmEdge[]>();
  const link = (from: number, to: number, cost: number, brunnel: Brunnel) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ to, cost, brunnel });
  };
  for (const way of data.ways) {
    const penalty = penaltyFor(way.service);
    for (let index = 1; index < way.nodes.length; index += 1) {
      const a = way.nodes[index - 1];
      const b = way.nodes[index];
      const pa = data.nodes.get(a);
      const pb = data.nodes.get(b);
      if (!pa || !pb) continue;
      const length = haversineKm(pa, pb);
      if (length === 0) continue;
      link(a, b, length * penalty, way.brunnel);
      link(b, a, length * penalty, way.brunnel);
    }
  }
  return adjacency;
}

export function connectedComponents(adjacency: Map<number, OsmEdge[]>): number[][] {
  const seen = new Set<number>();
  const found: number[][] = [];
  for (const node of adjacency.keys()) {
    if (seen.has(node)) continue;
    const stack = [node];
    seen.add(node);
    const members: number[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    found.push(members);
  }
  return found.sort((a, b) => b.length - a.length);
}

/**
 * Closest pair of points between two components - use it to locate the exact
 * stretch that was missed, then re-fetch only that. A chord-based first pass
 * left a 32 km hole through Centurion and Midrand that this pinpointed.
 */
export function componentGap(a: number[], b: number[], nodes: Map<number, LatLng>) {
  let bestKm = Infinity;
  let pair: [LatLng, LatLng] | null = null;
  for (const x of a) {
    const px = nodes.get(x);
    if (!px) continue;
    for (const y of b) {
      const py = nodes.get(y);
      if (!py) continue;
      const distance = haversineKm(px, py);
      if (distance < bestKm) {
        bestKm = distance;
        pair = [px, py];
      }
    }
  }
  return { km: bestKm, pair };
}
