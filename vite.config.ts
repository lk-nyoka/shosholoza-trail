import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// A short, human-sayable build stamp. When somebody reports that something
// is broken, the first question is always "which build are you on" - and
// without this there is no way to answer it.
const BUILD_ID = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(2, 12);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8001", changeOrigin: false } },
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt", not "autoUpdate": the new worker waits until the passenger
      // says so. Swapping the app out from under somebody who is mid-page on a
      // train is not an improvement, and an explicit "Reload" is also the only
      // way they ever learn a fix exists.
      registerType: "prompt",
      manifest: {
        name: "Shosholoza Trail",
        short_name: "Shosholoza",
        description:
          "An offline-ready companion for South Africa's 1 568 km Pretoria–Cape Town rail journey.",
        theme_color: "#0d1c2e",
        background_color: "#f8f2e8",
        display: "standalone",
        start_url: "/",
        icons: [
          // Android reads the SVG happily. iOS does not, and Chrome's install
          // prompt wants a 192 and a 512 raster before it will offer to add
          // the app to a home screen - which is the whole point of a PWA for
          // a passenger who is about to lose signal for nine hours.
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the full app shell
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],

        runtimeCaching: [
          // ── Satellite imagery — cache-first ────────────────────────────
          // These four rules are what the ride actually loads. The old rules
          // named openstreetmap.org tiles and Unsplash, neither of which this
          // app has used for months, so nothing the passenger could see was
          // being kept — which is why the map went blank the moment the signal
          // did. maxEntries is generous because a single run through the Hex
          // River loads hundreds of tiles.
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "imagery-tiles",
              expiration: { maxEntries: 1200, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Elevation (terrarium) — cache-first ────────────────────────
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\//,
            handler: "CacheFirst",
            options: {
              cacheName: "elevation-tiles",
              expiration: { maxEntries: 900, maxAgeSeconds: 90 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Vector context (roads, buildings, place names) ─────────────
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "vector-tiles",
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Map tiles, legacy raster ───────────────────────────────────
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 240, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Photographs — cache-first ──────────────────────────────────
          // Commons serves through Special:FilePath, which redirects to
          // upload.wikimedia.org, so both hosts have to be named or the
          // redirect target is never kept. The cache name is shared with the
          // "download the journey" button: it writes into this cache, so the
          // service worker finds those photographs afterwards.
          {
            urlPattern: /^https:\/\/(commons|upload)\.wikimedia\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "place-images",
              expiration: { maxEntries: 400, maxAgeSeconds: 90 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Google Fonts — cache-first ─────────────────────────────────
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── API: static route geometry — cache-first, 1-day ETag ───────
          {
            urlPattern: /\/api\/v1\/route$/,
            handler: "CacheFirst",
            options: {
              cacheName: "api-route-geometry",
              expiration: { maxEntries: 1, maxAgeSeconds: 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── API: stops & places — stale-while-revalidate ───────────────
          {
            urlPattern: /\/api\/v1\/stops/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-stops",
              expiration: { maxEntries: 20, maxAgeSeconds: 12 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── API: timetable — stale-while-revalidate ────────────────────
          {
            urlPattern: /\/api\/v1\/timetable/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-timetable",
              expiration: { maxEntries: 1, maxAgeSeconds: 6 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── API: journey status — network-first, short cache ───────────
          // Keeps data fresh when online; serves stale data in dead zones.
          {
            urlPattern: /\/api\/v1\/journeys\/.+\/status/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-journey-status",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
