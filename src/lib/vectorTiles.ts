/**
 * A small Mapbox Vector Tile reader, plus an OpenFreeMap client.
 *
 * OpenFreeMap serves the full OpenMapTiles schema with no API key, no quota and
 * no billing - which makes it the free stand-in for Google Photorealistic 3D
 * Tiles, and also the way around Overpass being blocked on this network. The
 * layers that matter here:
 *
 *   building        - footprints with render_height / render_min_height
 *   transportation  - class=rail, plus `brunnel` marking bridge / tunnel / ford
 *   poi             - station points, for snapping stops onto the line
 *
 * The decoder is hand-written rather than pulled from npm (pbf +
 * @mapbox/vector-tile): installs keep dying in this workspace, and the MVT 2.1
 * wire format is small enough to read directly.
 */

export type Ring = [number, number][];

export interface VectorFeature {
  /** 1 point, 2 linestring, 3 polygon. */
  geometryType: number;
  properties: Record<string, string | number | boolean>;
  /** Tile-local coordinates, 0..extent. */
  rings: Ring[];
}

export interface VectorLayer {
  extent: number;
  features: VectorFeature[];
}

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  get done() {
    return this.pos >= this.buf.length;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.buf[this.pos++];
      // Math.pow rather than << so varints past 32 bits do not wrap.
      result += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while (byte >= 0x80);
    return result;
  }

  /** Zig-zag decode, used for geometry deltas and sint fields. */
  svarint(): number {
    const value = this.varint();
    return value % 2 === 1 ? (value + 1) / -2 : value / 2;
  }

  bytes(): Uint8Array {
    const length = this.varint();
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  double(): number {
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return view.getFloat64(0, true);
  }

  float(): number {
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4);
    this.pos += 4;
    return view.getFloat32(0, true);
  }

  skip(wireType: number) {
    if (wireType === 0) this.varint();
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) this.pos += this.varint();
    else if (wireType === 5) this.pos += 4;
    else throw new Error(`Unsupported wire type ${wireType}`);
  }
}

function readValue(reader: Reader): string | number | boolean {
  let value: string | number | boolean = "";
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (field === 1) value = reader.string();
    else if (field === 2) value = reader.float();
    else if (field === 3) value = reader.double();
    else if (field === 4 || field === 5) value = reader.varint();
    else if (field === 6) value = reader.svarint();
    else if (field === 7) value = reader.varint() !== 0;
    else reader.skip(wire);
  }
  return value;
}

/** Decode the command/parameter stream into rings of tile-local coordinates. */
function readGeometry(reader: Reader): Ring[] {
  const rings: Ring[] = [];
  let ring: Ring = [];
  let x = 0;
  let y = 0;
  while (!reader.done) {
    const command = reader.varint();
    const id = command & 0x7;
    const count = command >> 3;
    if (id === 1) {
      // MoveTo starts a new ring (or a run of points).
      for (let index = 0; index < count; index += 1) {
        if (ring.length) rings.push(ring);
        ring = [];
        x += reader.svarint();
        y += reader.svarint();
        ring.push([x, y]);
      }
    } else if (id === 2) {
      for (let index = 0; index < count; index += 1) {
        x += reader.svarint();
        y += reader.svarint();
        ring.push([x, y]);
      }
    } else if (id === 7) {
      if (ring.length) {
        ring.push([ring[0][0], ring[0][1]]);
        rings.push(ring);
        ring = [];
      }
    }
  }
  if (ring.length) rings.push(ring);
  return rings;
}

function readFeature(reader: Reader, keys: string[], values: (string | number | boolean)[]): VectorFeature {
  const feature: VectorFeature = { geometryType: 0, properties: {}, rings: [] };
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (field === 2) {
      const packed = new Reader(reader.bytes());
      while (!packed.done) {
        const key = keys[packed.varint()];
        const value = values[packed.varint()];
        if (key !== undefined) feature.properties[key] = value;
      }
    } else if (field === 3) {
      feature.geometryType = reader.varint();
    } else if (field === 4) {
      feature.rings = readGeometry(new Reader(reader.bytes()));
    } else {
      reader.skip(wire);
    }
  }
  return feature;
}

export function decodeVectorTile(buffer: ArrayBuffer): Map<string, VectorLayer> {
  const layers = new Map<string, VectorLayer>();
  const reader = new Reader(new Uint8Array(buffer));
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (field !== 3) {
      reader.skip(wire);
      continue;
    }
    const layerReader = new Reader(reader.bytes());
    let name = "";
    let extent = 4096;
    const keys: string[] = [];
    const values: (string | number | boolean)[] = [];
    const featureBlobs: Uint8Array[] = [];
    while (!layerReader.done) {
      const layerTag = layerReader.varint();
      const layerField = layerTag >> 3;
      const layerWire = layerTag & 0x7;
      if (layerField === 1) name = layerReader.string();
      else if (layerField === 2) featureBlobs.push(layerReader.bytes());
      else if (layerField === 3) keys.push(layerReader.string());
      else if (layerField === 4) values.push(readValue(new Reader(layerReader.bytes())));
      else if (layerField === 5) extent = layerReader.varint();
      else layerReader.skip(layerWire);
    }
    layers.set(name, {
      extent,
      features: featureBlobs.map(blob => readFeature(new Reader(blob), keys, values)),
    });
  }
  return layers;
}

// ── OpenFreeMap client ──────────────────────────────────────────────────────

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_MAX_ZOOM = 14;

let templatePromise: Promise<string> | null = null;

/**
 * The tile path carries a dated build id that changes when OpenFreeMap
 * republishes the planet, so the template is read from TileJSON at runtime
 * rather than hard-coded.
 */
export function openFreeMapTemplate(): Promise<string> {
  if (!templatePromise) {
    templatePromise = fetch(TILEJSON_URL)
      .then(response => response.json())
      .then((meta: { tiles?: string[] }) => {
        const template = meta.tiles?.[0];
        if (!template) throw new Error("OpenFreeMap TileJSON had no tile template");
        return template;
      })
      .catch(error => {
        templatePromise = null;
        throw error;
      });
  }
  return templatePromise;
}

/**
 * Bounded, for the same reason the imagery cache is: a decoded vector tile holds
 * every building footprint and road in a 2.5 km square, and over a 1,568 km
 * journey that is hundreds of them sitting in memory for no reason. The browser
 * running out of resources partway down the route is what made everything south
 * of it blank.
 */
const TILE_CACHE_LIMIT = 120;

const tileCache = new Map<string, Promise<Map<string, VectorLayer>>>();

export function fetchVectorTile(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const pending = openFreeMapTemplate()
    .then(template =>
      fetch(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))),
    )
    .then(response => {
      if (!response.ok) throw new Error(`Vector tile ${key}: ${response.status}`);
      return response.arrayBuffer();
    })
    .then(decodeVectorTile);
  tileCache.set(key, pending);
  while (tileCache.size > TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next();
    if (oldest.done) break;
    tileCache.delete(oldest.value);
  }
  return pending;
}

/** Convert a tile-local coordinate to lon/lat for the given tile. */
export function tileToLonLat(
  point: [number, number],
  extent: number,
  z: number,
  x: number,
  y: number,
): [number, number] {
  const n = 2 ** z;
  const lon = ((x + point[0] / extent) / n) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + point[1] / extent)) / n))) * 180) / Math.PI;
  return [lon, lat];
}
