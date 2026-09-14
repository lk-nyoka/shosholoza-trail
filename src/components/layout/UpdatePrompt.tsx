import { useEffect, useState } from "react";
import "./UpdatePrompt.css";

/**
 * "There's a new version" — the thing that stops a passenger being stranded on
 * a build from three weeks ago.
 *
 * A service worker serves the cached shell first, which is exactly what makes
 * the app work in the Karoo, and exactly what leaves somebody on an old version
 * indefinitely if nothing ever tells them. Every fix we ship is invisible to
 * the people who already installed it until they happen to hard-reload.
 *
 * So the moment a new worker has installed and is waiting, this offers the
 * reload. It never reloads on its own: doing that mid-journey, while somebody
 * is reading the page, would be its own small betrayal.
 */
export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.getRegistration().then(registration => {
      if (!registration || cancelled) return;

      const offer = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) setWaiting(worker);
      };

      offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed") offer(installing);
        });
      });
    });

    return () => { cancelled = true; };
  }, []);

  if (!waiting) return null;

  const reload = () => {
    // The new worker is idle until told to take over; once it has, the reload
    // picks up the new shell.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="upd" role="status">
      <span className="upd__text">A newer version of the app is ready.</span>
      <button type="button" className="upd__go" onClick={reload}>Reload</button>
      <button type="button" className="upd__later" onClick={() => setWaiting(null)} aria-label="Dismiss">
        Later
      </button>
    </div>
  );
}
