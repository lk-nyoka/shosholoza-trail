import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Home, ChevronLeft, ChevronRight, ChevronUp, Film, LayoutPanelTop, Map as MapIcon, FastForward, Pause, Play, Rewind, Volume2, X } from "lucide-react";
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
import { durationLabel, scheduledMinutesBetween } from "../lib/corridor";
import {
  buildLeg, momentAtRouteKm, statusLines, todaySast,
  type Itinerary, type JourneyMoment,
} from "../lib/journeyClock";
import "./Ride.css";
import { DEBUG, DEMO, DEMO_SPEED, DEMO_START_KM } from "../lib/demo";
import ModeSwitch from "../components/journey/ModeSwitch";
import ExperienceCard from "../components/journey/ExperienceCard";
import { saveModes, savedModes, type Mode } from "../lib/modes";
import { activeExperience } from "../lib/experienceEngine";
import { NUDGE_AT_MB, onUsage, shouldStartLowData } from "../lib/dataUsage";

/** The three states the ride screen can be in. */
export type RideView = "cinematic" | "explore" | "control";

const RIDE_VIEWS: { id: RideView; label: string; hint: string; Icon: typeof Film }[] = [
  { id: "cinematic", label: "View", hint: "The window and nothing else", Icon: Film },
  { id: "explore", label: "Explore", hint: "The window, with what is passing", Icon: MapIcon },
  { id: "control", label: "Control", hint: "Stops, playback and station detail", Icon: LayoutPanelTop },
];
import { useReducedMotion } from "../hooks/useReducedMotion";
import RideBoot from "../components/map/RideBoot";
import type { RideStage } from "../components/map/TrainMap";


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
  /**
   * What the world is doing while it builds.
   *
   * `bootKey` is how a retry works: changing it remounts the map, which is
   * the only honest way to start the build again - the scene, the streamer
   * and the GL context are all created in the map's own effect.
   */
  const [stage, setStage] = useState<RideStage>({ kind: "starting" });
  const [bootKey, setBootKey] = useState(0);

  const reducedMotion = useReducedMotion();
  // In demo mode the ride opens on the run down to Matjiesfontein, already
  // moving. Starting at Pretoria means the first thing an audience sees is a
  // suburb, and the first thirty seconds of a four-minute pitch are the ones
  // that decide whether anyone is still listening.
  /**
   * The passenger's itinerary, and the clock that follows from it.
   *
   * The ride's sense of time is not the device clock and not a slider: it is
   * the published timetable for the leg this passenger actually booked. A
   * passenger boarding at Kimberley starts at Kimberley, at Kimberley's
   * scheduled time, with zero kilometres behind them — the Pretoria section
   * stays on the map as context rather than something to sit through.
   */
  const [itinerary] = useState<Itinerary | null>(() => {
    const trip = savedTrip();
    if (!trip) return null;
    return {
      boardDate: trip.date ?? todaySast(),
      direction: trip.direction ?? "southbound",
      boardStopId: trip.boardId,
      alightStopId: trip.alightId,
    };
  });

  /**
   * This passenger's leg, built once. An itinerary the timetable cannot run —
   * a stop that is not on this service, or a backwards leg — falls back to the
   * whole line rather than refusing to show a ride at all.
   */
  const leg = useMemo(() => {
    if (!itinerary) return null;
    try {
      return buildLeg(itinerary);
    } catch {
      return null;
    }
  }, [itinerary]);

  /** Where this passenger's ride begins on the corridor. */
  const boardingKm = leg ? leg[0].station.km : 0;

  const [km, setKm] = useState(DEMO ? DEMO_START_KM : boardingKm);
  const [isPlaying, setIsPlaying] = useState(DEMO);
  const [speed, setSpeed] = useState<number>(DEMO ? DEMO_SPEED : 1);
  const [arrival, setArrival] = useState<Stop | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [viewYaw, setViewYaw] = useState(0);
  const [viewPitch, setViewPitch] = useState(0);
  const [aiQuery, setAiQuery] = useState("");
  /**
   * Everything off but the view.
   *
   * There are a dozen panels over this canvas and on a phone they cover most
   * of the thing they are describing. One tap clears them all; a second brings
   * them back. It is also the shot to present from - the rail world is the
   * emotional hook and it cannot land through six cards of chrome.
   */
  /**
   * One screen, three states — not a pile of panels with a hide switch.
   *
   * At 390 px the ride was showing fourteen absolutely-positioned regions over
   * the animation at once: two bars, a bearing strip, a landmark list, a POI
   * callout, look controls, a trip chip, a HUD, a route caption, a station
   * rail, a mode switch, an experience card and a context panel. Every one of
   * them was defensible on its own; together they left the view - which is the
   * product - visible through the gaps.
   *
   *   cinematic — the view and nothing but the view, plus the way back.
   *   explore   — the view with its captions: where we are, what is passing.
   *   control   — the working state: stops, playback, station context.
   *
   * The states are explicit and named rather than a boolean, because "not
   * cinema" was doing the work of two different screens.
   */
  const [view, setView] = useState<RideView>("explore");
  const cinema = view === "cinematic";
  const [modes, setModes] = useState<Mode[]>(() => savedModes());
  /**
   * Dismissing an experience should not make it pop straight back the next
   * frame, so a dismissed one stays down until the train leaves its stretch.
   */
  const [dismissed, setDismissed] = useState<string | null>(null);
  /**
   * Low-data mode.
   *
   * Riding the corridor with the sharp terrain rings on pulled several hundred
   * megabytes — on an app for people crossing exactly the parts of the country
   * where data costs the most. It starts on when the browser says the phone is
   * on a metered or slow connection, and the meter beside it means the number
   * is never a surprise again.
   */
  const [lowData, setLowData] = useState(() => shouldStartLowData());
  const [dataMb, setDataMb] = useState(0);

  useEffect(() => onUsage(setDataMb), []);
  useEffect(() => {
    if (!lowData && dataMb > NUDGE_AT_MB) setLowData(true);
  }, [dataMb, lowData]);
  const [aiAnswer, setAiAnswer] = useState("");
  /**
   * What time it is, where this position falls on the leg, and what is next.
   * Recomputed from the kilometre, so the clock and the distance can never
   * drift apart no matter what the simulation speed is doing.
   */
  const moment: JourneyMoment | null = useMemo(() => {
    if (!itinerary || !leg) return null;
    try {
      return momentAtRouteKm(itinerary, km);
    } catch {
      return null;
    }
  }, [itinerary, leg, km]);
  const status = moment ? statusLines(moment, { live: false, speed }) : null;

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

  /**
   * The engine, in one line: where we are plus why we are travelling. Changing
   * the mode without moving changes this, which is the whole argument.
   */
  const experience = activeExperience(km, modes);
  const showExperience = experience && experience.id !== dismissed;

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
    <div className={`ride-page ride-page--${view}`}>
      <h1 className="sr-only">
        The Ride — following the Pretoria to Cape Town line in three dimensions
      </h1>
      <div className="ride-spatial-column">
      {/* Full-screen map */}
      <TrainMap
        lowData={lowData}
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
        instant={moment?.at ?? null}
        brightness={reducedMotion ? 0.82 : 1}
        onStage={setStage}
        key={bootKey}
      />
      <RideBoot
        stage={stage}
        onRetry={() => { setStage({ kind: "starting" }); setBootKey(key => key + 1); }}
        onLightweight={() => {
          setLowData(true);
          setStage({ kind: "starting" });
          setBootKey(key => key + 1);
        }}
      />
      <div className="ride-page__vignette" aria-hidden="true" />

      {/*
        * The view switch. Always visible, in every state, including cinematic -
        * a state you cannot leave is a trap, not a mode.
        *
        * Radio group rather than three toggles: exactly one is on, which is
        * what a radio group means and what `aria-pressed` on three separate
        * buttons does not. Every target is 44x44 on a phone.
        */}
      <div className="ride-viewswitch" role="radiogroup" aria-label="What the screen shows">
        {RIDE_VIEWS.map(option => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={view === option.id}
            className={view === option.id ? "ride-viewswitch__btn is-on" : "ride-viewswitch__btn"}
            onClick={() => setView(option.id)}
            title={option.hint}
          >
            <option.Icon size={16} aria-hidden="true" />
            <span className="ride-viewswitch__label">{option.label}</span>
          </button>
        ))}
      </div>

      {/*
        * One bar, not three.
        *
        * The modes, the overview button and the ride status were three separate
        * absolutely-positioned strips stacked down the middle of the screen,
        * and at desktop width they overlapped each other. The animation is the
        * product; everything here is a caption for it, so it all lives on one
        * line at the top and gets out of the way.
        */}
      <div className="ride-topbar">
        {/* The site header does not render on this route, so the way back has
            to live here. Without it the immersive screen is a dead end. */}
        <Link className="ride-home" to="/" aria-label="Leave the ride and go to the home page">
          <Home size={15} aria-hidden="true" />
        </Link>
        <ModeSwitch modes={modes} onChange={next => { setModes(next); saveModes(next); setDismissed(null); }} />
        <span className="ride-topbar__spacer" aria-hidden="true" />
        {/* This used to be a button labelled "Route overview" whose entire
            behaviour was setIsPlaying(false) — a second pause control, wearing
            the name of a different page, 700 px above the real pause button.
            It now goes where its label has always said it goes. */}
        <Link className="ride-overview" to="/journey" aria-label="Open the route overview">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Route overview</span>
        </Link>
        <button className="ride-topbar__sound" onClick={() => setSoundOn(current => !current)} aria-pressed={soundOn}>
          <Volume2 size={15} aria-hidden="true" />
          Sound {soundOn ? "on" : "off"}
        </button>
        <button
          className={lowData ? "ride-data ride-data--on" : "ride-data"}
          onClick={() => setLowData(v => !v)}
          aria-pressed={lowData}
          title={
            lowData
              ? "Low data: sharp ground detail is off. Tap for full detail."
              : "Full detail. Tap to save data."
          }
        >
          {lowData ? "Low data" : "Full detail"}
          <b>{dataMb} MB</b>
        </button>
        {status ? (
          /* DAY 2 · 05:48 SAST · Approaching Matjiesfontein · Scheduled arrival 06:30 */
          <span className="ride-run ride-run--clock">
            <b>{status.when}</b>
            <span>{status.heading}</span>
            {status.arrival && <span>{status.arrival}</span>}
            <span>{isPlaying ? status.mode : "Paused"}</span>
            {structure ? <span>{structure}</span> : null}
          </span>
        ) : (
          <span className="ride-run">
            {Math.round(km)} / {TOTAL_KM} km · {isPlaying ? `${speed}×` : "paused"}
            {structure ? ` · ${structure}` : ""}
          </span>
        )}
        {/*
          * "8 resolved / 8 arrivals / 3 billboards lit" is instrumentation, not
          * something a passenger on a train needs or can act on. It earns its
          * place during development, so it lives behind ?debug=1 now.
          */}
        <span
          className="ride-map-status"
          hidden={!DEBUG}
          title={`${railRouteMeta.vertices.toLocaleString()} mapped vertices, ${railRouteMeta.lengthKm} km - ${railRouteMeta.source}`}
        >
          {mapStatus}
          {imagery ? ` / imagery ${imagery}` : ""}
          {altitude !== null ? ` / ${altitude.toLocaleString()} m` : ""}
          {` / heading ${compassPoint(heading)}`}
        </span>
      </div>

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
      {showExperience && experience && (
        <div className="ride-experience">
          <ExperienceCard
            experience={experience}
            stopName={experience.stopId ? stops.find(s => s.id === experience.stopId)?.name ?? null : null}
            onClose={() => setDismissed(experience.id)}
          />
        </div>
      )}

      <div className="ride-controls" aria-label="Ride controls">
        <button className="ride-controls__jump" onClick={() => handleStepKm(-50)} title="Back 50 km" aria-label="Back 50 kilometres">
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
        <button className="ride-controls__jump" onClick={() => handleStepKm(50)} title="Forward 50 km" aria-label="Forward 50 kilometres">
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

      {/*
       * The stylesheet has always hidden this panel unless it carries
       * `--open`, and nothing ever added that class: the station context, the
       * "passing now" note and "Ask the trail" have been unreachable on every
       * screen size. It is open in `explore` and `control`, and on a phone it
       * is a bottom sheet rather than a column, because a phone has no room
       * for a column beside a full-bleed view.
       */}
      <aside
        className={[
          "ride-context-panel",
          cinema ? "" : "ride-context-panel--open",
          view === "control" ? "ride-context-panel--expanded" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Station context"
        aria-hidden={cinema}
      >
        <button
          type="button"
          className="ride-context-panel__handle"
          onClick={() => setView(current => (current === "control" ? "explore" : "control"))}
          aria-expanded={view === "control"}
        >
          <span className="ride-context-panel__grip" aria-hidden="true" />
          <span className="sr-only">
            {view === "control" ? "Collapse station context" : "Expand station context"}
          </span>
        </button>
        {/*
         * The peek line.
         *
         * On a phone this strip is the only part of the sheet that is visible
         * without opening it, so it carries the journey readout rather than a
         * kilometre count the rider can already see on the map. The top bar
         * used to hold this line and cut it in half at 390 px; a sheet that is
         * already the full width of the screen does not have that problem.
         */}
        <div className="ride-context-status">
          {status ? (
            <>
              <b>{status.when}</b>
              <span>{status.heading}</span>
              {status.arrival && <span>{status.arrival}</span>}
              <span>{isPlaying ? status.mode : "Paused"}</span>
            </>
          ) : (
            <span>{km === active.km ? `ARRIVED · ${Math.round(km)} km` : `EN ROUTE · ${Math.round(km)} km`}</span>
          )}
        </div>
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
