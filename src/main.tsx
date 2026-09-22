import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";
import "./styles/motion.css";
import App from "./App";
import { backendConfigured } from "./lib/backend/client";
import { ensureSession } from "./lib/backend/session";
import { flush, watchConnectivity } from "./lib/backend/outbox";
import { migrateStorage } from "./lib/appUpdate";
import { DEMO, endDemo, startDemo } from "./lib/demo";

/**
 * Bring anything this device stored under an older build up to date, before a
 * single component reads it.
 *
 * The rule is that the passenger's own content survives - their trip, their
 * stamps, what they wrote - and everything derived is dropped and rebuilt.
 * Losing a cached tile is a cache miss; losing what somebody wrote on a train
 * with no signal is not.
 */
try {
  if (typeof window !== "undefined" && window.localStorage) {
    migrateStorage(window.localStorage);
  }
} catch {
  /* Private mode, or storage disabled. The app runs without it. */
}

/**
 * Demonstration mode gets a prepared, deterministic state - and gives the
 * device back exactly what it had the moment the demo is switched off.
 *
 * Without a saved itinerary the ride has no clock, so a judge opening
 * `?demo=1` on a fresh phone would see kilometres where the journey model
 * should be. With one written carelessly, a teammate opening the demo link on
 * their own phone would lose their real trip and their creative work. Both
 * are avoided by backing up first and restoring on exit.
 */
try {
  if (typeof window !== "undefined" && window.localStorage) {
    if (DEMO) startDemo(window.localStorage);
    else endDemo(window.localStorage);
  }
} catch {
  /* Private mode. Demo mode still runs, just without the prepared trip. */
}

/**
 * Wake the backend up quietly, after the first paint, and only if there is one.
 * Nothing on screen waits for any of this: if it fails, or there is no backend
 * configured at all, the app is exactly the device-local app it has always
 * been.
 */
if (backendConfigured) {
  watchConnectivity();
  window.setTimeout(() => {
    void ensureSession().then(() => flush());
  }, 1200);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
