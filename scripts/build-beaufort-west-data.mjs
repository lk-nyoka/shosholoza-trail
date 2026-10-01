// Data for the Beaufort West chapter: the rail slice and the town's anchors.
//
//   node scripts/build-beaufort-west-data.mjs
//
// 1. Cuts the corridor from BEFORE_METRES north-east of the station to
//    AFTER_METRES past it, in the direction of travel (Johannesburg -> Cape
//    Town). The stitched corridor doubles back on itself just north of the
//    station - a there-and-back through a siding - which would make the train
//    reverse on screen, so any such loop is spliced out.
// 2. Reads data/provenance/beaufort-west.osm (a full Overpass extract of the
//    town, not committed: it drags in whole national rail relations) and keeps
//    the station, its platforms and yard, and the named landmarks, each with
//    its OSM id so provenance survives.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SOURCE = 'data/route-ride.geojson';
const ROUTE_TARGET = 'data/route-beaufort-west.geojson';
const TOWN_TARGET = 'data/beaufort-west-town.json';
const OSM = 'data/provenance/beaufort-west.osm';
// OSM node 8148099536, Beaufort West station.
const STATION = [22.57692, -32.35184];
const BEFORE_METRES = 3_200;
const AFTER_METRES = 1_800;
const YARD_RADIUS = 900;

const cosLat = Math.cos((STATION[1] * Math.PI) / 180);
const metres = ([x1, y1], [x2, y2]) => Math.hypot((x2 - x1) * 111_320 * cosLat, (y2 - y1) * 110_540);

// ---------------------------------------------------------------- route
const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const feature = source.type === 'FeatureCollection' ? source.features[0] : source;
const all = feature.geometry.coordinates;
let station = 0, best = Infinity;
all.forEach((p, i) => { const d = metres(p, STATION); if (d < best) { best = d; station = i; } });
if (best > 50) throw new Error(`Nearest route point is ${Math.round(best)} m from the station`);

// Work on a generous window, splice out reversals, then measure the slice.
let window = all.slice(Math.max(0, station - 900), station + 700);
const reversal = (c, i) => {
  const a = c[i - 1], b = c[i], d = c[i + 1];
  const v1 = [(b[0] - a[0]) * cosLat, b[1] - a[1]], v2 = [(d[0] - b[0]) * cosLat, d[1] - b[1]];
  return (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) + 1e-12) < -0.5;
};
let spliced = 0;
for (let guard = 0; guard < 10; guard++) {
  const turns = [];
  for (let i = 1; i < window.length - 1; i++) if (reversal(window, i)) turns.push(i);
  if (turns.length < 2) break;
  const [r1, r2] = turns;
  // Rejoin where the path before the first turn meets the path after the second.
  let join = null, gap = Infinity;
  for (let i = Math.max(0, r1 - 80); i <= r1; i++) for (let j = r2; j < Math.min(window.length, r2 + 80); j++) {
    const d = metres(window[i], window[j]);
    if (d < gap) { gap = d; join = [i, j]; }
  }
  if (!join || gap > 15) throw new Error(`Cannot splice the loop at ${r1}-${r2}: nearest rejoin ${gap.toFixed(1)} m`);
  spliced += join[1] - join[0];
  window = [...window.slice(0, join[0] + 1), ...window.slice(join[1] + 1)];
}

let local = 0; best = Infinity;
window.forEach((p, i) => { const d = metres(p, STATION); if (d < best) { best = d; local = i; } });
let start = local;
for (let run = 0; start > 0 && run < BEFORE_METRES; start--) run += metres(window[start - 1], window[start]);
let end = local;
for (let run = 0; end < window.length - 1 && run < AFTER_METRES; end++) run += metres(window[end], window[end + 1]);
const slice = window.slice(start, end + 1);
let stationAlong = 0;
for (let i = start; i < local; i++) stationAlong += metres(window[i], window[i + 1]);
let length = 0;
for (let i = 1; i < slice.length; i++) length += metres(slice[i - 1], slice[i]);

writeFileSync(ROUTE_TARGET, JSON.stringify({
  type: 'Feature',
  properties: {
    ...feature.properties,
    generator: 'scripts/build-beaufort-west-data.mjs',
    note: `Beaufort West slice of ${SOURCE}, ${BEFORE_METRES} m before the station to ${AFTER_METRES} m after; ${spliced} doubled-back points spliced out.`,
    sliceMetres: Math.round(length),
    stationAlongMetres: Math.round(stationAlong),
    stationNode: 8148099536,
  },
  geometry: { type: 'LineString', coordinates: slice },
}));
console.log(`${ROUTE_TARGET}: ${slice.length} points, ${Math.round(length)} m, station at ${Math.round(stationAlong)} m, ${spliced} points spliced`);

// ---------------------------------------------------------------- town
if (!existsSync(OSM)) {
  console.log(`${OSM} missing; keeping the existing ${TOWN_TARGET}`);
  process.exit(0);
}
const xml = readFileSync(OSM, 'utf8');
const attr = (text, key) => text.match(new RegExp(` ${key}="([^"]*)"`))?.[1];
const round = ([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
const nodes = new Map();
const tagged = [];
const tagsOf = text => Object.fromEntries([...text.matchAll(/k="([^"]+)" v="([^"]*)"/g)].map(t => [t[1], t[2]]));
for (const m of xml.matchAll(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
  const head = ` ${m[1]}`, point = [+attr(head, 'lon'), +attr(head, 'lat')];
  nodes.set(attr(head, 'id'), point);
  if (m[3]) tagged.push({ type: 'node', id: +attr(head, 'id'), point, tags: tagsOf(m[3]) });
}
for (const m of xml.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)) {
  const line = [...m[2].matchAll(/nd ref="(\d+)"/g)].map(n => nodes.get(n[1])).filter(Boolean).map(round);
  if (line.length) tagged.push({ type: 'way', id: +attr(` ${m[1]}`, 'id'), line, tags: tagsOf(m[2]) });
}
const near = (points, radius) => points.some(p => metres(p, STATION) < radius);

const platforms = tagged.filter(e => e.type === 'way' && e.tags.railway === 'platform' && near(e.line, 400))
  .map(e => ({ id: e.id, outline: e.line }));
const yard = tagged.filter(e => e.type === 'way' && e.tags.railway === 'rail' && near(e.line, YARD_RADIUS))
  .map(e => ({ id: e.id, service: e.tags.service ?? null, line: e.line.filter(p => metres(p, STATION) < YARD_RADIUS * 1.4) }))
  .filter(e => e.line.length >= 2);

/** The landmarks the chapter tells, by OSM id. Kinds drive the authored model. */
const LANDMARKS = [
  { osm: 764605918, kind: 'church', title: 'NG Kerk Beaufort West', note: 'The Dutch Reformed mother church, the town\'s tallest landmark.' },
  { osm: 628759947, kind: 'museum', title: 'Beaufort West Museum', note: 'Museum complex that includes the Dr Chris Barnard collection; OSM dates the building to 1939.' },
  { osm: 1436600947, kind: 'blockhouse', title: 'Beaufort West Blockhouse', note: 'An Anglo-Boer War blockhouse guarding the railway north of the station.' },
  { osm: 7341728860, kind: 'chapel', title: 'NG Kerk Gamka Vallei', note: 'Dutch Reformed congregation west of the line.' },
  { osm: 7341728861, kind: 'chapel', title: 'NG Kerk Gamka Oos', note: 'Dutch Reformed congregation in the south-east of town.' },
];
const landmarks = LANDMARKS.map(spec => {
  const e = tagged.find(t => t.id === spec.osm);
  if (!e) throw new Error(`OSM ${spec.osm} (${spec.title}) is not in ${OSM}`);
  const outline = e.type === 'way' ? e.line : null;
  const point = e.type === 'node' ? e.point : outline.reduce((a, p) => [a[0] + p[0] / outline.length, a[1] + p[1] / outline.length], [0, 0]);
  return { ...spec, name: e.tags.name ?? spec.title, source: `OSM ${e.type} ${e.id}`, confidence: 'OSM-mapped', location: round(point), outline, startDate: e.tags.start_date ?? null };
});
// One anchor that is not in OSM: SANParks publishes the park gate itself.
landmarks.push({
  osm: null, kind: 'park-gate', title: 'Karoo National Park', name: 'Karoo National Park entrance',
  note: 'Proclaimed in 1979. Gate coordinate as published by SANParks: 32°21′48.2″ S, 22°32′28.4″ E.',
  source: 'SANParks', confidence: 'Verified SANParks waypoint', location: [22.5412222, -32.3633889], outline: null, startDate: '1979',
});

writeFileSync(TOWN_TARGET, JSON.stringify({
  generator: 'scripts/build-beaufort-west-data.mjs',
  source: `OpenStreetMap contributors (ODbL), extract ${OSM}; SANParks for the park gate`,
  station: STATION, platforms, yard, landmarks,
}));
console.log(`${TOWN_TARGET}: ${platforms.length} platforms, ${yard.length} yard tracks, ${landmarks.length} landmarks`);
