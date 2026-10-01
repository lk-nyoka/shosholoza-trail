// Pull the Kimberley-specific railway detail out of the saved OSM extract.
//
// data/provenance/kimberley.osm is a full OSM download around the station and
// the Big Hole. The generic fetch scripts only take buildings, roads and named
// places; this takes what makes Kimberley Kimberley: the three platforms, the
// station yard tracks, the heritage tramway to the Big Hole and the preserved
// Class 25NC on the station forecourt.
//
//   node scripts/extract-kimberley-heritage.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'data/provenance/kimberley.osm';
const TARGET = 'data/kimberley-heritage.json';
const STATION = [24.7698702, -28.7353474];
/** Yard tracks further than this from the station are not drawn. */
const YARD_RADIUS = 900;

const xml = readFileSync(SOURCE, 'utf8');
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[3], +m[2]]);

const metres = ([x1, y1], [x2, y2]) =>
  Math.hypot((x2 - x1) * 111_320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110_540);
const round = ([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];

const platforms = [], yard = [], tram = [], preserved = [];
let tramStop = null;
for (const m of xml.matchAll(/<way id="(\d+)"[\s\S]*?<\/way>/g)) {
  const way = m[0];
  const tags = Object.fromEntries([...way.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map(t => [t[1], t[2]]));
  const coordinates = [...way.matchAll(/<nd ref="(\d+)"/g)].map(n => nodes.get(n[1])).filter(Boolean).map(round);
  if (coordinates.length < 2) continue;
  const near = coordinates.some(c => metres(c, STATION) < YARD_RADIUS);
  if (tags.railway === 'platform' && near) platforms.push({ id: +m[1], ref: tags.ref ?? null, outline: coordinates });
  else if (tags.railway === 'rail' && near && !tags.service?.match(/^(spur)$/)) yard.push({ id: +m[1], service: tags.service ?? null, line: coordinates });
  else if (tags.railway === 'tram') tram.push({ id: +m[1], note: tags.note ?? null, line: coordinates });
  else if (tags.railway === 'preserved') preserved.push({ id: +m[1], description: tags.description ?? null, line: coordinates });
  else if (tags.railway === 'station' && tags.name === 'Market Square') tramStop = { id: +m[1], name: tags.name, outline: coordinates };
}

// The tramway comes as one way; orient it to start at Market Square.
if (tramStop && tram[0]) {
  const line = tram[0].line;
  if (metres(line.at(-1), tramStop.outline[0]) < metres(line[0], tramStop.outline[0])) line.reverse();
}

writeFileSync(TARGET, JSON.stringify({
  generator: 'scripts/extract-kimberley-heritage.mjs',
  source: 'OpenStreetMap contributors (ODbL), saved extract ' + SOURCE,
  station: STATION,
  platforms, yard, tram, preserved, tramStop,
}));
const tramLength = tram[0] ? tram[0].line.slice(1).reduce((sum, c, i) => sum + metres(tram[0].line[i], c), 0) : 0;
console.log(`${TARGET}: ${platforms.length} platforms, ${yard.length} yard tracks, tram ${Math.round(tramLength)} m, ${preserved.length} preserved`);
if (tram[0]) console.log('tram from', tram[0].line[0], 'to', tram[0].line.at(-1));
