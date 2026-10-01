// Bake a heightfield for the animation corridor.
//
// The 3D animation's ground is a flat plane, which is the last big lie in the
// scene: Pretoria sits in a valley between ridges, and Salvokop - the hill
// Freedom Park stands on - rises 60 m right beside the line. Flat ground makes
// every landmark look like it is sitting on a table.
//
// Elevation comes from the Mapzen terrarium tiles on AWS Open Data, which are
// keyless and free, the same source the satellite ride already uses for its
// terrain. Tiles are PNG, and Node has no PNG decoder, so there is a small one
// below - terrarium tiles are 8-bit non-interlaced, which is the easy case.
//
//   node scripts/fetch-terrain.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ROUTE = process.env.ROUTE ?? 'data/route-animation.geojson';
const TARGET = process.env.TARGET ?? 'data/pretoria-terrain.json';
const ZOOM = 14;
const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
/** Margin around the route, in metres. Wide enough to cover the far ridges. */
const MARGIN = Number(process.env.MARGIN ?? 1_800);
/** Samples across the baked grid. 160x160 over ~10 km is about 60 m spacing. */
const GRID = Number(process.env.GRID ?? 160);

// --- minimal PNG decode ----------------------------------------------------

/** Undo one PNG scanline filter. Spec section 9.2. */
function unfilter(type, line, previous, bpp) {
  const out = Buffer.alloc(line.length);
  for (let i = 0; i < line.length; i++) {
    const raw = line[i];
    const a = i >= bpp ? out[i - bpp] : 0;
    const b = previous ? previous[i] : 0;
    const c = i >= bpp && previous ? previous[i - bpp] : 0;
    let value;
    switch (type) {
      case 0: value = raw; break;
      case 1: value = raw + a; break;
      case 2: value = raw + b; break;
      case 3: value = raw + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: throw new Error(`unknown PNG filter ${type}`);
    }
    out[i] = value & 0xff;
  }
  return out;
}

/** Decode an 8-bit non-interlaced PNG to { width, height, channels, data }. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0, height = 0, colourType = 0, bitDepth = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not supported`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType];
  if (!channels) throw new Error(`colour type ${colourType} not supported`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(height * stride);
  let previous = null;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const line = raw.subarray(start + 1, start + 1 + stride);
    const decoded = unfilter(raw[start], line, previous, channels);
    decoded.copy(data, y * stride);
    previous = decoded;
  }
  return { width, height, channels, data };
}

// --- tiles -----------------------------------------------------------------

const lonToTile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToTile = (lat, z) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
};

const route = JSON.parse(readFileSync(ROUTE, 'utf8'));
const line = (route.features ? route.features[0].geometry : route.geometry).coordinates;
const lons = line.map(c => c[0]), lats = line.map(c => c[1]);
const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
const padLon = MARGIN / (111_320 * Math.cos((midLat * Math.PI) / 180));
const padLat = MARGIN / 110_540;

const west = Math.min(...lons) - padLon, east = Math.max(...lons) + padLon;
const south = Math.min(...lats) - padLat, north = Math.max(...lats) + padLat;

const x0 = Math.floor(lonToTile(west, ZOOM)), x1 = Math.floor(lonToTile(east, ZOOM));
const y0 = Math.floor(latToTile(north, ZOOM)), y1 = Math.floor(latToTile(south, ZOOM));

const tiles = new Map();
const missing = [];
let fetched = 0;
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    const url = TILE.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
    let ok = false;
    // Two attempts: a single flaky response should not cost the whole build.
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const response = await fetch(url, { headers: { 'User-Agent': 'ShosholozaTrail/1.0 (hackathon prototype)' } });
      if (!response.ok) { console.log(`  ${x}/${y}: ${response.status}${attempt ? '' : ', retrying'}`); continue; }
      tiles.set(`${x}/${y}`, decodePng(Buffer.from(await response.arrayBuffer())));
      fetched++;
      ok = true;
    }
    if (!ok) missing.push(`${x}/${y}`);
  }
}
console.log(`fetched ${fetched} terrarium tiles at z${ZOOM}`);
// Any hole in the grid bakes as 0 m against real ground of ~1 300 m, which is a
// several-hundred-metre cliff in the scene. Better no file than that file.
if (missing.length) throw new Error(`missing elevation tiles: ${missing.join(', ')} - refusing to bake a partial heightfield`);

/** Elevation in metres at a coordinate, or null outside the fetched tiles. */
function elevationAt(lon, lat) {
  const fx = lonToTile(lon, ZOOM), fy = latToTile(lat, ZOOM);
  const tile = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
  if (!tile) return null;
  const px = Math.min(tile.width - 1, Math.floor((fx % 1) * tile.width));
  const py = Math.min(tile.height - 1, Math.floor((fy % 1) * tile.height));
  const at = (py * tile.width + px) * tile.channels;
  // Terrarium encoding: (red * 256 + green + blue / 256) - 32768.
  return tile.data[at] * 256 + tile.data[at + 1] + tile.data[at + 2] / 256 - 32768;
}

// --- bake ------------------------------------------------------------------

const heights = new Array(GRID * GRID);
let min = Infinity, max = -Infinity;
for (let row = 0; row < GRID; row++) {
  const lat = north + ((south - north) * row) / (GRID - 1);
  for (let column = 0; column < GRID; column++) {
    const lon = west + ((east - west) * column) / (GRID - 1);
    const value = elevationAt(lon, lat);
    if (value === null) throw new Error(`no elevation at ${lon},${lat} - the tile grid does not cover the corridor`);
    heights[row * GRID + column] = Math.round(value * 10) / 10;
    if (value < min) min = value;
    if (value > max) max = value;
  }
}

// Elevation along the route, which the track will be graded onto.
const alongRoute = [];
for (let i = 0; i < line.length; i += 4) {
  const value = elevationAt(line[i][0], line[i][1]);
  if (value === null) throw new Error(`no elevation on the route at ${line[i]}`);
  alongRoute.push(Math.round(value * 10) / 10);
}

writeFileSync(TARGET, JSON.stringify({
  generator: 'scripts/fetch-terrain.mjs',
  source: 'Mapzen terrarium tiles, AWS Open Data. Underlying data: SRTM, NED and others, public domain.',
  note: `Elevation grid over the animation corridor, ${GRID}x${GRID} samples. Row 0 is the north edge.`,
  fetched: new Date().toISOString().slice(0, 10),
  zoom: ZOOM,
  grid: GRID,
  bounds: { west, east, south, north },
  minMetres: Math.round(min * 10) / 10,
  maxMetres: Math.round(max * 10) / 10,
  routeSampleStride: 4,
  alongRoute,
  heights,
}));

console.log(`${TARGET}: ${GRID}x${GRID} grid, ${min.toFixed(1)}-${max.toFixed(1)} m`);
console.log(`route rises ${(Math.max(...alongRoute) - Math.min(...alongRoute)).toFixed(1)} m over the slice`);
console.log(`${Math.round(readFileSync(TARGET).length / 1024)} KB`);
