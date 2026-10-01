// Lazily load the MapLibre build vendored at /vendor/maplibre-gl/.
//
// It used to be a blocking <script> in index.html, so every page paid 919 KB of
// JavaScript and 73 KB of CSS for it — including the 3D animation, which has no
// map at all. Now nothing fetches it until a page actually opens a map.
//
// v6 dropped MapLibre's UMD/global build entirely (ESM only, with the worker
// split into its own file), so this loads it via a real dynamic import() of
// the vendored .mjs — a genuine runtime fetch of a static asset URL, not
// something Vite's bundler ever sees or analyzes statically — and points the
// library at its vendored worker file with setWorkerUrl().
//
// The alias in vite.config maps bare `maplibre-gl` imports here, so the library
// never gets bundled a second time into the React chunk.
type MapLibreGlobal = typeof import('maplibre-gl');

const MODULE_SRC = '/vendor/maplibre-gl/maplibre-gl.mjs';
const WORKER_SRC = '/vendor/maplibre-gl/maplibre-gl-worker.mjs';
const STYLESHEETS = ['/vendor/maplibre-gl/maplibre-gl.css', '/map/immersive-map.css'];

let loaded: MapLibreGlobal | null = null;
let pending: Promise<MapLibreGlobal> | null = null;

function addStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // Resolve either way: a missing stylesheet should not block the map, but we
    // must not construct one before these apply. MapLibre measures its
    // container once at construction, and without its own CSS the host collapses
    // to zero height - the canvas then renders 1280x0 and never recovers.
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    // Insert ahead of the app's own stylesheets. `.ride-world{position:absolute}`
    // and `.maplibregl-map{position:relative}` have equal specificity, so
    // whichever sheet comes last wins; appending would let MapLibre collapse the
    // map host to zero height.
    const anchor = document.head.querySelector<HTMLLinkElement>(`link[rel="stylesheet"]:not([data-maplibre])`);
    link.dataset.maplibre = 'true';
    if (anchor) document.head.insertBefore(link, anchor);
    else document.head.appendChild(link);
  });
}

/**
 * Resolves once MapLibre is loaded. Call this before creating a map;
 * everything reached through the default export assumes it has already run.
 */
export function ensureMapLibre(): Promise<MapLibreGlobal> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;

  pending = (async () => {
    const [module] = await Promise.all([
      import(/* @vite-ignore */ MODULE_SRC) as Promise<MapLibreGlobal>,
      ...STYLESHEETS.map(addStylesheet),
    ]);
    module.setWorkerUrl(WORKER_SRC);
    loaded = module;
    return module;
  })();
  // A failed load must not poison every later attempt.
  pending.catch(() => { pending = null; });
  return pending;
}

// Property access is deferred to call time, so `maplibregl.Map` resolves against
// whatever ensureMapLibre() installed rather than against import-time state.
const lazy = new Proxy({} as MapLibreGlobal, {
  get(_target, property) {
    if (!loaded) throw new Error(`MapLibre is not loaded yet - await ensureMapLibre() before using maplibregl.${String(property)}`);
    return Reflect.get(loaded as object, property);
  },
  has(_target, property) {
    return loaded ? Reflect.has(loaded as object, property) : false;
  },
});

export default lazy;
