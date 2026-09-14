import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Radio, Users, Wifi, WifiOff,
  LocateFixed, Clock, ChevronRight, Signal,
} from "lucide-react";
import TrainMap from "../components/map/TrainMap";
import PlaybackBar from "../components/journey/PlaybackBar";
import ConfidenceBar from "../components/ui/ConfidenceBar";
import DisruptionBanner from "../components/ui/DisruptionBanner";
import PlaceCard from "../components/ui/PlaceCard";
import VendorModal from "../components/ui/VendorModal";
import LocationConsent from "../components/ui/LocationConsent";
import { fetchJourneyStatus, postPassengerPing } from "../api";
import { useGpsTelemetry } from "../hooks/useGpsTelemetry";
import { useTimetable } from "../hooks/useTimetable";
import { stops } from "../data";
import { locationConsent, setLocationConsent } from "../lib/consent";
import type { JourneyStatus, PingState, Place, Stop } from "../types";
import { TOTAL_KM } from "../lib/routeIndex";
import "./LiveJourney.css";
import { DEMO } from "../lib/demo";

function duration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60), m = safe % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export default function LiveJourney() {
  const [km, setKm]           = useState(stops[4].km);
  const [trackingPaused, setTrackingPaused] = useState(false);
  const [follow, setFollow]   = useState(true);
  const [active, setActive]   = useState<Stop>(stops[4]);
  const [status, setStatus]   = useState<JourneyStatus | null>(null);
  const [ping, setPing]       = useState<PingState>("idle");
  const [saved, setSaved]     = useState<string[]>([]);
  const [online, setOnline]   = useState(() => navigator.onLine);
  const [disrupted, setDisrupted] = useState(false);
  const [modalPlace, setModalPlace] = useState<Place | null>(null);
  /**
   * Nothing reads a position until the passenger has seen the notice and said
   * yes. `afterConsent` holds whichever action they were reaching for, so the
   * tap that triggered the notice still happens once they accept.
   */
  const [consentAsk, setConsentAsk] = useState<null | "track" | "ping">(null);

  // ── GPS telemetry is the sole live position source ──────────────────────
  const { telemetry, start: startGps, stop: stopGps } = useGpsTelemetry(false);
  useEffect(() => {
    if (telemetry.km !== null) {
      setKm(telemetry.km);
    }
    if (telemetry.nearestStop) {
      setActive(telemetry.nearestStop);
      setFollow(true);
    }
  }, [telemetry.km, telemetry.nearestStop]);

  // ── GTFS timetable ──────────────────────────────────────────────────────
  const { entries: timetable, nextEntry } = useTimetable();
  const nextTimetableEntry = nextEntry(km);

  // ── Network listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const up = () => setOnline(true), dn = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);

  // ── Fetch journey status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!online) return;
    const ctrl = new AbortController();
    fetchJourneyStatus(km, ctrl.signal).then(setStatus).catch(() => undefined);
    return () => ctrl.abort();
  }, [online, active.id, ping]);

  const next = stops.find(s => s.km > km) ?? stops[stops.length - 1];
  const rollingSpeed = telemetry.speedKmh ?? status?.rolling_speed_kmh ?? 0;
  const eta = status?.eta_minutes ?? (rollingSpeed > 0 ? ((TOTAL_KM - km) / rollingSpeed) * 60 : 0);

  // ── Actions ──────────────────────────────────────────────────────────────
  const selectStop = useCallback((stop: Stop) => {
    setKm(stop.km); setActive(stop); setFollow(true);
  }, []);

  const readPosition = useCallback(() => {
    if (!navigator.geolocation) { setPing("error"); return; }
    setPing("locating");
    navigator.geolocation.getCurrentPosition(
      pos => postPassengerPing(pos)
        .then(r => { setStatus(r.journey_status); setPing("shared"); })
        .catch(() => setPing("error")),
      () => setPing("error"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
  }, []);

  /** Both location actions pass through here, so neither can skip the notice. */
  const withConsent = useCallback((action: "track" | "ping") => {
    // Demonstration mode never touches the location API. A permission prompt
    // in front of an audience is a coin flip, and a declined one is a dead
    // screen; the prepared position says the same thing without the risk.
    if (DEMO) return;
    if (locationConsent() !== "granted") { setConsentAsk(action); return; }
    if (action === "track") startGps(); else readPosition();
  }, [startGps, readPosition]);

  const acceptConsent = useCallback(() => {
    setLocationConsent("granted");
    const action = consentAsk;
    setConsentAsk(null);
    if (action === "track") startGps(); else if (action === "ping") readPosition();
  }, [consentAsk, startGps, readPosition]);

  const declineConsent = useCallback(() => {
    setLocationConsent("declined");
    setConsentAsk(null);
  }, []);

  const toggleSaved = (id: string) =>
    setSaved(cur => cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]);

  const pingLabel =
    ping === "locating" ? "Locating securely…"
    : ping === "shared"  ? "Position shared"
    : ping === "error"   ? "Try again"
    : "I'm at this point";

  const gpsLiveLabel =
    telemetry.status === "live"     ? "GPS live"
    : telemetry.status === "locating" ? "Locating…"
    : telemetry.status === "stale"   ? "Signal lost"
    : telemetry.status === "denied"  ? "GPS denied"
    : "GPS unavailable";
  const trackingActive = telemetry.status === "live" && !trackingPaused;

  return (
    <div className="live-page">
      <h1 className="sr-only">Live journey — your position on the line</h1>

      {/*
        The one banner that must never be dismissible.

        This screen shows speeds, arrival estimates and disruptions. All of it
        is either your own device's GPS or a demonstration baseline — none of it
        comes from the operator's control room. A passenger deciding whether to
        leave the platform has to know that before they read a number.
      */}
      <p className="live-demo-banner" role="note">
        <b>Demonstration data — not for travel decisions.</b>
        <span>
          Positions and delays here are simulated or read from your own phone. Confirm every
          departure with the operator.
        </span>
      </p>
      {consentAsk && (
        <LocationConsent onAccept={acceptConsent} onDecline={declineConsent} />
      )}
      {/* Map */}
      <TrainMap
        km={km}
        follow={follow}
        activeStop={active}
        stops={stops}
        onStopClick={selectStop}
      />
      <div className="live-page__vignette" aria-hidden="true" />

      {/* ── Status bar ───────────────────────────────── */}
      <div className="live-status-bar" role="status" aria-label="Connection status">
        <span
          className={["live-online", online ? "" : "live-online--off"].filter(Boolean).join(" ")}
          aria-label={online ? "Online" : "Offline"}
        >
          {online
            ? <Wifi size={13} aria-hidden="true" />
            : <WifiOff size={13} aria-hidden="true" />}
          {online ? "Live" : "Offline"}
        </span>
        <span
          className={["live-sse-badge", telemetry.status === "live" ? "live-sse-badge--live" : "live-sse-badge--dim"].join(" ")}
          aria-label={`GPS status: ${gpsLiveLabel}`}
        >
          <Signal size={11} aria-hidden="true" />
          {gpsLiveLabel}
        </span>
        <span className="live-status-bar__route">Pretoria → Cape Town</span>
      </div>

      {/* ── Auto-board button ─────────────────────────── */}
      <button
        className={[
          "live-autoboard",
          telemetry.status === "locating" ? "live-autoboard--locating" : "",
          telemetry.status === "live" ? "live-autoboard--snapped" : "",
          telemetry.status === "error" || telemetry.status === "denied" ? "live-autoboard--error" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => withConsent("track")}
        disabled={DEMO || telemetry.status === "locating"}
        title={DEMO ? "Turned off for this demonstration — no location is requested" : undefined}
        aria-label={
          telemetry.status === "locating" ? "Locating your live GPS position…"
          : telemetry.status === "live" ? `GPS live near ${telemetry.nearestStop?.name ?? "the rail corridor"} — tap to refresh`
          : telemetry.error ?? "Start live GPS tracking"
        }
        aria-live="polite"
      >
        <LocateFixed size={15} aria-hidden="true" />
        {telemetry.status === "locating" ? "Locating…"
          : telemetry.status === "live" ? `GPS · ${Math.round(km)} km`
          : "Start live GPS"}
      </button>

      {/* ── Telemetry panel ───────────────────────────── */}
      <aside
        className="live-telemetry"
        aria-live="polite"
        aria-label="Passenger telemetry"
        aria-atomic="false"
      >
        <header className="live-telemetry__header">
          <span className="live-telemetry__icon" aria-hidden="true"><Radio size={14} /></span>
          <div>
            <small className="t-eyebrow">Passenger telemetry</small>
            <b>{status?.recent_ping_count ?? 0} recent signals</b>
          </div>
          <ConfidenceBar value={status?.confidence ?? "none"} />
        </header>
        <dl className="live-telemetry__stats">
          <div>
            <dt>Rolling speed</dt>
            <dd>{telemetry.speedKmh === null ? "Waiting for GPS" : `${rollingSpeed} km/h`}</dd>
          </div>
          <div>
            <dt>ETA Cape Town</dt>
            <dd>{duration(eta)}</dd>
          </div>
          <div>
            <dt>Data source</dt>
            <dd className={status?.data_mode === "demo_baseline" ? "demo" : ""}>
              {status?.data_mode === "demo_baseline" ? "Demo" : "Live pings"}
            </dd>
          </div>
        </dl>
        <button
          className="live-telemetry__ping"
          onClick={() => withConsent("ping")}
          disabled={DEMO || ping === "locating" || ping === "shared"}
          title={DEMO ? "Turned off for this demonstration — no location is requested" : undefined}
          aria-label={pingLabel}
          aria-busy={ping === "locating"}
        >
          <Users size={13} aria-hidden="true" />
          {pingLabel}
        </button>
      </aside>

      {/* ── GTFS Timetable strip ──────────────────────── */}
      {nextTimetableEntry && (
        <aside
          className="live-timetable"
          aria-label={`Next timetable stop: ${nextTimetableEntry.stop_name}`}
        >
          <span className="live-timetable__icon" aria-hidden="true">
            <Clock size={13} />
          </span>
          <div className="live-timetable__body">
            <small className="t-eyebrow">Next scheduled stop</small>
            <div className="live-timetable__row">
              <b>{nextTimetableEntry.stop_name}</b>
              <span className="live-timetable__time">
                {nextTimetableEntry.departs ?? nextTimetableEntry.arrives}
              </span>
            </div>
            <div className="live-timetable__sub">
              Platform&nbsp;<strong>{nextTimetableEntry.platform}</strong>
              &nbsp;·&nbsp;{nextTimetableEntry.zone}
              &nbsp;·&nbsp;{Math.max(0, Math.round(nextTimetableEntry.km - km))} km ahead
            </div>
          </div>
          <button
            className="live-timetable__all"
            aria-label="Show full timetable"
            onClick={() => {/* timetable panel could expand here */}}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </aside>
      )}

      {/* ── Disruption ────────────────────────────────── */}
      {(disrupted || status?.disruption) && (
        <div className="live-disruption-wrap">
          <DisruptionBanner
            disruption={status?.disruption ?? null}
            demo={!status?.disruption}
            onDismiss={() => setDisrupted(false)}
          />
        </div>
      )}
      {!status?.disruption && (
        <button
          className={["live-disruption-toggle", disrupted ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => setDisrupted(v => !v)}
          aria-pressed={disrupted}
          aria-label={disrupted ? "Clear disruption preview" : "Preview disruption state"}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          {disrupted ? "Clear" : "Preview disruption"}
        </button>
      )}

      {/* ── Nearby panel ──────────────────────────────── */}
      <aside className="live-nearby" aria-label={`Places near ${active.name}`}>
        <header className="live-nearby__header">
          <div>
            <p className="t-eyebrow">Now at</p>
            <h2 className="live-nearby__stop">{active.name}</h2>
          </div>
        </header>
        {active.places.length > 0 ? (
          <div className="live-nearby__list" role="list">
            {active.places.map(place => (
              <div key={place.id} role="listitem">
                <PlaceCard
                  place={place}
                  saved={saved.includes(place.id)}
                  onToggleSave={toggleSaved}
                />
                <button
                  className="live-nearby__open-btn"
                  onClick={() => setModalPlace(place)}
                  aria-label={`Open ${place.name} details`}
                >
                  {place.type === "vendor" ? "Menu & book" : "View details"}
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="live-nearby__empty">No recommendations for this stop yet.</p>
        )}
      </aside>

      {/* ── Playback ──────────────────────────────────── */}
      <PlaybackBar
        km={km}
        next={next}
        playing={trackingActive}
        speed={1}
        liveTracking
        onPlay={() => {
          if (trackingActive) {
            stopGps();
            setTrackingPaused(true);
          } else {
            setTrackingPaused(false);
            startGps();
          }
        }}
        onScrub={v => {
          setKm(v);
          setFollow(true);
        }}
        onSpeed={() => undefined}
      />

      {/* ── Vendor modal ──────────────────────────────── */}
      <VendorModal
        place={modalPlace}
        onClose={() => setModalPlace(null)}
      />
    </div>
  );
}
