// Cut the Kimberley slice out of the full corridor for the Kimberley chapter.
//
// The slice runs in the direction of travel (Johannesburg -> Cape Town), from
// BEFORE_METRES north of the station to AFTER_METRES past it, so the chapter
// can bring the train in, stop it at the platform and send it on its way.
//
//   node scripts/build-kimberley-route.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'data/route-ride.geojson';
const TARGET = 'data/route-kimberley.geojson';
// OSM node 247327890, Kimberley station.
const STATION = [24.7698702, -28.7353474];
const BEFORE_METRES = 3_000;
const AFTER_METRES = 1_600;

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const feature = source.type === 'FeatureCollection' ? source.features[0] : source;
const coordinates = feature.geometry.coordinates;

const metres = ([x1, y1], [x2, y2]) =>
  Math.hypot((x2 - x1) * 111_320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110_540);

let station = 0;
let best = Infinity;
coordinates.forEach((point, i) => {
  const d = metres(point, STATION);
  if (d < best) { best = d; station = i; }
});
if (best > 50) throw new Error(`Nearest route point is ${Math.round(best)} m from Kimberley station`);

let start = station;
for (let run = 0; start > 0 && run < BEFORE_METRES; start--) run += metres(coordinates[start - 1], coordinates[start]);
let end = station;
for (let run = 0; end < coordinates.length - 1 && run < AFTER_METRES; end++) run += metres(coordinates[end], coordinates[end + 1]);

const slice = coordinates.slice(start, end + 1);
let stationAlong = 0;
for (let i = start; i < station; i++) stationAlong += metres(coordinates[i], coordinates[i + 1]);
let length = 0;
for (let i = 1; i < slice.length; i++) length += metres(slice[i - 1], slice[i]);

writeFileSync(TARGET, JSON.stringify({
  type: 'Feature',
  properties: {
    ...feature.properties,
    generator: 'scripts/build-kimberley-route.mjs',
    note: `Kimberley slice of ${SOURCE}: ${BEFORE_METRES} m before the station to ${AFTER_METRES} m after, for the Kimberley chapter only.`,
    sliceMetres: Math.round(length),
    stationAlongMetres: Math.round(stationAlong),
    stationNode: 247327890,
  },
  geometry: { type: 'LineString', coordinates: slice },
}));
console.log(`${TARGET}: ${slice.length} points, ${Math.round(length)} m, station at ${Math.round(stationAlong)} m`);
