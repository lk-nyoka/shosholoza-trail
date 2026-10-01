// Named places along the animation slice.
//
// The train passes real things - a memorial, a park, a school, a church - and
// said nothing about any of them. These are the ones OpenStreetMap actually
// records beside this stretch of line, with their real names.
//
// Nothing here is invented: if OSM has no name for something, it is not
// included. That is the whole point - the alternative is making places up.
//
//   node scripts/fetch-osm-places.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ROUTE = process.env.ROUTE ?? 'data/route-animation.geojson';
const TARGET = process.env.TARGET ?? 'data/pretoria-places.json';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/** Only things close enough to see from a passing train. */
const CORRIDOR = Number(process.env.CORRIDOR ?? 420);
const MAX_PLACES = 40;

/**
 * What counts as worth announcing, and how it is described. Order matters:
 * the first match wins, so specific kinds beat generic ones.
 */
const KINDS = [
  { tag: 'historic', label: 'Historic site' },
  { tag: 'tourism', values: ['museum', 'attraction', 'artwork', 'viewpoint', 'gallery'], label: 'Attraction' },
  { tag: 'amenity', values: ['place_of_worship'], label: 'Place of worship' },
  { tag: 'amenity', values: ['university', 'college', 'school'], label: 'Education' },
  { tag: 'amenity', values: ['hospital'], label: 'Hospital' },
  { tag: 'leisure', values: ['park', 'stadium', 'sports_centre', 'nature_reserve'], label: 'Open space' },
  { tag: 'man_made', values: ['water_tower', 'tower', 'works'], label: 'Landmark structure' },
  { tag: 'railway', values: ['station', 'halt'], label: 'Station' },
];

const route = JSON.parse(readFileSync(ROUTE, 'utf8'));
const line = (route.features ? route.features[0].geometry : route.geometry).coordinates;
const lons = line.map(c => c[0]), lats = line.map(c => c[1]);
const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
const padLat = CORRIDOR / 110_540;
const padLon = CORRIDOR / (111_320 * Math.cos((midLat * Math.PI) / 180));
const bbox = [
  Math.min(...lats) - padLat, Math.min(...lons) - padLon,
  Math.max(...lats) + padLat, Math.max(...lons) + padLon,
].map(v => v.toFixed(5)).join(',');

const selectors = KINDS.map(kind => (kind.values
  ? `["${kind.tag}"~"^(${kind.values.join('|')})$"]`
  : `["${kind.tag}"]`));
const query = `[out:json][timeout:90];
(${selectors.map(selector => `node${selector}["name"](${bbox});way${selector}["name"](${bbox});`).join('\n ')});
out center tags;`;

const metres = (lon, lat, lon2, lat2) =>
  Math.hypot((lon2 - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (lat2 - lat) * 110_540);

/** Cumulative distance along the route, so a place can be given a chainage. */
const cumulative = [0];
for (let i = 1; i < line.length; i++) {
  cumulative.push(cumulative[i - 1] + metres(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]));
}

/** Nearest point on the route: how far along, how far off, and which side. */
function locate(lon, lat) {
  let best = { away: Infinity, along: 0, side: 1 };
  for (let i = 1; i < line.length; i++) {
    const away = metres(lon, lat, line[i][0], line[i][1]);
    if (away >= best.away) continue;
    // Cross product of the route tangent with the bearing to the place tells us
    // which side of the line it lies on.
    const tx = line[i][0] - line[i - 1][0], ty = line[i][1] - line[i - 1][1];
    const px = lon - line[i][0], py = lat - line[i][1];
    best = { away, along: cumulative[i], side: tx * py - ty * px >= 0 ? -1 : 1 };
  }
  return best;
}

function classify(tags) {
  for (const kind of KINDS) {
    const value = tags?.[kind.tag];
    if (!value) continue;
    if (kind.values && !kind.values.includes(value)) continue;
    return kind.label;
  }
  return null;
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
const places = [];
const seen = new Set();

for (const element of data.elements ?? []) {
  const tags = element.tags ?? {};
  const name = tags.name;
  if (!name) continue;
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

  const kind = classify(tags);
  if (!kind) continue;

  const { away, along, side } = locate(lon, lat);
  if (away > CORRIDOR) continue;
  // The same place is often tagged as both a node and a way.
  const key = `${name}|${Math.round(along / 50)}`;
  if (seen.has(key)) continue;
  seen.add(key);

  places.push({
    name,
    kind,
    lon: Math.round(lon * 1e6) / 1e6,
    lat: Math.round(lat * 1e6) / 1e6,
    alongMetres: Math.round(along),
    offsetMetres: Math.round(away),
    side,
  });
}

places.sort((a, b) => a.alongMetres - b.alongMetres);
const kept = places.slice(0, MAX_PLACES);

if (!kept.length) throw new Error('Overpass returned no named places in the corridor - refusing to overwrite the existing file');

writeFileSync(TARGET, JSON.stringify({
  generator: 'scripts/fetch-osm-places.mjs',
  source: 'OpenStreetMap contributors, ODbL 1.0, via Overpass API',
  note: `Named places within ${CORRIDOR} m of the animation slice, in route order. Names are OSM's, unedited.`,
  fetched: new Date().toISOString().slice(0, 10),
  corridorMetres: CORRIDOR,
  count: kept.length,
  places: kept,
}, null, 1));

console.log(`${TARGET}: ${kept.length} places of ${places.length} in corridor`);
for (const place of kept.slice(0, 12)) {
  console.log(`  ${String(place.alongMetres).padStart(5)} m  ${place.kind.padEnd(20)} ${place.name}`);
}
