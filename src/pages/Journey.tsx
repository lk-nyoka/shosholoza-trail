import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertTriangle, Compass, LocateFixed, Navigation, ShieldCheck,
} from "lucide-react";
import TrainMap from "../components/map/TrainMap";
import PlaybackBar from "../components/journey/PlaybackBar";
import DisruptionBanner from "../components/ui/DisruptionBanner";
import { fetchJourneyStatus } from "../api";
import { ROUTE_KM_LABEL, stops } from "../data";
import type { JourneyStatus, PlaybackSpeed, Stop } from "../types";
import { useTrainPlayback } from "../hooks/useTrainPlayback";
import { TOTAL_KM } from "../lib/routeIndex";
import { durationLabel, scheduledMinutesBetween } from "../lib/corridor";
import { DEMO } from "../lib/demo";
import "./Journey.css";

const BASELINE_SPEED = 72;

function duration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const stopAt = (km: number) =>
  stops.reduce((cur, s) => (s.km <= km ? s : cur), stops[0]);

export default function Journey() {
  const [km, setKm]           = useState(stops[0].km);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed]     = useState<PlaybackSpeed>(1);
  const [follow, setFollow]   = useState(true);
  const [active, setActive]   = useState<Stop>(stops[0]);
  const [status, setStatus]   = useState<JourneyStatus | null>(null);
  const [disrupted, setDisrupted] = useState(false);
  const [online, setOnline]   = useState(() => navigator.onLine);

  // network
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // fetch status
  useEffect(() => {
    if (!online) return;
    const ctrl = new AbortController();
    fetchJourneyStatus(km, ctrl.signal).then(setStatus).catch(() => undefined);
    return () => ctrl.abort();
  }, [online, active.id]);

  useTrainPlayback({
    km,
    setKm,
    playing,
    setPlaying,
    speed,
    totalKm: TOTAL_KM,
    stops,
    onStationArrival: stop => setActive(stop),
  });

  // auto-advance active stop
  useEffect(() => {
    const s = stopAt(km);
    setActive(cur => cur.id === s.id ? cur : s);
  }, [km]);

  const next = stops.find(s => s.km > km) ?? stops[stops.length - 1];
  const rollingSpeed = status?.rolling_speed_kmh ?? BASELINE_SPEED;
  const eta = status?.eta_minutes ?? ((TOTAL_KM - km) / rollingSpeed) * 60;

  const selectStop = useCallback((stop: Stop) => {
    setPlaying(false); setKm(stop.km); setActive(stop); setFollow(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (km >= TOTAL_KM) setKm(0);
    setFollow(true);
    setPlaying(v => !v);
  }, [km]);

  const scrub = useCallback((v: number) => {
    setPlaying(false); setKm(v); setFollow(true);
  }, []);

  /** Pretoria to Cape Town, from the published calls. */
  const journeyLength =
    durationLabel(scheduledMinutesBetween("pretoria", "cape-town") ?? 0);

  return (
    <div className="journey-page">
      <h1 className="sr-only">Route overview — the Pretoria to Cape Town corridor</h1>
      {/* Full-screen map */}
      <TrainMap
        km={km}
        follow={follow}
        activeStop={active}
        stops={stops}
        onStopClick={selectStop}
        className="journey-page__map"
      />

      {/* Cinematic overlays */}
      <div className="journey-page__vignette" aria-hidden="true" />
      <div className="journey-page__grain"    aria-hidden="true" />

      {/* Map controls */}
      <div className="journey-map-tools" role="group" aria-label="Map camera controls">
        <button
          className={follow ? "active" : ""}
          onClick={() => setFollow(v => !v)}
          aria-label="Toggle follow-train camera"
          aria-pressed={follow}
          type="button"
        >
          <Navigation size={16} aria-hidden="true" />
        </button>
        <button
          onClick={() => setFollow(false)}
          aria-label="Explore map freely"
          type="button"
        >
          <Compass size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Route summary card */}
      <aside className="journey-summary-card" aria-label="Route summary">
        <p className="t-eyebrow journey-summary-card__eyebrow">The Route</p>
        <h2 className="journey-summary-card__route">Pretoria → Cape Town</h2>
        <dl className="journey-summary-card__stats">
          <div><dt>Distance</dt><dd>{ROUTE_KM_LABEL} km</dd></div>
          {/*
            * Read from the published timetable rather than typed here. This
            * said "27 hrs" while the boarding pass said 28h 10m, which is the
            * exact contradiction three separate reviews warned about.
            */}
          <div><dt>Journey</dt><dd>{journeyLength}</dd></div>
          <div><dt>Stops</dt><dd>{stops.length}</dd></div>
        </dl>
        <p className="journey-summary-card__note">
          Scheduled times, not live. The train shown here is a simulation.
        </p>
      </aside>

      {/* Approaching HUD */}
      <div
        className="journey-approaching"
        role="status"
        aria-live="polite"
        aria-label={`Now approaching ${next.name}, ${Math.max(0, Math.round(next.km - km))} km ahead`}
      >
        <span className="journey-approaching__icon" aria-hidden="true">
          <LocateFixed size={15} />
        </span>
        <span className="journey-approaching__text">
          <small>Now approaching</small>
          <b>{next.name}</b>
        </span>
        <strong className="journey-approaching__dist">
          {Math.max(0, Math.round(next.km - km))} km
        </strong>
      </div>

      {/* Next-stop editorial card */}
      <aside className="journey-next-card" aria-label={`Next stop: ${next.name}`}>
        <div className="journey-next-card__header">
          <small className="t-eyebrow">Next Stop</small>
          <strong>{Math.max(0, Math.round(next.km - km))} km ahead</strong>
        </div>
        <h3 className="journey-next-card__name">{next.name}</h3>
        <p className="journey-next-card__teaser">{next.teaser}</p>
        <div className="journey-next-card__meta">
          <span>{next.province}</span>
          <span>ETA {duration(eta)}</span>
        </div>
      </aside>

      {/* OSM provenance */}
      <div className="journey-osm-badge" aria-label="Map data provenance">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>
          <b>Mapped rail geometry</b>
          <small>OSM connected candidate · ODbL</small>
        </span>
      </div>

      {/* Disruption */}
      <div className="journey-disruption-wrap">
        {disrupted && (
          <DisruptionBanner
            disruption={null}
            demo
            onDismiss={() => setDisrupted(false)}
          />
        )}
        <button
          className={["journey-disruption-toggle", disrupted ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => setDisrupted(v => !v)}
          aria-pressed={disrupted}
        >
          <AlertTriangle size={13} aria-hidden="true" />
          {disrupted ? "Clear disruption" : "Preview disruption"}
        </button>
      </div>

      {/* Playback */}
      <PlaybackBar
        km={km}
        next={next}
        playing={playing}
        speed={speed}
        onPlay={togglePlay}
        onScrub={scrub}
        onSpeed={setSpeed}
      />
    </div>
  );
}
