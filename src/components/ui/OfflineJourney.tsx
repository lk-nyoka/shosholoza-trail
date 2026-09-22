import { useEffect, useState } from "react";
import { CloudDownload, CheckCircle2, WifiOff } from "lucide-react";
import {
  clearStoredJourney, corridorTiles, downloadJourney, isJourneyStored, journeyMedia,
  packageContents, packageState, storedMegabytes, storedTileCount,
  type PackageState,
} from "../../lib/offlineJourney";
import { pendingCount } from "../../lib/backend/outbox";
import "./OfflineJourney.css";

/**
 * The passenger-facing side of offline. Deliberately shows real numbers — how
 * many photographs, how many megabytes the browser reports holding — because an
 * offline promise nobody can check is just a sentence on a landing page.
 */
export default function OfflineJourney() {
  const [stored, setStored]   = useState(false);
  const [mb, setMb]           = useState<number | null>(null);
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState(0);
  const [stageTotal, setStageTotal] = useState(0);
  const [stage, setStage]     = useState<"photographs" | "map">("photographs");
  const [tiles, setTiles]     = useState(0);
  const [error, setError]     = useState<string | null>(null);
  const [online, setOnline]   = useState(() => navigator.onLine);
  const [pkg, setPkg]         = useState<PackageState | null>(null);
  const [pending, setPending] = useState(0);

  const total = journeyMedia().length;
  const tileTotal = corridorTiles().length;

  const refresh = () => {
    isJourneyStored().then(setStored);
    storedMegabytes().then(setMb);
    storedTileCount().then(setTiles);
    packageState(typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown")
      .then(setPkg)
      .catch(() => setPkg(null));
    setPending(pendingCount());
  };

  useEffect(() => {
    refresh();
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const start = async () => {
    setBusy(true); setError(null); setDone(0);
    try {
      await downloadJourney(p => { setDone(p.done); setStageTotal(p.total); setStage(p.stage); });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download could not finish.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await clearStoredJourney();
    refresh();
  };

  const percent = stageTotal ? Math.round((done / stageTotal) * 100) : 0;
  const contents = packageContents();

  return (
    <section className="offline-card" aria-labelledby="offline-title">
      <header className="offline-card__head">
        <span className="offline-card__icon" aria-hidden="true">
          {stored ? <CheckCircle2 size={17} /> : <CloudDownload size={17} />}
        </span>
        <div>
          <h3 id="offline-title" className="offline-card__title">
            {stored ? "This journey is on your phone" : "Take the journey offline"}
          </h3>
          <p className="offline-card__sub">
            There is no signal for hours between De Aar and Beaufort West. Download before you
            board and the route, the towns, the photographs and the map under them all keep
            working. Sharper imagery is kept as you ride through it.
          </p>
        </div>
      </header>

      {busy && (
        <div className="offline-card__progress" role="status" aria-live="polite">
          <div className="offline-card__bar"><span style={{ width: `${percent}%` }} /></div>
          <small>
            {stage === "photographs"
              ? `Photographs — ${done} of ${stageTotal}`
              : `Map of the corridor — ${done} of ${stageTotal} tiles`} · {percent}%
          </small>
        </div>
      )}

      {!busy && (
        <dl className="offline-card__stats">
          <div>
            <dt>Route &amp; towns</dt>
            <dd>353 places, always included</dd>
          </div>
          <div>
            <dt>Photographs</dt>
            <dd>{stored ? `${total} stored` : `${total} to download`}</dd>
          </div>
          <div>
            <dt>Map of the line</dt>
            <dd>{tiles > 0 ? `${tiles} tiles stored` : `${tileTotal} tiles to download`}</dd>
          </div>
          <div>
            <dt>On this device</dt>
            <dd>
              {mb === null ? "Not reported by this browser" : `${mb} MB`}
              {!stored && ` · about ${contents.estimatedMb} MB to download`}
            </dd>
          </div>
          {/*
            * When the download was taken.
            *
            * The panel used to say only whether something was stored. A
            * download taken in July, against a route file that has since been
            * corrected, looked exactly like one taken this morning — so a
            * passenger with a stale package had no way to know, and the one
            * place it would have mattered is nine hours from a signal.
            */}
          {pkg?.storedAt && (
            <div>
              <dt>Downloaded</dt>
              <dd>
                {pkg.ageDays === 0
                  ? "Today"
                  : pkg.ageDays === 1
                    ? "Yesterday"
                    : `${pkg.ageDays} days ago`}
              </dd>
            </div>
          )}
          {pending > 0 && (
            <div>
              <dt>Waiting to send</dt>
              <dd>
                {pending} {pending === 1 ? "item" : "items"} — they go out when you have signal
              </dd>
            </div>
          )}
          <div>
            <dt>Connection</dt>
            <dd className={online ? "" : "offline-card__off"}>
              {online ? "Online" : <><WifiOff size={12} aria-hidden="true" /> Offline — running from storage</>}
            </dd>
          </div>
        </dl>
      )}

      {pkg?.stale && !busy && (
        <p className="offline-card__stale" role="note">
          {pkg.staleReason} Download it again before you board so the route and the
          photographs match this version of the app.
        </p>
      )}

      {error && <p className="offline-card__error">{error}</p>}

      <div className="offline-card__actions">
        <button className="btn btn--primary btn--sm" onClick={start} disabled={busy || !online}>
          {busy ? "Downloading…" : stored ? "Refresh download" : "Download for offline"}
        </button>
        {stored && !busy && (
          <button className="btn btn--outline btn--sm" onClick={remove}>Remove download</button>
        )}
      </div>
      {!online && !stored && (
        <p className="offline-card__note">You are offline now — connect once to download.</p>
      )}
    </section>
  );
}
