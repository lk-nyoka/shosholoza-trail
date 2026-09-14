/**
 * OfflineBanner — shows when the device is offline.
 * Explains that the app is running from cached data (SW).
 * Dismissible per session; auto-hides when connection restores.
 */
import { useEffect, useState } from "react";
import { WifiOff, X, HardDrive } from "lucide-react";
import "./OfflineBanner.css";

export default function OfflineBanner() {
  const [visible,   setVisible]   = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const update = () => {
      if (navigator.onLine) {
        setVisible(false);
      } else if (!dismissed) {
        setVisible(true);
      }
    };
    update();
    window.addEventListener("online",  update, { passive: true });
    window.addEventListener("offline", update, { passive: true });
    return () => {
      window.removeEventListener("online",  update);
      window.removeEventListener("offline", update);
    };
  }, [dismissed]);

  if (!visible) return null;

  return (
    <div
      className="offline-banner"
      role="status"
      aria-live="polite"
      aria-label="You are currently offline"
    >
      <span className="offline-banner__icon" aria-hidden="true">
        <WifiOff size={14} />
      </span>
      <div className="offline-banner__copy">
        <b>You're offline</b>
        <span>
          <HardDrive size={11} aria-hidden="true" />
          &nbsp;Map, routes and stop guides loaded from local cache.
        </span>
      </div>
      <button
        className="offline-banner__close"
        onClick={() => { setDismissed(true); setVisible(false); }}
        aria-label="Dismiss offline notice"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
