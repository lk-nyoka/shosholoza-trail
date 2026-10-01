// v6 dropped MapLibre's UMD/global build; it ships ESM only, with the
// worker split into its own file. immersive-map.js still reads
// globalThis.maplibregl, so this sets it up the same way the old
// blocking <script> tag used to. Top-level await (not .then()) matters
// here: module scripts execute in document order and later ones wait
// out an earlier one's pending top-level await, so /app.js is
// guaranteed to see window.maplibregl already set, exactly as it was
// guaranteed by the old blocking, non-module <script src> tag.
const maplibregl = await import('/vendor/maplibre-gl/maplibre-gl.mjs');
maplibregl.setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs');
window.maplibregl = maplibregl;
