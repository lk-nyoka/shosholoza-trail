"""Fetch a connected OpenStreetMap railway candidate and emit a bundled TS module.

Run manually when refreshing map data. Be considerate of the public Overpass API.
"""
from __future__ import annotations

import heapq
import json
import math
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

OVERPASS = "https://overpass-api.de/api/interpreter"
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "osm-rail"
OUTPUT = ROOT / "src" / "rail-geometry.ts"
BACKEND_OUTPUT = ROOT / "backend" / "app" / "data" / "route-geometry.json"

STOPS = [
    ("Pretoria", 28.1881, -25.7461), ("Germiston", 28.1708, -26.2259),
    ("Johannesburg", 28.0473, -26.2041), ("Potchefstroom", 27.0970, -26.7145),
    ("Klerksdorp", 26.6667, -26.8521), ("Bloemhof", 25.6069, -27.6469),
    ("Christiana", 25.1611, -27.9140), ("Warrenton", 24.8470, -28.1130),
    ("Kimberley", 24.7499, -28.7282), ("De Aar", 24.0129, -30.6497),
    ("Beaufort West", 22.5811, -32.3568), ("Matjiesfontein", 20.5833, -33.2167),
    ("Worcester", 19.4487, -33.6464), ("Wellington", 19.0112, -33.6398),
    ("Bellville", 18.6294, -33.8943), ("Cape Town", 18.4241, -33.9249),
]

def hav(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2-lat1), math.radians(lon2-lon1)
    h = math.sin(dlat/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlon/2)**2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))

def fetch_segment(index, a, b):
    CACHE.mkdir(parents=True, exist_ok=True)
    suffix = "-wide" if a[0] == "Worcester" and b[0] == "Wellington" else ""
    path = CACHE / f"{index:02d}-{a[0].lower().replace(' ','-')}-{b[0].lower().replace(' ','-')}{suffix}.json"
    if path.exists(): return json.loads(path.read_text(encoding="utf-8"))
    margin = 0.38 if suffix else 0.13
    south, north = min(a[2],b[2])-margin, max(a[2],b[2])+margin
    west, east = min(a[1],b[1])-margin, max(a[1],b[1])+margin
    query = f'[out:json][timeout:120];way["railway"="rail"]({south},{west},{north},{east});out geom;'
    request = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data":query}).encode(), headers={"User-Agent":"ShosholozaTrailHackathon/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 4: raise
            delay = 20 * (attempt + 1)
            print(f"Overpass returned {error.code}; retrying in {delay}s")
            time.sleep(delay)
    else: raise RuntimeError("Overpass retry budget exhausted")
    path.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(1.5)
    return data

def connected_path(data, start, end):
    coords, graph, way_ids = {}, {}, set()
    for way in data.get("elements", []):
        nodes, geometry = way.get("nodes", []), way.get("geometry", [])
        if len(nodes) != len(geometry): continue
        way_ids.add(way["id"])
        for nid, p in zip(nodes, geometry): coords[nid] = (p["lon"], p["lat"])
        for x, y in zip(nodes, nodes[1:]):
            weight = hav(coords[x], coords[y])
            graph.setdefault(x, []).append((y,weight)); graph.setdefault(y, []).append((x,weight))
    if not coords: raise RuntimeError("No rail geometry returned")
    unseen=set(coords); components=[]
    while unseen:
        seed=unseen.pop(); component={seed}; stack=[seed]
        while stack:
            node=stack.pop()
            for neighbor,_ in graph.get(node,[]):
                if neighbor in unseen: unseen.remove(neighbor); component.add(neighbor); stack.append(neighbor)
        components.append(component)
    candidates=[]
    for component in components:
        source=min(component,key=lambda n:hav(coords[n],start)); target=min(component,key=lambda n:hav(coords[n],end))
        candidates.append((hav(coords[source],start)+hav(coords[target],end),source,target))
    _,source,target=min(candidates)
    queue=[(0.0,source)]; dist={source:0.0}; previous={}
    while queue:
        cost,node=heapq.heappop(queue)
        if node==target: break
        if cost!=dist[node]: continue
        for neighbor,weight in graph.get(node,[]):
            candidate=cost+weight
            if candidate<dist.get(neighbor,float("inf")):
                dist[neighbor]=candidate; previous[neighbor]=node; heapq.heappush(queue,(candidate,neighbor))
    if target not in dist: raise RuntimeError(f"Disconnected graph; endpoint gap {hav(coords[source],start):.2f}/{hav(coords[target],end):.2f} km")
    nodes=[target]
    while nodes[-1]!=source: nodes.append(previous[nodes[-1]])
    nodes.reverse()
    return [coords[n] for n in nodes], dist[target], way_ids, hav(coords[source],start), hav(coords[target],end)

def main():
    all_coords=[]; segments=[]; all_way_ids=set(); total=0.0
    for i,(a,b) in enumerate(zip(STOPS,STOPS[1:])):
        data=fetch_segment(i,a,b)
        coords,distance,ways,start_gap,end_gap=connected_path(data,(a[1],a[2]),(b[1],b[2]))
        if all_coords and coords[0]==all_coords[-1]: coords=coords[1:]
        all_coords.extend(coords); all_way_ids.update(ways); total+=distance
        segments.append({"from":a[0],"to":b[0],"distanceKm":round(distance,2),"points":len(coords),"startGapKm":round(start_gap,2),"endGapKm":round(end_gap,2)})
        print(f"{a[0]} -> {b[0]}: {distance:.1f} km / {len(coords)} points")
    simplified=[]
    for coord in all_coords:
        if not simplified or hav(simplified[-1],coord)>=0.12: simplified.append(coord)
    if simplified[-1]!=all_coords[-1]: simplified.append(all_coords[-1])
    payload={"source":"OpenStreetMap railway=rail ways via Overpass API","license":"ODbL 1.0","fetchedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"candidate":"Graph-connected shortest railway path between 16 corridor anchors; requires operator validation before operational use","connected":True,"rawPointCount":len(all_coords),"pointCount":len(simplified),"osmWayCount":len(all_way_ids),"mappedDistanceKm":round(total,2),"segments":segments}
    text="// Generated by scripts/fetch_osm_rail.py. Do not hand edit.\nexport type RailCoordinate=readonly [number,number];\n"
    text+=f"export const railGeometryMeta={json.dumps(payload,separators=(',',':'))} as const;\n"
    text+=f"export const railGeometry={json.dumps([[round(lat,6),round(lon,6)] for lon,lat in simplified],separators=(',',':'))} as const satisfies readonly RailCoordinate[];\n"
    OUTPUT.write_text(text,encoding="utf-8")
    BACKEND_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_OUTPUT.write_text(json.dumps({"meta": payload, "coordinates": [[round(lon,6),round(lat,6)] for lon,lat in simplified]},separators=(",",":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(simplified)} bundled points")
    print(f"Wrote {BACKEND_OUTPUT}")

if __name__ == "__main__": main()
