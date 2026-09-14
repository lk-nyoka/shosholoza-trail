/**
 * Web-Mercator tile maths and tile fetching for the 3D ride world.
 *
 * The scene works in a LOCAL METRIC FRAME: one world unit is one metre, and the
 * origin is re-centred on the train as it travels (a floating origin). That is
 * what lets us drape real high-zoom satellite imagery at eye level. The previous
 * frame packed ~795 m into a single world unit, so no imagery could ever resolve
 * into anything but a beige smear.
 */

export type LatLng = [number, number];

export const EQUATOR_METRES = 2 * Math.PI * 6378137;
export const M_PER_DEG_LAT = 111320;

export const metresPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/** Local metric offset from `origin`. +x is east, -z is north (three.js convention). */
export function toLocalMetres(point: LatLng, origin: LatLng) {
  return {
    x: (point[1] - origin[1]) * metresPerDegLon(origin[0]),
    z: -(point[0] - origin[0]) * M_PER_DEG_LAT,
  };
}

export function fromLocalMetres(x: number, z: number, origin: LatLng): LatLng {
  return [origin[0] - z / M_PER_DEG_LAT, origin[1] + x / metresPerDegLon(origin[0])];
}

export function tileCoords(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  };
}

export function tileBounds(tileX: number, tileY: number, zoom: number) {
  const n = 2 ** zoom;
  const latAt = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return {
    lonWest: (tileX / n) * 360 - 180,
    lonEast: ((tileX + 1) / n) * 360 - 180,
    latNorth: latAt(tileY),
    latSouth: latAt(tileY + 1),
  };
}

/** Ground width of one tile in metres, at this zoom and latitude. */
export const tileSpanMetres = (zoom: number, lat: number) =>
  (EQUATOR_METRES * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/**
 * Esri World Imagery is addressed /tile/{z}/{row}/{col} - ROW (y) before COL (x).
 * Terrarium elevation is addressed /{z}/{x}/{y}.png - X first.
 *
 * Getting these two the same way round is the whole ball game. Feeding one
 * scheme's coordinates to the other silently returns imagery of a completely
 * different part of the planet, with no error anywhere - which is exactly what
 * used to happen here (South Africa's z4 tile is 9/9; the old code asked for
 * 11/8, i.e. the Bay of Bengal and the Southern Ocean).
 */
export const esriImageryUrl = (tileX: number, tileY: number, zoom: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;

export const terrariumUrl = (tileX: number, tileY: number, zoom: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tileX}/${tileY}.png`;

/**
 * Nothing here may hang forever.
 *
 * A tile request that never settles is not a slow tile, it is a stopped world:
 * the ride waits on the elevation model before it rebuilds the corridor, so one
 * stalled connection left the whole scene frozen at whatever the camera was
 * doing when it started - which looked exactly like the ride being broken. A
 * tile that does not arrive in time is simply a tile we do not have.
 */
const TILE_TIMEOUT_MS = 9000;

function withTimeout<T>(work: Promise<T>, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("Tile timed out"));
    }, TILE_TIMEOUT_MS);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The tile caches have to be bounded, and the blobs have to be released.
 *
 * They were not, and that is why the ride went blank somewhere past Kimberley:
 * every tile fetched over 1,568 km stayed in memory - a decoded 256x256 bitmap
 * is a quarter of a megabyte, and each one also held an object URL that was
 * never revoked. A few thousand tiles in, the browser stops issuing requests
 * altogether (ERR_INSUFFICIENT_RESOURCES) and nothing more will ever load. The
 * whole route south of wherever that happened was the consequence.
 *
 * Evicting is cheap: a tile that is needed again is still in the browser's own
 * HTTP cache, so a re-fetch costs a decode, not a download.
 */
const IMAGE_CACHE_LIMIT = 500;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const imageBytes = new Map<string, number>();

function remember(url: string, pending: Promise<HTMLImageElement>) {
  imageCache.set(url, pending);
  while (imageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next();
    if (oldest.done) break;
    imageCache.delete(oldest.value);
    imageBytes.delete(oldest.value);
  }
  return pending;
}

/** Transferred size of a tile, once loaded. Blank "no data" tiles are tiny. */
export const tileByteSize = (url: string) => imageBytes.get(url) ?? -1;

/**
 * Load a tile and remember how many bytes it was.
 *
 * Esri answers 200 for tiles it has no imagery for, returning a near-empty
 * placeholder - measured at about 2 KB with almost no local contrast, versus
 * 12-23 KB for real imagery. Size is the cheapest way to tell them apart, and
 * it lets the highest-detail ring skip gaps instead of pasting flat grey over
 * the coarser ring underneath.
 */
export function loadImageSized(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const controller = new AbortController();
  const pending = withTimeout(
    fetch(url, { signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Tile ${response.status}`);
      const blob = await response.blob();
      imageBytes.set(url, blob.size);
      const image = new Image();
      image.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Decode failed: ${url}`));
          image.src = objectUrl;
        });
      } finally {
        // The bitmap is decoded and owned by the Image now; the blob behind the
        // URL is dead weight and leaks until it is revoked.
        URL.revokeObjectURL(objectUrl);
      }
      return image;
    }),
    () => controller.abort(),
  ).catch(error => {
    imageCache.delete(url);
    throw error;
  });
  return remember(url, pending);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const image = new Image();
  const pending = withTimeout(
    new Promise<HTMLImageElement>((resolve, reject) => {
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Tile unavailable: ${url}`));
      image.src = url;
    }),
    () => {
      image.src = "";
    },
  ).catch(error => {
    imageCache.delete(url);
    throw error;
  });
  return remember(url, pending);
}

function toImageData(image: HTMLImageElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 256;
  canvas.height = image.naturalHeight || 256;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  try {
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null; // cross-origin taint; pixel sampling is a nicety, never fatal
  }
}

abstract class TileSampler {
  protected tiles = new Map<string, ImageData | null>();
  /**
   * Decoded pixel data is the expensive half: 256 x 256 x 4 bytes each, held so
   * heightAt() and colourAt() stay synchronous. Six hundred of them is about
   * 150 MB, which is a sane ceiling for a journey this long; past that the
   * oldest go, and the path prefetch pulls back whatever the window still needs.
   */
  private static readonly LIMIT = 600;
  constructor(protected zoom: number) {}
  protected abstract url(tileX: number, tileY: number, zoom: number): string;

  protected evict() {
    while (this.tiles.size > TileSampler.LIMIT) {
      const oldest = this.tiles.keys().next();
      if (oldest.done) break;
      this.tiles.delete(oldest.value);
    }
  }

  /** Load every tile covering this box, then `sample` becomes a cheap sync lookup. */
  async prefetch(latNorth: number, latSouth: number, lonWest: number, lonEast: number) {
    const topLeft = tileCoords(latNorth, lonWest, this.zoom);
    const bottomRight = tileCoords(latSouth, lonEast, this.zoom);
    const jobs: Promise<void>[] = [];
    for (let tx = Math.floor(topLeft.x); tx <= Math.floor(bottomRight.x); tx += 1) {
      for (let ty = Math.floor(topLeft.y); ty <= Math.floor(bottomRight.y); ty += 1) {
        const key = `${tx}/${ty}`;
        if (this.tiles.has(key)) continue;
        this.tiles.set(key, null);
        jobs.push(
          loadImage(this.url(tx, ty, this.zoom))
            .then(image => void this.tiles.set(key, toImageData(image)))
            .catch(() => undefined),
        );
      }
    }
    await Promise.all(jobs);
    this.evict();
  }

  /**
   * Load every tile the given path crosses, plus a ring of neighbours.
   *
   * prefetch() takes a bounding box, which is the wrong shape for a railway: a
   * 40 km window of a diagonal line has a 40 x 40 km box around it, a hundred
   * tiles of which the line touches maybe fifteen. The rest of the box was
   * either never fetched - leaving heightAt() to answer 0, which is sea level,
   * which put the track underground - or fetched at enormous cost. Follow the
   * line instead.
   */
  async prefetchPath(points: [number, number][], ring = 1) {
    const keys = new Set<string>();
    for (const [lat, lon] of points) {
      const { x, y } = tileCoords(lat, lon, this.zoom);
      const tileX = Math.floor(x);
      const tileY = Math.floor(y);
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) keys.add(`${tileX + dx}/${tileY + dy}`);
      }
    }
    const jobs: Promise<void>[] = [];
    for (const key of keys) {
      if (this.tiles.has(key)) continue;
      this.tiles.set(key, null);
      const [tileX, tileY] = key.split("/").map(Number);
      jobs.push(
        loadImage(this.url(tileX, tileY, this.zoom))
          .then(image => void this.tiles.set(key, toImageData(image)))
          .catch(() => undefined),
      );
    }
    await Promise.all(jobs);
    this.evict();
  }

  /** Is the tile covering this point loaded and decoded? */
  hasCoverage(lat: number, lon: number): boolean {
    const { x, y } = tileCoords(lat, lon, this.zoom);
    return Boolean(this.tiles.get(`${Math.floor(x)}/${Math.floor(y)}`));
  }

  protected pixel(lat: number, lon: number): [number, number, number] | null {
    const { x, y } = tileCoords(lat, lon, this.zoom);
    const data = this.tiles.get(`${Math.floor(x)}/${Math.floor(y)}`);
    if (!data) return null;
    const px = Math.min(data.width - 1, Math.max(0, Math.floor((x - Math.floor(x)) * data.width)));
    const py = Math.min(data.height - 1, Math.max(0, Math.floor((y - Math.floor(y)) * data.height)));
    const index = (py * data.width + px) * 4;
    return [data.data[index], data.data[index + 1], data.data[index + 2]];
  }

  dispose() {
    this.tiles.clear();
  }
}

/** Decodes Mapzen/AWS terrarium RGB elevation tiles into metres above sea level. */
export class ElevationSampler extends TileSampler {
  constructor(zoom = 12) {
    super(zoom);
  }
  protected url = terrariumUrl;

  heightAt(lat: number, lon: number): number {
    const rgb = this.pixel(lat, lon);
    if (!rgb) return 0;
    return rgb[0] * 256 + rgb[1] + rgb[2] / 256 - 32768;
  }
}

/** Reads the satellite photo colour at a point, used to tint roofs and ballast. */
export class ImagerySampler extends TileSampler {
  constructor(zoom = 16) {
    super(zoom);
  }
  protected url = esriImageryUrl;

  colourAt(lat: number, lon: number): THREE_ColourTuple | null {
    const rgb = this.pixel(lat, lon);
    return rgb ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : null;
  }
}

export type THREE_ColourTuple = [number, number, number];
