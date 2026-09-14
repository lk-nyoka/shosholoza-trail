/**
 * Builds a running line from the real OSM rail network, via OpenFreeMap.
 *
 * The baked src/rail-geometry.ts is a graph shortest path over every railway
 * way in the corridor, and it shows: measured at km 3.17 it changes heading by
 * 171 degrees in 25 metres - it doubles back on itself - and its first vertex
 * is 900 m from Pretoria station, which is why the train started on grass.
 * Smoothing cannot repair a hairpin; the geometry has to be right.
 *
 * The fix is mostly one filter. OpenMapTiles tags yard, siding, crossover and
 * spur trackage in `service`, and leaves it unset on running lines. Restricting
 * the graph to unserviced `rail` removes the yard-hopping that produced the
 * reversals, and `brunnel` comes along for free so bridges and tunnels can be
 * drawn where they actually are.
 */
import { fetchVectorTile, tileToLonLat, OPENFREEMAP_MAX_ZOOM } from "./vectorTiles";

export type LatLng = [number, number];
export type Brunnel = "bridge" | "tunnel" | "ford" | null;

export interface RailSegment {
  points: LatLng[];
  brunnel: Brunnel;
  /** OpenMapTiles `service`: yard, siding, crossover, spur - or null for a running line. */
  service: string | null;
}

/**
 * Routing weight per track type. Excluding serviced track outright fragmented
 * the network into 29 components - you cannot reach a platform without
 * crossing yard trackage - so instead it is traversable but expensive, and
 * Dijkstra sticks to the running line wherever one exists.
 */
const SERVICE_PENALTY: Record<string, number> = {
  siding: 5,
  spur: 6,
  crossover: 9,
  yard: 9,
};
const penaltyFor = (service: string | null) => (service ? (SERVICE_PENALTY[service] ?? 7) : 1);

/** Join endpoints closer than this, to heal tile-clip seams and small breaks. */
const GAP_BRIDGE_KM = 0.04;

export interface RailRoute {
  points: LatLng[];
  /** brunnel state per point, parallel to `points`. */
  brunnel: Brunnel[];
  lengthKm: number;
}

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

const tileX = (lon: number, zoom: number) => Math.floor(((lon + 180) / 360) * 2 ** zoom);
const tileY = (lat: number, zoom: number) =>
  Math.floor(((1 - Math.asinh(Math.tan(radians(lat))) / Math.PI) / 2) * 2 ** zoom);

/**
 * Tiles within `pad` of the straight line from A to B. A full bounding box over
 * Pretoria to Johannesburg is 312 tiles at z14; the corridor is around 30, and
 * the running line never strays far enough from the chord to need the rest.
 */
function corridorTiles(from: LatLng, to: LatLng, zoom: number, pad = 1) {
  const steps = Math.max(2, Math.ceil(haversineKm(from, to) / 2));
  const wanted = new Set<string>();
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const lat = from[0] + (to[0] - from[0]) * t;
    const lon = from[1] + (to[1] - from[1]) * t;
    const cx = tileX(lon, zoom);
    const cy = tileY(lat, zoom);
    for (let dx = -pad; dx <= pad; dx += 1) {
      for (let dy = -pad; dy <= pad; dy += 1) wanted.add(`${cx + dx}/${cy + dy}`);
    }
  }
  return [...wanted].map(key => key.split("/").map(Number) as [number, number]);
}

/** Every running-line segment in a corridor between two points. */
export async function fetchRailSegments(from: LatLng, to: LatLng, pad = 1): Promise<RailSegment[]> {
  const zoom = OPENFREEMAP_MAX_ZOOM;
  const jobs = corridorTiles(from, to, zoom, pad).map(([tx, ty]) =>
    fetchVectorTile(zoom, tx, ty)
      .then(layers => {
        const layer = layers.get("transportation");
        if (!layer) return [];
        const found: RailSegment[] = [];
        for (const feature of layer.features) {
          if (feature.geometryType !== 2) continue;
          const props = feature.properties;
          if (props.class !== "rail" || props.subclass !== "rail") continue;
          const brunnel = (props.brunnel as Brunnel) ?? null;
          const service = (props.service as string | undefined) ?? null;
          for (const ring of feature.rings) {
            if (ring.length < 2) continue;
            found.push({
              points: ring.map(point => {
                const [lon, lat] = tileToLonLat(point, layer.extent, zoom, tx, ty);
                return [lat, lon] as LatLng;
              }),
              brunnel,
              service,
            });
          }
        }
        return found;
      })
      .catch(() => []),
  );
  return (await Promise.all(jobs)).flat();
}

/** Minimal binary heap; sorting the frontier on every pop was the bottleneck. */
class MinHeap {
  private items: [number, string][] = [];
  get size() {
    return this.items.length;
  }
  push(entry: [number, string]) {
    this.items.push(entry);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent][0] <= this.items[index][0]) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }
  pop(): [number, string] | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.items[left][0] < this.items[smallest][0]) smallest = left;
        if (right < this.items.length && this.items[right][0] < this.items[smallest][0]) smallest = right;
        if (smallest === index) break;
        [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * Node identity is the EXACT coordinate, not a rounded one.
 *
 * Rounding to a ~10 m grid was severing the network as often as it joined it:
 * two vertices a metre apart straddle a cell boundary and get different keys,
 * which cuts the polyline in half. Within a tile, connected ways already share
 * byte-identical vertices, so exact keys merge them for free. Everything that
 * genuinely needs joining - tile seams, small breaks - is handled afterwards by
 * a symmetric distance test, which has no boundary artefacts.
 */
const nodeKey = (point: LatLng) => `${point[0].toFixed(7)},${point[1].toFixed(7)}`;

/** Link nodes closer than this across tile seams and small breaks. */
const WELD_KM = 0.008;
/** Spatial bucket size for the weld pass, comfortably larger than WELD_KM. */
const WELD_CELL_DEG = 0.0004;

interface Edge {
  to: string;
  cost: number;
  points: LatLng[];
  brunnel: Brunnel;
}

/**
 * Weld coincident-but-unshared nodes together. OpenMapTiles clips each tile
 * with a buffer and quantises to that tile's own 4096-unit grid, so a way
 * crossing a boundary comes back twice with vertices offset by up to a metre.
 * A plain distance test merges those without the grid artefacts that rounding
 * introduced.
 */
function weldNodes(graph: Map<string, Edge[]>, coords: Map<string, LatLng>) {
  const cell = new Map<string, string[]>();
  const cellKey = (p: LatLng) =>
    `${Math.round(p[0] / WELD_CELL_DEG)}:${Math.round(p[1] / WELD_CELL_DEG)}`;
  for (const [key, point] of coords) {
    const bucket = cellKey(point);
    if (!cell.has(bucket)) cell.set(bucket, []);
    cell.get(bucket)!.push(key);
  }
  let welds = 0;
  for (const [key, point] of coords) {
    const [gx, gy] = cellKey(point).split(":").map(Number);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of cell.get(`${gx + dx}:${gy + dy}`) ?? []) {
          if (other === key) continue;
          const target = coords.get(other)!;
          const distance = haversineKm(point, target);
          if (distance > WELD_KM) continue;
          if (!graph.has(key)) graph.set(key, []);
          graph.get(key)!.push({ to: other, cost: Math.max(distance, 1e-6), points: [point, target], brunnel: null });
          welds += 1;
        }
      }
    }
  }
  return welds;
}

function buildGraph(segments: RailSegment[]) {
  const graph = new Map<string, Edge[]>();
  const coords = new Map<string, LatLng>();
  const link = (from: string, to: string, points: LatLng[], brunnel: Brunnel, cost: number) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push({ to, cost, points, brunnel });
  };
  for (const segment of segments) {
    for (let index = 1; index < segment.points.length; index += 1) {
      const a = segment.points[index - 1];
      const b = segment.points[index];
      const ka = nodeKey(a);
      const kb = nodeKey(b);
      if (ka === kb) continue;
      coords.set(ka, a);
      coords.set(kb, b);
      const cost = haversineKm(a, b) * penaltyFor(segment.service);
      link(ka, kb, [a, b], segment.brunnel, cost);
      link(kb, ka, [b, a], segment.brunnel, cost);
    }
  }
  weldNodes(graph, coords);
  return { graph, coords };
}

/** Connected components of the welded graph, largest first. */
function components(graph: Map<string, Edge[]>): string[][] {
  const seen = new Set<string>();
  const found: string[][] = [];
  for (const node of graph.keys()) {
    if (seen.has(node)) continue;
    const stack = [node];
    seen.add(node);
    const members: string[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const edge of graph.get(current) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    found.push(members);
  }
  return found.sort((a, b) => b.length - a.length);
}

function nearestIn(members: string[], coords: Map<string, LatLng>, target: LatLng) {
  let best = "";
  let bestDistance = Infinity;
  for (const key of members) {
    const point = coords.get(key);
    if (!point) continue;
    const distance = haversineKm(point, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return { key: best, distanceKm: bestDistance };
}

/**
 * Anchor both ends inside ONE component.
 *
 * Taking the globally nearest node to each end was the trap: the node closest
 * to Park Station sat in a 36-node isolated stub while the running line lived
 * in components of several thousand, so the search could never connect them.
 * Score every component by how well it serves both ends and take the best.
 */
function anchor(graph: Map<string, Edge[]>, coords: Map<string, LatLng>, from: LatLng, to: LatLng) {
  let chosen: { start: string; goal: string; score: number } | null = null;
  for (const members of components(graph)) {
    if (members.length < 50) continue;
    const start = nearestIn(members, coords, from);
    const goal = nearestIn(members, coords, to);
    if (!start.key || !goal.key) continue;
    const score = start.distanceKm + goal.distanceKm;
    if (!chosen || score < chosen.score) chosen = { start: start.key, goal: goal.key, score };
  }
  return chosen;
}

/**
 * Dijkstra across the running-line graph. Turning cost is not modelled; on a
 * network already filtered to running lines the shortest path is the line.
 */
export async function buildRailRoute(from: LatLng, to: LatLng, pad = 1): Promise<RailRoute> {
  const segments = await fetchRailSegments(from, to, pad);
  if (!segments.length) throw new Error("No running-line rail found in this box");
  const { graph, coords } = buildGraph(segments);

  const anchored = anchor(graph, coords, from, to);
  if (!anchored) throw new Error("Could not anchor the route to the rail network");
  const startKey = anchored.start;
  const goalKey = anchored.goal;

  const best = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, { node: string; edge: Edge }>();
  const visited = new Set<string>();
  const frontier = new MinHeap();
  frontier.push([0, startKey]);

  while (frontier.size) {
    const [cost, node] = frontier.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    if (node === goalKey) break;
    for (const edge of graph.get(node) ?? []) {
      if (visited.has(edge.to)) continue;
      const next = cost + edge.cost;
      if (next < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, next);
        cameFrom.set(edge.to, { node, edge });
        frontier.push([next, edge.to]);
      }
    }
  }

  if (!cameFrom.has(goalKey) && goalKey !== startKey) {
    throw new Error("Rail network is not connected between those points");
  }

  const points: LatLng[] = [];
  const brunnel: Brunnel[] = [];
  let cursor = goalKey;
  const chain: Edge[] = [];
  while (cursor !== startKey) {
    const step = cameFrom.get(cursor);
    if (!step) break;
    chain.push(step.edge);
    cursor = step.node;
  }
  chain.reverse();
  for (const edge of chain) {
    for (const point of edge.points) {
      if (points.length && haversineKm(points[points.length - 1], point) < 1e-6) continue;
      points.push(point);
      brunnel.push(edge.brunnel);
    }
  }

  let lengthKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    lengthKm += haversineKm(points[index - 1], points[index]);
  }
  return { points, brunnel, lengthKm };
}

/** Worst heading change per step, in degrees - a quick quality check. */
export function worstHeadingChange(points: LatLng[]): number {
  let worst = 0;
  for (let index = 2; index < points.length; index += 1) {
    const a = Math.atan2(points[index][1] - points[index - 1][1], points[index][0] - points[index - 1][0]);
    const b = Math.atan2(points[index - 1][1] - points[index - 2][1], points[index - 1][0] - points[index - 2][0]);
    let delta = Math.abs(a - b);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta > worst) worst = delta;
  }
  return (worst * 180) / Math.PI;
}
