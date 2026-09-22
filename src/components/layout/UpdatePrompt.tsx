import { useEffect, useState } from "react";
import { AppUpdate, browserHost, type UpdateState } from "../../lib/appUpdate";
import "./UpdatePrompt.css";

/**
 * "There's a new version" — the thing that stops a passenger being stranded on
 * a build from three weeks ago.
 *
 * A service worker serves the cached shell first, which is exactly what makes
 * the app work in the Karoo, and exactly what leaves somebody on an old
 * version indefinitely if nothing ever tells them. It never reloads on its
 * own: doing that mid-journey, while somebody is reading, would be its own
 * small betrayal.
 *
 * The first version of this component offered the reload and was right about
 * both of those things. What it could not do was find the update in the first
 * place, on the journey this app is for:
 *
 *   - It only ever looked once, when the component mounted. A service worker
 *     checks for a new script on navigation, and a passenger who opens the
 *     app at Pretoria and closes it at Cape Town does not navigate for
 *     twenty-eight hours. A build shipped during the journey was never seen.
 *   - It used `getRegistration()`, which resolves with `undefined` if the
 *     worker has not registered yet — on a cold first load that is a race it
 *     loses, and then there is no listener at all for the rest of the visit.
 *   - Its reload waited on `controllerchange` with nothing behind it. If that
 *     event never arrives — and it does not, if the waiting worker was
 *     already activated in another tab — the passenger's tap does nothing at
 *     all, which reads as a broken button.
 *
 * The state machine and the retry behaviour now live in `lib/appUpdate.ts`,
 * where they are tested without a browser. This file is the bar.
 */
export default function UpdatePrompt() {
  const [state, setState] = useState<UpdateState>({ status: "current" });
  const [updater, setUpdater] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let app: AppUpdate | null = null;
    let unsubscribe: (() => void) | null = null;
    let stopPolling: (() => void) | null = null;
    const cleanups: (() => void)[] = [];

    // `ready` rather than `getRegistration` — it waits for the worker to be
    // there instead of reporting that it is not.
    void navigator.serviceWorker.ready
      .then(registration => {
        if (disposed) return;
        app = new AppUpdate(browserHost(registration as unknown as never));
        setUpdater(app);
        unsubscribe = app.subscribe(setState);
        stopPolling = app.start();

        /*
         * Three moments worth re-checking on that no timer catches: the
         * browser found a new worker itself, the passenger came back to the
         * tab, and the signal returned. On this route the last is the common
         * one — the phone is offline through the Karoo, and the first thing
         * it should do on finding a tower is ask.
         */
        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") app?.markAvailable();
          });
        };
        registration.addEventListener("updatefound", onUpdateFound);
        cleanups.push(() => registration.removeEventListener("updatefound", onUpdateFound));

        const onVisible = () => {
          if (document.visibilityState === "visible") void app?.check();
        };
        document.addEventListener("visibilitychange", onVisible);
        cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));

        const onOnline = () => void app?.check();
        window.addEventListener("online", onOnline);
        cleanups.push(() => window.removeEventListener("online", onOnline));
      })
      .catch(() => {
        /* No service worker on this device. The app still works. */
      });

    return () => {
      disposed = true;
      unsubscribe?.();
      stopPolling?.();
      for (const cleanup of cleanups) cleanup();
      app?.stop();
    };
  }, []);

  if (!updater || state.status === "current") return null;
  if (dismissed && state.status !== "applying") return null;

  const applying = state.status === "applying";
  return (
    <div className="upd" role="status" aria-live="polite">
      <span className="upd__text">
        {applying ? "Updating…" : "A newer version of the app is ready."}
      </span>
      <button type="button" className="upd__go" onClick={() => updater.apply()} disabled={applying}>
        {applying ? "Reloading" : "Reload"}
      </button>
      {!applying && (
        <button
          type="button"
          className="upd__later"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss the update notice"
        >
          Later
        </button>
      )}
    </div>
  );
}
