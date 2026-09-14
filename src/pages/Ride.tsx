import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FastForward, Pause, Play, Rewind, Volume2, X } from "lucide-react";
import TrainMap from "../components/map/TrainMap";
import { stops } from "../data";
import type { Stop } from "../types";
import { query as queryGuide } from "../lib/aiEngine";
import { useTrainPlayback } from "../hooks/useTrainPlayback";
import { PLACED_LANDMARKS, litLandmarks, nextOnSide } from "../lib/landmarks";
import { headingAtKm, compassPoint } from "../lib/windowSide";
import { imageryAt, shortCaptureDate } from "../lib/imageryMeta";
import { routeProfile } from "../lib/elevationProfile";
import { positionAt } from "../lib/routeIndex";
import { railRouteMeta } from "../rail-route";
import { TOTAL_KM } from "../lib/routeIndex";
import { nextPlace, passingNow } from "../lib/places";
import { brunnelAtKm } from "../lib/routeIndex";
import TripSetup from "../components/ui/TripSetup";
import { saveTrip, savedTrip, tripStops, type Trip } from "../lib/trip";
import { durationLabel, scheduledMinutesBetween } from "../lib/timetable";
import "./Ride.css";
import { DEMO, DEMO_SPEED, DEMO_START_KM } from "../lib/demo";


const BEARINGS: Record<string, { left: string; ahead: string; right: string }> = {
  pretoria:     { left: "Union Buildings",     ahead: "Gauteng Highveld",      right: "Pretoria CBD" },
  johannesburg: { left: "Maboneng Precinct",   ahead: "Highveld Grasslands",   right: "Joburg CBD" },
  kimberley:    { left: "The Big Hole",        ahead: "Northern Cape Plateau",  right: "Diamondfields" },
  "de-aar":     { left: "Railway Junction",    ahead: "Open Karoo",            right: "Water Tower" },
  beaufort:     { left: "Karoo NP Entrance",   ahead: "Swartberg Foothills",   right: "Town Centre" },
  matjies:      { left: "Lord Milner Hotel",   ahead: "Hex River Mountains",   right: "Karoo Plains" },
  worcester:    { left: "Breede Valley",       ahead: "Du Toitskloof Pass",    right: "Worcester CBD" },
  "cape-town":  { left: "Table Mountain",      ahead: "Cape Town Station",     right: "V&A Waterfront" },
};

const stopAt = (km: number) =>
  stops.reduce((cur, s) => (s.km <= km ? s : cur), stops[0]);

export default function Ride() {
  // In demo mode the ride opens on the run down to Matjiesfontein, already
  // moving. Starting at Pretoria means the first thing an audience sees is a
  // suburb, and the first thirty seconds of a four-minute pitch are the ones
  // that decide whether anyone is still listening.
  const [km, setKm] = useState(DEMO ? DEMO_START_KM : 0);
  const [isPlaying, setIsPlaying] = useState(DEMO);
  const [speed, setSpeed] = useState<number>(DEMO ? DEMO_SPEED : 1);
  const [arrival, setArrival] = useState<Stop | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [viewYaw, setViewYaw] = useState(0);
  const [viewPitch, setViewPitch] = useState(0);
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  useTrainPlayback({
    km,
    setKm,
    playing: isPlaying,
    setPlaying: setIsPlaying,
    speed,
    totalKm: TOTAL_KM,
    stops,
    onStationArrival: setArrival,
  });

  /**
   * Derived, not state. This used to be a useState written from a useEffect on
   * every km change, which is a render for a value that is a pure function of a
   * value we already have - and it was part of a setState cascade at mount that
   * React was warning about.
   */
  const active = stopAt(km);

  const here = brunnelAtKm(km);
  const structure = here === "tunnel" ? "IN TUNNEL" : here === "bridge" ? "ON BRIDGE" : null;

  const passing = passingNow(km);
  const upcoming = nextPlace(km);

  /** The next thing worth pointing at: a landmark if one is close, else the next town. */
  const nextLandmark = PLACED_LANDMARKS.find(entry => entry.km > km && entry.km - km <= 45);
  const callout = nextLandmark
    ? {
        name: nextLandmark.name,
        kind: "Landmark",
        aheadKm: Math.max(1, Math.round(nextLandmark.km - km)),
        detail: nextLandmark.offsetM
          ? `${(nextLandmark.offsetM / 1000).toFixed(1)} km from the track · ${nextLandmark.note}`
          : nextLandmark.note,
      }
    : upcoming
      ? {
          name: upcoming.name,
          kind: upcoming.station ? "Station" : "Town",
          aheadKm: Math.max(1, Math.round(upcoming.km - km)),
          detail: upcoming.note,
        }
      : null;

  const [imagery, setImagery] = useState<string | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    routeProfile()
      .then(profile => {
        if (cancelled) return;
        const index = Math.round((km / TOTAL_KM) * (profile.points.length - 1));
        setAltitude(profile.points[Math.max(0, Math.min(profile.points.length - 1, index))]?.metres ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Altitude changes slowly; a reading every 8 km is plenty.
  }, [Math.round(km / 8)]);
  useEffect(() => {
    let cancelled = false;
    const [lat, lon] = positionAt(km);
    imageryAt(lat, lon).then(info => {
      if (!cancelled) setImagery(shortCaptureDate(info));
    });
    return () => {
      cancelled = true;
    };
    // Re-query per 20 km band; Esri scenes are much larger than that.
  }, [Math.round(km / 20)]);

  const handleJumpToStop = (stop: Stop) => {
    setIsPlaying(false);
    setKm(stop.km);
  };

  const handleStepKm = (amount: number) => {
    setIsPlaying(false);
    setKm(previousKm => Math.max(0, Math.min(TOTAL_KM, previousKm + amount)));
  };

  const resolvedStops = stops.filter(stop => stop.km <= km).length;
  const billboardsLit = litLandmarks(km).length;
  const mapStatus = `Mapped rail geometry / OSM connected candidate / ${resolvedStops} resolved / ${stops.length} arrivals / ${billboardsLit} billboard${billboardsLit === 1 ? "" : "s"} lit`;

  /**
   * Window side is now measured, not looked up. BEARINGS stays as the fallback
   * copy for stretches with no mapped landmark within 60 km - the Karoo has
   * long gaps where the honest answer is the station's general context.
   */
  const fallback = BEARINGS[active.id] ?? BEARINGS["cape-town"];
  const leftLandmark = nextOnSide(km, "left");
  const rightLandmark = nextOnSide(km, "right");
  const aheadLandmark = nextOnSide(km, "ahead");
  const describe = (entry: ReturnType<typeof nextOnSide>, fallbackText: string) =>
    entry
      ? `${entry.name} · ${Math.max(0, Math.round(entry.km - km))} km`
      : fallbackText;
  const bearing = {
    left: describe(leftLandmark, fallback.left),
    ahead: describe(aheadLandmark, fallback.ahead),
    right: describe(rightLandmark, fallback.right),
  };
  const heading = headingAtKm(km);
  const nextStop = stops.find(s => s.km > km);
  const answer = queryGuide(aiQuery, 1)[0];

  const submitGuideQuery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!aiQuery.trim()) return;
    setAiAnswer(answer ? answer.doc.text : "I only have verified information about the stations and places on this route.");
  };

  const [trip, setTrip] = useState<Trip | null>(() => savedTrip());
  const [editingTrip, setEditingTrip] = useState(false);
  const [askedTrip, setAskedTrip] = useState(() => {
    try { return window.localStorage.getItem("st.trip-asked.v1") === "1"; } catch { return true; }
  });

  /**
   * Asked once, on the page where it matters most. A passenger who would rather
   * watch the whole line says so and is never asked again.
   */
  useEffect(() => {
    if (trip || askedTrip) return;
    const timer = window.setTimeout(() => setEditingTrip(true), 1200);
    return () => window.clearTimeout(timer);
  }, [trip, askedTrip]);

  const closeTripPrompt = () => {
    try { window.localStorage.setItem("st.trip-asked.v1", "1"); } catch { /* fine */ }
    setAskedTrip(true);
    setEditingTrip(false);
  };

  const legs = tripStops(trip);
  const legMinutes = trip ? scheduledMinutesBetween(trip.boardId, trip.alightId) : null;

  return (
    <div className="ride-page">
      <h1 className="sr-only">
        The Ride — following the Pretoria to Cape Town line in three dimensions
      </h1>
      <div className="ride-spatial-column">
      {/* Full-screen map */}
      <TrainMap
        km={km}
        follow={true}
        firstPerson
        speed={speed}
        playing={isPlaying}
        viewYaw={viewYaw}
        viewPitch={viewPitch}
        activeStop={active}
        stops={stops}
        onStopClick={handleJumpToStop}
      />
      <div className="ride-page__vignette" aria-hidden="true" />

      {/* Reference-style ride chrome */}
      <div className="ride-topbar">
        <button className="ride-overview" onClick={() => setIsPlaying(false)}>
          <ArrowLeft size={14} aria-hidden="true" /> Route overview
        </button>
        <button className="ride-topbar__sound" onClick={() => setSoundOn(current => !current)} aria-pressed={soundOn}>
          <Volume2 size={15} aria-hidden="true" />
          Sound {soundOn ? "on" : "off"}
        </button>
        <span className="ride-map-status" title={`${railRouteMeta.vertices.toLocaleString()} mapped vertices, ${railRouteMeta.lengthKm} km - ${railRouteMeta.source}`}>
          {mapStatus}
          {imagery ? ` / imagery ${imagery}` : ""}
          {altitude !== null ? ` / ${altitude.toLocaleString()} m` : ""}
          {` / heading ${compassPoint(heading)}`}
        </span>
      </div>

      {/* Simulation status HUD */}
      <header className="ride-status-bar" aria-label="Simulated ride status">
        <span className="ride-route-badge">SIMULATED RIDE · {Math.round(km)} / {TOTAL_KM} KM</span>
        <span className="ride-speed-badge">{isPlaying ? `${speed}x SPEED` : "PAUSED"}</span>
        {/*
          * Tagged straight off the OSM structure data for this kilometre, so it
          * says so at the moment the train is actually on the bridge or in the
          * bore rather than a rough guess at where they are.
          */}
        {structure && <span className="ride-structure-badge">{structure}</span>}
      </header>

      {/* Landmark bearings */}
      <div className="ride-bearings" aria-label="Landmark bearings">
        <div className="ride-bearing ride-bearing--left">
          <small>◂ LEFT</small>
          <span>{bearing.left}</span>
        </div>
        <div className="ride-bearing ride-bearing--ahead">
          <small>AHEAD ▸</small>
          <span>{bearing.ahead}</span>
        </div>
        <div className="ride-bearing ride-bearing--right">
          <small>RIGHT ▸</small>
          <span>{bearing.right}</span>
        </div>
      </div>

      <div className="ride-look-controls" aria-label="Camera controls">
        <button onClick={() => setViewPitch(current => Math.max(-1, current - 0.15))} aria-label="Look up"><ChevronUp size={17} /></button>
        <button onClick={() => setViewYaw(current => Math.max(-1, current - 0.2))} aria-label="Look left"><ChevronLeft size={17} /></button>
        <button onClick={() => setViewYaw(0)} aria-label="Center view"><span>•</span></button>
        <button onClick={() => setViewYaw(current => Math.min(1, current + 0.2))} aria-label="Look right"><ChevronRight size={17} /></button>
        <button onClick={() => setViewPitch(current => Math.min(1, current + 0.15))} aria-label="Look down"><ChevronDown size={17} /></button>
      </div>

      {/*
        * What is actually coming up, measured along the route. This used to
        * fall back to a hard-coded "Freedom Park / 4.1 km" whenever the current
        * station had fewer than three places attached, so the Karoo at km 1,300
        * was still advertising a memorial outside Pretoria.
        */}
      {callout && (
        <aside className="ride-poi-callout" aria-live="polite">
          <strong>→ {callout.name}</strong>
          <span>{callout.kind} · {callout.aheadKm} km ahead</span>
          <small>{callout.detail}</small>
        </aside>
      )}

      {/* Nearby landmarks panel */}
      <aside className="ride-landmarks" aria-label="Nearby places">
        <p className="t-eyebrow ride-landmarks__label">Nearby</p>
        {active.places.slice(0, 3).map(place => (
          <div key={place.id} className="ride-landmark-item">
            <span className="ride-landmark-item__name">{place.name}</span>
            <span className="ride-landmark-item__dist">{place.distance}</span>
          </div>
        ))}
      </aside>

      {editingTrip && (
        <TripSetup
          initial={trip}
          onSave={next => {
            saveTrip(next);
            setTrip(next);
            closeTripPrompt();
          }}
          onClose={closeTripPrompt}
        />
      )}

      <button
        className="ride-trip"
        onClick={() => setEditingTrip(true)}
        type="button"
        aria-label="Change your boarding and alighting stops"
      >
        {trip
          ? <>{legs[0].name} → {legs[legs.length - 1].name}{legMinutes ? ` · ${durationLabel(legMinutes)}` : ""}</>
          : <>Set your trip</>}
      </button>

      {/* HUD */}
      <div className="ride-hud">
        <span>{Math.round(km).toLocaleString()} km</span>
        <span className="ride-hud__sep" aria-hidden="true" />
        <span>
          {active.name} → {stops.find(s => s.km > km)?.name ?? "Cape Town"}
        </span>
      </div>

      <div className="ride-route-caption">
        <span>{Math.round(km).toLocaleString()} km travelled</span>
        <strong>{Math.max(0, Math.round((stops.find(s => s.km > km)?.km ?? TOTAL_KM) - km))} km to {stops.find(s => s.km > km)?.name ?? "Cape Town"}</strong>
        <small>Interactive rail-world simulation on mapped geometry / imagery and vector context, not footage</small>
      </div>

      {arrival && (
        <>
          <div className="ride-arrival-wash" aria-hidden="true" />
          <section className="ride-arrival" aria-label={`${arrival.name} arrival`}>
            <button className="ride-arrival__close" onClick={() => setArrival(null)} aria-label="Return to the track">
              <X size={17} aria-hidden="true" />
            </button>
            <div className="ride-arrival__photo">
              <img src={arrival.places[0]?.image} alt={`${arrival.name} destination`} />
              <span>Arrived · {Math.round(arrival.km)} km</span>
            </div>
            <div className="ride-arrival__copy">
              <p className="t-eyebrow">Now at</p>
              <h2>{arrival.name}</h2>
              <strong>{arrival.province}</strong>
              <p>{arrival.teaser}</p>
            </div>
            <button className="ride-arrival__continue" onClick={() => { setArrival(null); setIsPlaying(true); }}>
              Continue down the line <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>
        </>
      )}

      {/* Route station progress */}
      <nav className="ride-stops" aria-label="Route stations">
        {stops.map(stop => {
          const passed = stop.km <= km;
          return (
            <button
              key={stop.id}
              className={["ride-stop-btn", passed ? "passed" : "", stop.id === active.id ? "active" : ""].filter(Boolean).join(" ")}
              onClick={() => handleJumpToStop(stop)}
              aria-current={stop.id === active.id ? "step" : undefined}
            >
              <span className="ride-stop-btn__dot" aria-hidden="true" />
              <span>{stop.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Manual controls */}
      <div className="ride-controls" aria-label="Ride controls">
        <button onClick={() => handleStepKm(-50)} title="Back 50 km" aria-label="Back 50 kilometres">
          <Rewind size={18} />
          <span>-50km</span>
        </button>
        <button onClick={() => handleStepKm(-10)} title="Back 10 km" aria-label="Back 10 kilometres">-10km</button>
        <button
          className="ride-controls__play"
          onClick={() => {
            if (km >= TOTAL_KM) setKm(0);
            setIsPlaying(current => !current);
          }}
          aria-label={isPlaying ? "Pause" : "Play simulated ride"}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
        </button>
        <button onClick={() => handleStepKm(10)} title="Forward 10 km" aria-label="Forward 10 kilometres">+10km</button>
        <button onClick={() => handleStepKm(50)} title="Forward 50 km" aria-label="Forward 50 kilometres">
          <span>+50km</span>
          <FastForward size={18} />
        </button>
        <div className="ride-controls__speeds" role="group" aria-label="Simulation speed">
          {[1, 4, 16].map(option => (
            <button
              key={option}
              className={speed === option ? "active" : ""}
              onClick={() => setSpeed(option)}
              aria-pressed={speed === option}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
      </div>

      <aside className="ride-context-panel" aria-label="Station context">
        <div className="ride-context-status">{km === active.km ? `ARRIVED / ${Math.round(km)} KM` : `EN ROUTE / ${Math.round(km)} KM`}</div>
        <div className="ride-context-hero">
          <img src={active.places[0]?.image} alt={`${active.name} landscape`} />
          <span>{active.name} · route context</span>
        </div>
        <div className="ride-context-narrative">
          <p className="t-eyebrow">Current station</p>
          <h2>{active.name}</h2>
          <p>{active.teaser}</p>
          <div className="ride-context-metrics">
            <div><span>TRAVELLED</span><strong>{Math.round(km)} KM</strong></div>
            <div><span>TO NEXT STOP</span><strong>{Math.max(0, Math.round((nextStop?.km ?? TOTAL_KM) - km))} KM</strong></div>
          </div>
        </div>
        {/*
          * The scheduled stops are eight names across 1,568 km. Everything in
          * between - Klerksdorp, Hopetown, Touws River - used to go past with
          * nothing said about it, which is most of the journey.
          */}
        <section className="ride-context-places">
          <p className="t-eyebrow">Passing now</p>
          {passing ? (
            <>
              <h3>{passing.name}</h3>
              <p>{passing.note}</p>
              <p className="ride-context-places__meta">
                {passing.offsetM < 500
                  ? "On the line"
                  : `${(passing.offsetM / 1000).toFixed(1)} km to the ${passing.side}`}
                {` · km ${passing.km}`}
              </p>
            </>
          ) : (
            <p className="ride-context-places__open">
              Open country.
              {upcoming
                ? ` ${upcoming.name} is ${Math.max(1, Math.round(upcoming.km - km))} km ahead.`
                : " Cape Town is the next thing on this line."}
            </p>
          )}
        </section>

        <section className="ride-context-ai">
          <p className="t-eyebrow">Ask the trail</p>
          <p>Query local history compiled from verified route information.</p>
          <form onSubmit={submitGuideQuery} className="ride-context-ai__form">
            <input value={aiQuery} onChange={event => setAiQuery(event.target.value)} placeholder={`Ask about ${active.name}'s rail history...`} aria-label="Ask the trail" />
            <button type="submit" aria-label="Ask the trail">→</button>
          </form>
          {aiAnswer && <p className="ride-context-ai__answer">{aiAnswer}</p>}
        </section>
      </aside>

    </div>
  );
}
