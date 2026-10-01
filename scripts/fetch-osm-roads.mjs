// Fetch the road network along the animation slice.
//
// Buildings alone make a town look abandoned. Roads give the corridor a street
// pattern, and a handful of them are long enough to drive traffic along.
//
// Same approach as fetch-osm-buildings.mjs: Overpass, keyless, at build time,
// written to a small local file so the page makes no network request.
//
//   node scripts/fetch-osm-roads.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ROUTE = process.env.ROUTE ?? 'data/route-animation.geojson';
const TARGET = process.env.TARGET ?? 'data/pretoria-roads.json';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CORRIDOR = Number(process.env.CORRIDOR ?? 700);
/** Widths in metres by OSM highway class. Roughly carriageway plus verge. */
const WIDTHS = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8,
  residential: 6.5, unclassified: 6, service: 4, living_street: 5.5,
};
const CLASSES = Object.keys(WIDTHS);

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
way["highway"~"^(${CLASSES.join('|')})$"](${bbox});
out geom;`;

const metres = (lon, lat, lon2, lat2) =>
  Math.hypot((lon2 - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (lat2 - lat) * 110_540);

function distanceToRoute(lon, lat) {
  let best = Infinity;
  for (let i = 0; i < line.length; i += 3) {
    const d = metres(lon, lat, line[i][0], line[i][1]);
    if (d < best) best = d;
  }
  return best;
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
const roads = [];

for (const element of data.elements ?? []) {
  if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
  const points = element.geometry.filter(p => p && Number.isFinite(p.lon));
  if (points.length < 2) continue;

  // Keep a way if any part of it comes near the line.
  const near = points.some(p => distanceToRoute(p.lon, p.lat) <= CORRIDOR);
  if (!near) continue;

  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += metres(points[i - 1].lon, points[i - 1].lat, points[i].lon, points[i].lat);
  }
  if (length < 30) continue;

  const tags = element.tags ?? {};
  roads.push({
    highway: tags.highway ?? 'residential',
    width: WIDTHS[tags.highway] ?? 6,
    name: tags.name ?? null,
    // Where OSM says a way is carried over or under something, it must not
    // become a level crossing: the real road bridges the line there.
    bridge: Boolean(tags.bridge && tags.bridge !== 'no'),
    tunnel: Boolean(tags.tunnel && tags.tunnel !== 'no'),
    layer: Number.parseInt(tags.layer ?? '0', 10) || 0,
    lengthMetres: Math.round(length),
    // Six decimal places is about 10 cm, far finer than anything here needs.
    points: points.map(p => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]),
  });
}

roads.sort((a, b) => b.lengthMetres - a.lengthMetres);

if (!roads.length) throw new Error('Overpass returned no roads in the corridor - refusing to overwrite the existing file');

writeFileSync(TARGET, JSON.stringify({
  generator: 'scripts/fetch-osm-roads.mjs',
  source: 'OpenStreetMap contributors, ODbL 1.0, via Overpass API',
  note: `Road centrelines within ${CORRIDOR} m of the animation slice, longest first.`,
  fetched: new Date().toISOString().slice(0, 10),
  count: roads.length,
  roads,
}));

console.log(`${TARGET}: ${roads.length} ways, longest ${roads[0]?.lengthMetres ?? 0} m`);
console.log(`${Math.round(readFileSync(TARGET).length / 1024)} KB`);
