#!/usr/bin/env python3
"""Build the whole Pretoria - Cape Town running line from a Geofabrik extract.

This replaces the live api.openstreetmap.org extraction, which was the right
idea and the wrong source: it returns multi-megabyte full-map responses, and
after 173 requests it answered 509 Bandwidth Limit Exceeded with 5 of 124 boxes
done. A regional extract is the tool for bulk work - one download, full
resolution, no rate limit, and no load on donated infrastructure.

    python scripts/build_route_from_pbf.py <south-africa.osm.pbf>

Writes src/rail-route.ts. Pipeline, same as the one proven on the Gauteng leg:

  1. Pull every railway=rail way with node geometry, keeping `service`
     (yard / siding / crossover / spur) and bridge / tunnel tags.
  2. Build a graph where running line costs 1 per metre and yard trackage 30,
     so shortest path follows the main line but can still cross a station
     throat when that is the only way through.
  3. Node identity is the exact coordinate. Rounding to a grid severs the
     network as often as it joins it - two vertices a metre apart can land in
     different cells. Coincident-but-unjoined nodes are welded afterwards at
     5 m, which is symmetric and has no grid artefacts.
  4. Route leg by leg between stations, anchoring each end inside one connected
     component so the search cannot latch onto an isolated stub.
  5. De-spike tight reversals over short spans, then resample to a uniform 40 m.
"""
import json
import math
import sys
from heapq import heappush, heappop

import osmium

# Station anchors, ordered down the line. Coordinates are the stations
# themselves - Pretoria and Johannesburg in the app's data both pointed about a
# kilometre off the rails before this.
STATIONS = [
    ("Pretoria",       -25.7566, 28.1872),
    ("Johannesburg",   -26.1955, 28.0416),
    ("Kimberley",      -28.7282, 24.7499),
    ("De Aar",         -30.6497, 24.0129),
    ("Beaufort West",  -32.3568, 22.5811),
    ("Matjiesfontein", -33.2311, 20.5836),
    ("Worcester",      -33.6464, 19.4487),
    ("Cape Town",      -33.9249, 18.4241),
]

SERVICE_PENALTY = {"siding": 12, "spur": 14, "crossover": 30, "yard": 30}
WELD_M = 5.0
RESAMPLE_M = 40.0
EARTH_KM = 6371.0088


def haversine_km(a, b):
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return EARTH_KM * 2 * math.asin(math.sqrt(h))


class RailHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []

    def way(self, w):
        if w.tags.get("railway") != "rail":
            return
        try:
            coords = [(round(n.lat, 6), round(n.lon, 6)) for n in w.nodes if n.location.valid()]
        except Exception:
            return
        if len(coords) < 2:
            return
        tunnel = w.tags.get("tunnel") not in (None, "no")
        bridge = w.tags.get("bridge") not in (None, "no")
        self.ways.append({
            "c": coords,
            "s": w.tags.get("service"),
            "b": "tunnel" if tunnel else ("bridge" if bridge else None),
        })


def build_graph(ways):
    adj, brunnel_of = {}, {}
    for way in ways:
        penalty = SERVICE_PENALTY.get(way["s"], 1 if way["s"] is None else 15)
        for i in range(1, len(way["c"])):
            a, b = way["c"][i - 1], way["c"][i]
            if a == b:
                continue
            metres = haversine_km(a, b) * 1000
            if metres == 0:
                continue
            cost = metres * penalty
            adj.setdefault(a, []).append((b, cost))
            adj.setdefault(b, []).append((a, cost))
            brunnel_of[(a, b)] = brunnel_of[(b, a)] = way["b"]
    return adj, brunnel_of


def weld(adj):
    """Join coincident-but-unshared nodes; OSM leaves plenty of these."""
    cell = {}
    size = WELD_M / 111320.0
    for node in adj:
        cell.setdefault((round(node[0] / size), round(node[1] / size)), []).append(node)
    joined = 0
    for node in list(adj):
        gx, gy = round(node[0] / size), round(node[1] / size)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in cell.get((gx + dx, gy + dy), ()):
                    if other is node or other == node:
                        continue
                    d = haversine_km(node, other) * 1000
                    if 0 < d <= WELD_M:
                        adj[node].append((other, max(d, 0.001)))
                        joined += 1
    return joined


def components(adj):
    seen, out = set(), []
    for start in adj:
        if start in seen:
            continue
        stack, members = [start], []
        seen.add(start)
        while stack:
            cur = stack.pop()
            members.append(cur)
            for nxt, _ in adj.get(cur, ()):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        out.append(members)
    out.sort(key=len, reverse=True)
    return out


def nearest(members, target):
    best, best_d = None, float("inf")
    for node in members:
        d = haversine_km(node, target)
        if d < best_d:
            best_d, best = d, node
    return best, best_d


def dijkstra(adj, start, goal):
    dist = {start: 0.0}
    prev = {}
    seen = set()
    heap = [(0.0, start)]
    while heap:
        cost, node = heappop(heap)
        if node in seen:
            continue
        seen.add(node)
        if node == goal:
            break
        for nxt, step in adj.get(node, ()):
            if nxt in seen:
                continue
            nd = cost + step
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                prev[nxt] = node
                heappush(heap, (nd, nxt))
    if goal not in prev and goal != start:
        return None
    path, cur = [goal], goal
    while cur != start:
        cur = prev[cur]
        path.append(cur)
    path.reverse()
    return path


def angle_deg(a, b, c):
    h1 = math.atan2(b[1] - a[1], b[0] - a[0])
    h2 = math.atan2(c[1] - b[1], c[0] - b[0])
    d = abs(h2 - h1)
    if d > math.pi:
        d = 2 * math.pi - d
    return math.degrees(d)


def despike(points, brunnel):
    for _ in range(6):
        keep_p, keep_b, dropped = [points[0]], [brunnel[0]], 0
        for i in range(1, len(points) - 1):
            span = (haversine_km(points[i - 1], points[i]) + haversine_km(points[i], points[i + 1])) * 1000
            if angle_deg(points[i - 1], points[i], points[i + 1]) > 55 and span < 160:
                dropped += 1
                continue
            keep_p.append(points[i])
            keep_b.append(brunnel[i])
        keep_p.append(points[-1])
        keep_b.append(brunnel[-1])
        points, brunnel = keep_p, keep_b
        if not dropped:
            break
    return points, brunnel


def resample(points, brunnel, step_m):
    cum = [0.0]
    for i in range(1, len(points)):
        cum.append(cum[-1] + haversine_km(points[i - 1], points[i]) * 1000)
    total = cum[-1]
    out_p, out_b = [], []
    d, j = 0.0, 1
    while d <= total:
        while j < len(cum) - 1 and cum[j] < d:
            j += 1
        lo = max(0, j - 1)
        seg = cum[j] - cum[lo]
        t = (d - cum[lo]) / seg if seg else 0.0
        out_p.append((round(points[lo][0] + (points[j][0] - points[lo][0]) * t, 5),
                      round(points[lo][1] + (points[j][1] - points[lo][1]) * t, 5)))
        out_b.append(brunnel[lo])
        d += step_m
    return out_p, out_b, total


def main():
    path = sys.argv[1]
    print(f"reading {path} ...", flush=True)
    handler = RailHandler()
    handler.apply_file(path, locations=True, idx="flex_mem")
    print(f"  rail ways: {len(handler.ways):,}", flush=True)

    adj, brunnel_of = build_graph(handler.ways)
    print(f"  graph nodes: {len(adj):,}", flush=True)
    print(f"  welded: {weld(adj):,}", flush=True)

    comps = components(adj)
    print(f"  components: {len(comps):,} (largest {len(comps[0]):,})", flush=True)

    all_points, all_brunnel, marks = [], [], []
    for i in range(len(STATIONS) - 1):
        a_name, a_lat, a_lon = STATIONS[i]
        b_name, b_lat, b_lon = STATIONS[i + 1]
        best = None
        for members in comps[:12]:
            if len(members) < 200:
                continue
            sa, da = nearest(members, (a_lat, a_lon))
            sb, db = nearest(members, (b_lat, b_lon))
            if sa is None or sb is None:
                continue
            if best is None or da + db < best[0]:
                best = (da + db, sa, sb, da, db)
        if best is None:
            print(f"  !! {a_name} -> {b_name}: no component serves both", flush=True)
            continue
        _, start, goal, da, db = best
        leg = dijkstra(adj, start, goal)
        if not leg:
            print(f"  !! {a_name} -> {b_name}: not connected", flush=True)
            continue
        km = sum(haversine_km(leg[k - 1], leg[k]) for k in range(1, len(leg)))
        print(f"  {a_name} -> {b_name}: {len(leg):,} pts, {km:,.1f} km "
              f"(anchors {da*1000:.0f} m / {db*1000:.0f} m off)", flush=True)
        marks.append((a_name, len(all_points)))
        if all_points and all_points[-1] == leg[0]:
            leg = leg[1:]
        for k, node in enumerate(leg):
            all_points.append(node)
            prev = leg[k - 1] if k else None
            all_brunnel.append(brunnel_of.get((prev, node)) if prev else None)
    marks.append((STATIONS[-1][0], len(all_points) - 1))

    print(f"raw: {len(all_points):,} points", flush=True)
    pts, brn = despike(all_points, all_brunnel)
    pts, brn, total_m = resample(pts, brn, RESAMPLE_M)
    worst = max((angle_deg(pts[i - 2], pts[i - 1], pts[i]) for i in range(2, len(pts))), default=0)
    print(f"final: {len(pts):,} points, {total_m/1000:,.1f} km, worst turn {worst:.0f} deg", flush=True)

    flat = [v for p in pts for v in p]
    code = "".join("t" if b == "tunnel" else ("b" if b == "bridge" else "n") for b in brn)
    header = f'''// Generated by scripts/build_route_from_pbf.py. Do not hand edit.
// Source: OpenStreetMap contributors, ODbL 1.0, via a Geofabrik South Africa extract.
//
// The whole Pretoria - Cape Town running line, at full OSM resolution.
// {len(pts):,} points at {RESAMPLE_M:.0f} m spacing, {total_m/1000:,.1f} km,
// worst heading change {worst:.0f} degrees.
//
// BRUNNEL is one character per point: n normal, b bridge, t tunnel.

export const railRouteMeta = {{
  source: "OpenStreetMap contributors, ODbL 1.0 (Geofabrik extract)",
  points: {len(pts)},
  lengthKm: {total_m/1000:.2f},
  spacingM: {RESAMPLE_M:.0f},
}} as const;

const FLAT: number[] = '''
    body = json.dumps(flat, separators=(",", ":"))
    footer = f'''

export const BRUNNEL = {json.dumps(code)};

export const railRoute: [number, number][] = (() => {{
  const points: [number, number][] = [];
  for (let i = 0; i < FLAT.length; i += 2) points.push([FLAT[i], FLAT[i + 1]]);
  return points;
}})();

export type Brunnel = "bridge" | "tunnel" | null;
export const brunnelAt = (index: number): Brunnel => {{
  const c = BRUNNEL[index];
  return c === "t" ? "tunnel" : c === "b" ? "bridge" : null;
}};
'''
    with open("src/rail-route.ts", "w", encoding="utf-8") as fh:
        fh.write(header + body + ";" + footer)
    print("wrote src/rail-route.ts", flush=True)


if __name__ == "__main__":
    main()
