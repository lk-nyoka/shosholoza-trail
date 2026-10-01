// Fetch real building footprints along the animation slice.
//
// The 3D animation filled its surroundings with 95 randomly sized boxes. That is
// exactly the generic city the plan warns against - it could be anywhere. These
// are the actual footprints beside the line out of Pretoria.
//
// Overpass is keyless and free. This runs at build time, never in the browser,
// and writes a compact local file so the page stays offline-capable.
//
//   node scripts/fetch-osm-buildings.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROUTE = process.env.ROUTE ?? 'data/route-animation.geojson';
const TARGET = process.env.TARGET ?? 'data/pretoria-buildings.json';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/** How far either side of the line to keep buildings, in metres. */
const CORRIDOR = Number(process.env.CORRIDOR ?? 700);
/** Cap the file size; central Pretoria has far more than the scene needs. */
const MAX_BUILDINGS = Number(process.env.MAX_BUILDINGS ?? 900);

const route = JSON.parse(readFileSync(ROUTE, 'utf8'));
const line = (route.features ? route.features[0].geometry : route.geometry).coordinates;

const lons = line.map(c => c[0]), lats = line.map(c => c[1]);
// A degree of longitude is only ~100 km at Pretoria's latitude, so padding both
// axes by the same number of degrees buys 630 m east-west, not 700 m - and the
// route runs roughly north-south, so east-west is the direction that matters.
const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
const padLat = CORRIDOR / 110_540;
const padLon = CORRIDOR / (111_320 * Math.cos((midLat * Math.PI) / 180));
const bbox = [
  Math.min(...lats) - padLat, Math.min(...lons) - padLon,
  Math.max(...lats) + padLat, Math.max(...lons) + padLon,
].map(v => v.toFixed(5)).join(',');

const query = `[out:json][timeout:90];
(way["building"](${bbox});
 way["building:part"](${bbox}););
out geom;`;

function metresFrom(lon, lat, lon2, lat2) {
  return Math.hypot((lon2 - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (lat2 - lat) * 110_540);
}

/** Shortest distance from a point to the route, sampled - exact is overkill. */
function distanceToRoute(lon, lat) {
  let best = Infinity;
  for (let i = 0; i < line.length; i += 3) {
    const d = metresFrom(lon, lat, line[i][0], line[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Metres of height. OSM gives height, or levels, or nothing at all. */
function heightOf(tags) {
  const explicit = Number.parseFloat(tags?.height ?? '');
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, 140);
  const levels = Number.parseFloat(tags?.['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 140);
  // Unknown: a low single storey is a safer guess than a tower.
  return 6;
}

async function overpass() {
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      process.stdout.write(`querying ${new URL(endpoint).host}… `);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ShosholozaTrail/1.0 (hackathon prototype)' },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = await response.json();
      // Overpass answers 200 with a partial result and a `remark` when a query
      // blows its time or memory budget. Without this the loop never tries the
      // next mirror and a good data file gets overwritten with fragments.
      if (json.remark) throw new Error(`Overpass: ${json.remark}`);
      console.log(`${json.elements?.length ?? 0} elements`);
      return json;
    } catch (error) {
      console.log('failed');
      lastError = error;
    }
  }
  throw lastError ?? new Error('no Overpass endpoint answered');
}

const data = await overpass();

const buildings = [];
for (const element of data.elements ?? []) {
  if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
  const points = element.geometry.filter(p => p && Number.isFinite(p.lon));
  if (points.length < 4) continue;

  // Centroid, and the footprint relative to it, so the runtime does not repeat
  // the projection for every vertex of every building.
  // `out geom` repeats the first node to close the way. Averaging it twice pulls
  // every centroid toward that vertex, and since the ring is stored relative to
  // the centroid, it shifts the whole building.
  const ring = points.slice(0, -1);
  let lon = 0, lat = 0;
  for (const p of ring) { lon += p.lon; lat += p.lat; }
  lon /= ring.length; lat /= ring.length;

  const away = distanceToRoute(lon, lat);
  if (away > CORRIDOR) continue;

  const scale = 111_320 * Math.cos((lat * Math.PI) / 180);
  const relative = ring.map(p => [
    Math.round((p.lon - lon) * scale * 10) / 10,
    Math.round((p.lat - lat) * 110_540 * 10) / 10,
  ]);
  // Drop slivers: anything under about 25 m² is noise at this viewing distance.
  const extent = Math.max(...relative.map(([x, y]) => Math.hypot(x, y)));
  if (extent < 2.6) continue;

  buildings.push({
    lon: Math.round(lon * 1e6) / 1e6,
    lat: Math.round(lat * 1e6) / 1e6,
    height: Math.round(heightOf(element.tags) * 10) / 10,
    away: Math.round(away),
    ring: relative,
  });
}

buildings.sort((a, b) => a.away - b.away);
const kept = buildings.slice(0, MAX_BUILDINGS);

if (!kept.length) throw new Error('Overpass returned no buildings in the corridor - refusing to overwrite the existing file');
mkdirSync('data', { recursive: true });
writeFileSync(TARGET, JSON.stringify({
  generator: 'scripts/fetch-osm-buildings.mjs',
  source: 'OpenStreetMap contributors, ODbL 1.0, via Overpass API',
  note: `Building footprints within ${CORRIDOR} m of the animation slice. Rings are metres relative to each building's centroid.`,
  fetched: new Date().toISOString().slice(0, 10),
  corridorMetres: CORRIDOR,
  count: kept.length,
  buildings: kept,
}));

console.log(`${TARGET}: ${kept.length} buildings of ${buildings.length} in corridor`);
console.log(`${Math.round(readFileSync(TARGET).length / 1024)} KB`);
