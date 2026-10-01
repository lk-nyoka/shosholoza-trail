import { mkdir, cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
await mkdir('public/vendor', { recursive: true });
// The overview and ride consume the same authored Imhof recipe and solar model.
await build({ entryPoints: ['app/src/imhof-relief.ts'], bundle: true, format: 'esm', minify: true, outfile: 'public/map/imhof-relief.js' });
await cp('node_modules/suncalc/LICENSE', 'public/vendor/SUNCALC-LICENSE');
// MapLibre is served from the same origin so the immersive map has no runtime
// dependency on a JavaScript CDN. Basemap tiles remain provider-hosted and are
// never prefetched by the offline pack.
await rm('public/vendor/maplibre-gl', { recursive: true, force: true });
await mkdir('public/vendor/maplibre-gl', { recursive: true });
// v6 dropped the UMD/global bundle; it ships ESM only, with the worker split
// into its own file (which itself imports the -shared.mjs sibling). All three
// must sit together so the browser's relative-import resolution finds them.
for (const file of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl.css']) {
  await cp(`node_modules/maplibre-gl/dist/${file}`, `public/vendor/maplibre-gl/${file}`);
}
await cp('node_modules/maplibre-gl/LICENSE.txt', 'public/vendor/maplibre-gl/LICENSE.txt');
await build({ stdin: { contents: "export {nearestPointOnLine,point,distance,along,length} from '@turf/turf';", resolveDir: process.cwd() }, bundle: true, format: 'esm', minify: true, outfile: 'public/vendor/turf.js' });
await cp('node_modules/@turf/turf/LICENSE', 'public/vendor/TURF-LICENSE');
// These directories are generated copies. Clear stale harness traces/results so
// the passenger pack never absorbs the full laboratory corpus by accident.
await rm('public/data', { recursive: true, force: true });
await rm('public/results', { recursive: true, force: true });
await mkdir('public/data/traces', { recursive: true });
for (const file of ['route.geojson', 'hubs.json', 'pack.v1.json', 'sources.json']) {
  await cp(`data/${file}`, `public/data/${file}`);
}
// The detailed rail geometry is part of the passenger pack so the verified
// corridor, ride controls and discoveries continue without a network. Online
// imagery/terrain enhance it when available.
await cp('data/route-ride.geojson', 'public/data/route-ride.geojson');
await cp('data/cape-town-rail.geojson', 'public/data/cape-town-rail.geojson');
// The 3D animation only draws the first 6.5 km, so it gets its own slice
// instead of downloading the whole 1.56 MB corridor. See scripts/build-animation-route.mjs.
await cp('data/route-animation.geojson', 'public/data/route-animation.geojson');
// The connected Pretoria–Johannesburg preview must survive a full asset rebuild.
await cp('data/route-gauteng.geojson', 'public/data/route-gauteng.geojson');
// Landmarks are content, not code: one JSON per place, copied verbatim.
await cp('data/landmarks', 'public/data/landmarks', { recursive: true });
// Sourced OSM administrative boundaries for each stop, drawn on the map.
await cp('data/location-boundaries.geojson', 'public/data/location-boundaries.geojson');
// The De Aar junction chapter's rail network, switches and platforms.
await cp('data/deaar/derived', 'public/data/deaar/v1', { recursive: true });
// Real OSM footprints for the animation corridor. See scripts/fetch-osm-buildings.mjs.
await cp('data/pretoria-buildings.json', 'public/data/pretoria-buildings.json');
await cp('data/pretoria-roads.json', 'public/data/pretoria-roads.json');
// Elevation grid for the animation. See scripts/fetch-terrain.mjs.
await cp('data/pretoria-terrain.json', 'public/data/pretoria-terrain.json');
// Named places the train passes. See scripts/fetch-osm-places.mjs.
await cp('data/pretoria-places.json', 'public/data/pretoria-places.json');
// The Kimberley chapter: its own rail slice, terrain, town and the station /
// tramway detail. See scripts/build-kimberley-route.mjs and
// scripts/extract-kimberley-heritage.mjs.
for (const file of ['route-kimberley.geojson', 'kimberley-terrain.json', 'kimberley-buildings.json', 'kimberley-roads.json', 'kimberley-heritage.json']) {
  await cp(`data/${file}`, `public/data/${file}`);
}
// The Beaufort West chapter. See scripts/build-beaufort-west-data.mjs.
for (const file of ['route-beaufort-west.geojson', 'beaufort-west-terrain.json', 'beaufort-west-buildings.json', 'beaufort-west-roads.json', 'beaufort-west-town.json']) {
  await cp(`data/${file}`, `public/data/${file}`);
}
await cp('data/traces/demo-corridor.json', 'public/data/traces/demo-corridor.json');
await mkdir('public/results', { recursive: true });
for (const file of ['r3.json', 'r3-corridor.json', 'r10.json']) await cp(`results/${file}`, `public/results/${file}`);
async function walk(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}
const assets = [];
for (const file of (await walk('public')).sort()) {
  if (file.endsWith('/pack-manifest.json') || file.endsWith('/sw.js') || file.includes('/data/traces/') && !file.includes('/demo')) continue;
  const bytes = await readFile(file);
  assets.push({ url: file.slice(6), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const hash = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
await writeFile('public/pack-manifest.json', JSON.stringify({ version: 1, hash, bytes: assets.reduce((n, a) => n + a.bytes, 0), assets }, null, 2));
console.log(`Pack manifest: ${assets.length} files, ${assets.reduce((n, a) => n + a.bytes, 0)} bytes, SHA-256 ${hash}`);
