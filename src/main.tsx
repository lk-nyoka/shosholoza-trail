import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles/globals.css";
import "./styles/motion.css";
import App from "./App";
import { backendConfigured } from "./lib/backend/client";
import { ensureSession } from "./lib/backend/session";
import { flush, watchConnectivity } from "./lib/backend/outbox";

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
