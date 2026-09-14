/**
 * Taking the journey offline.
 *
 * Between De Aar and Beaufort West there is no usable mobile signal for hours,
 * which is exactly where this app has the most to say. The route, the 353
 * places, the stories and the guide's knowledge base all ship inside the
 * application bundle, so they are already there once the app has loaded —
 * what is not there are the photographs, which are fetched from Wikimedia as
 * you browse.
 *
 * This fills that gap and, just as importantly, makes the offline claim
 * something a passenger can see and act on rather than something we assert.
 */
import { stops } from "../data";
import { railRoute } from "../rail-route";

/**
 * The same cache the service worker reads.
 *
 * This used to be a cache of its own, which meant the download worked, the
 * megabytes were real — and offline the photographs still did not appear,
 * because nothing was serving them. Workbox owns this name (see the
 * runtimeCaching rule in vite.config.ts); writing into it is what makes a
 * downloaded photograph show up when there is no signal.
 */
const CACHE = "place-images";

export interface DownloadProgress {
  done: number;
  total: number;
  /** What is being fetched, so the button can say something true. */
  stage: "photographs" | "map";
}

/** Workbox owns this one too — see the imagery rule in vite.config.ts. */
const IMAGERY_CACHE = "imagery-tiles";

/**
 * Zoom levels for the offline map backdrop.
 *
 * The ride loads imagery at zoom 18 as it goes, which is hundreds of megabytes
 * across 1,568 km and not something to download on a station platform. These
 * two levels cover the whole corridor in a few hundred tiles: enough that the
 * map has ground under it with no signal, detailed enough to read the country.
 * Anything sharper is cached as you actually ride through it.
 */
const OFFLINE_ZOOMS = [9, 11];

function tileOf(lat: number, lon: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

/** Every imagery tile the corridor passes through, at the offline zooms. */
export function corridorTiles(): string[] {
  const urls = new Set<string>();
  // Every twentieth vertex is roughly every two kilometres: fine enough that
  // no tile along the line is skipped, coarse enough to stay quick.
  for (let i = 0; i < railRoute.length; i += 20) {
    const [lat, lon] = railRoute[i];
    for (const zoom of OFFLINE_ZOOMS) {
      const [x, y] = tileOf(lat, lon, zoom);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        urls.add(
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y + dy}/${x + dx}`,
        );
      }
    }
  }
  return [...urls];
}

/** Every photograph the journey shows, de-duplicated. */
export function journeyMedia(): string[] {
  const urls = new Set<string>();
  for (const stop of stops) {
    for (const place of stop.places) urls.add(place.image);
  }
  return [...urls];
}

/**
 * Roughly what the corridor costs to keep: photographs are large, map tiles are
 * small but numerous. Deliberately generous - refusing a download that would
 * have fitted is a nuisance, but starting one that cannot finish leaves a
 * half-cached corridor that looks complete right up to the point it matters.
 */
const MB_PER_PHOTO = 0.35;
const MB_PER_TILE = 0.02;

async function roomFor(megabytes: number): Promise<{ ok: boolean; availableMb: number | null }> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return { ok: true, availableMb: null };
    const available = (estimate.quota - (estimate.usage ?? 0)) / (1024 * 1024);
    // Leave a fifth of the headroom alone; a browser that hits its quota mid-write
    // does not fail politely.
    return { ok: available * 0.8 > megabytes, availableMb: Math.round(available) };
  } catch {
    return { ok: true, availableMb: null };
  }
}

export async function downloadJourney(onProgress: (p: DownloadProgress) => void): Promise<void> {
  if (!("caches" in window)) throw new Error("This browser cannot store the journey offline.");

  const photos = journeyMedia();
  const tiles = corridorTiles();

  const needed = Math.ceil(photos.length * MB_PER_PHOTO + tiles.length * MB_PER_TILE);
  const { ok, availableMb } = await roomFor(needed);
  if (!ok) {
    throw new Error(
      `Not enough space on this phone. The journey needs about ${needed} MB and ` +
      `there ${availableMb === null ? "is not enough room" : `are about ${availableMb} MB free`}. ` +
      `Free some space and try again — a part-finished download would look complete ` +
      `and then fail you in the Karoo.`,
    );
  }

  // ── Photographs ────────────────────────────────────────────────────────
  const photoCache = await caches.open(CACHE);
  let done = 0;
  onProgress({ done, total: photos.length, stage: "photographs" });
  // Sequential on purpose: a phone on a train has one slow pipe, and a burst of
  // parallel requests is how you get half a cache and a stalled progress bar.
  for (const url of photos) {
    try {
      // Commons redirects to upload.wikimedia.org. A cors request would give a
      // readable response but Commons does not allow it for these, so this is
      // opaque on purpose: an <img> can still paint it, which is all we need.
      await photoCache.put(url, await fetch(url, { mode: "no-cors" }));
    } catch {
      /* One missing photograph must not fail the whole download. */
    }
    onProgress({ done: ++done, total: photos.length, stage: "photographs" });
  }

  // ── The map under the line ─────────────────────────────────────────────
  const tileCache = await caches.open(IMAGERY_CACHE);
  done = 0;
  onProgress({ done, total: tiles.length, stage: "map" });
  // Six at a time: enough to use the connection, few enough to stay polite to
  // a free tile service and to leave the page responsive while it runs.
  const queue = [...tiles];
  const worker = async () => {
    for (let url = queue.pop(); url; url = queue.pop()) {
      try {
        await tileCache.put(url, await fetch(url, { mode: "no-cors" }));
      } catch {
        /* A missing tile is a grey square, not a failed download. */
      }
      onProgress({ done: ++done, total: tiles.length, stage: "map" });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

export async function isJourneyStored(): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const [photos, tiles] = await Promise.all([
      caches.open(CACHE).then(c => c.keys()),
      caches.open(IMAGERY_CACHE).then(c => c.keys()),
    ]);
    // Tiles arrive as you ride, so the photographs are what say "downloaded".
    return photos.length > 0 && tiles.length > 0;
  } catch {
    return false;
  }
}

/** How much of the corridor map is held, for the panel to report. */
export async function storedTileCount(): Promise<number> {
  if (!("caches" in window)) return 0;
  try {
    return (await caches.open(IMAGERY_CACHE).then(c => c.keys())).length;
  } catch {
    return 0;
  }
}

/** What the browser reports it is actually holding for this app, in MB. */
export async function storedMegabytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.usage) return null;
    return Math.round((estimate.usage / (1024 * 1024)) * 10) / 10;
  } catch {
    return null;
  }
}

export async function clearStoredJourney(): Promise<void> {
  try {
    await Promise.all([caches.delete(CACHE), caches.delete(IMAGERY_CACHE)]);
  } catch {
    /* nothing stored */
  }
}
