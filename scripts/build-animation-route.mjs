// Cut the animation slice out of the full corridor.
//
// The 3D animation only ever draws from -500 m to 5,000 m out of Pretoria, but
// it was fetching the whole 1,578 km route: 1.56 MB to render 5 km. This writes
// the slice it actually uses.
//
//   node scripts/build-animation-route.mjs
import { readFileSync, writeFileSync } from 'node:fs';

// Write into data/, not public/data/ - build-assets wipes and repopulates
// public/data from here on every build.
const SOURCE = 'data/route-ride.geojson';
const TARGET = 'data/route-animation.geojson';
// RailScene lays sleepers from -500 m and track to 5,000 m. The headroom covers
// the look-ahead the camera and the train consist need past the end.
const SLICE_METRES = 6_500;

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const feature = source.type === 'FeatureCollection' ? source.features[0] : source;
const coordinates = feature.geometry.coordinates;

let travelled = 0;
const slice = [coordinates[0]];
for (let i = 1; i < coordinates.length && travelled < SLICE_METRES; i++) {
  const [x1, y1] = coordinates[i - 1];
  const [x2, y2] = coordinates[i];
  travelled += Math.hypot((x2 - x1) * 111_320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110_540);
  slice.push(coordinates[i]);
}

const out = {
  type: 'Feature',
  properties: {
    ...feature.properties,
    generator: 'scripts/build-animation-route.mjs',
    note: `First ${Math.round(travelled)} m of ${SOURCE}, for the 3D animation only. The satellite map uses the full corridor.`,
    sliceMetres: Math.round(travelled),
  },
  geometry: { type: 'LineString', coordinates: slice },
};

writeFileSync(TARGET, JSON.stringify(out));
const before = readFileSync(SOURCE).length;
const after = readFileSync(TARGET).length;
console.log(`${TARGET}: ${slice.length} points, ${Math.round(travelled)} m`);
console.log(`${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
