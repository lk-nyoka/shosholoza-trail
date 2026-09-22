import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Heart, Search, Star, Store } from "lucide-react";
import PlaceCard from "../components/ui/PlaceCard";
import { stops, stopHero } from "../data";
import { DEFAULT_STOP_MINUTES, STOP_MINUTE_CHOICES, scheduleLabel } from "../lib/corridor";
import TripSetup from "../components/ui/TripSetup";
import NearbyList from "../components/ui/NearbyList";
import PhotoCarousel from "../components/ui/PhotoCarousel";
import { shotsFor } from "../data/gallery";
import { onTrip, saveTrip, savedTrip, tripStops, type Trip } from "../lib/trip";
import type { Stop } from "../types";
import "./Destinations.css";

/**
 * Each stop's hero is the verified Commons photograph of that town, taken
 * from the stop's own data rather than a second list of stock ids.
 */
const HERO_IMAGES: Record<string, string> = Object.fromEntries(
  stops.map((stop) => [stop.id, shotsFor(stop.id)[0]?.url ?? stopHero(stop.id)]),
);

export default function Destinations() {
  const [active, setActive]   = useState<Stop>(stops[0]);
  const [saved, setSaved]     = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem("shosholoza.saved-places.v1");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) && parsed.every(item => typeof item === "string") ? parsed : [];
    } catch {
      return [];
    }
  });
  const [filter, setFilter]   = useState<"all" | "attraction" | "vendor">("all");
  const [query, setQuery]     = useState("");
  /**
   * How long the train stands here. The timetable publishes departures, not
   * dwell times, so this is the passenger's own figure — the conductor's
   * announcement is the only reliable source — and it drives everything the
   * page says about what is reachable.
   */
  const [stopMinutes, setStopMinutes] = useState(DEFAULT_STOP_MINUTES);
  const [trip, setTrip]       = useState<Trip | null>(() => savedTrip());
  const [editingTrip, setEditingTrip] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("shosholoza.saved-places.v1", JSON.stringify(saved));
    } catch {
      // Storage can be unavailable in private browsing; saving remains optional.
    }
  }, [saved]);

  /**
   * Where you board or get off, the train leaving is not a deadline you are
   * racing. Everything nearby is open to you, so the dwell-time maths that
   * governs the intermediate stops simply does not apply.
   */
  const ownStop = Boolean(trip && (trip.boardId === active.id || trip.alightId === active.id));
  const heroRef = useRef<HTMLDivElement>(null);

  // scroll to anchor on load
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const target = stops.find(s => s.id === hash);
      if (target) setActive(target);
    }
  }, []);

  const toggleSaved = (id: string) =>
    setSaved(cur => cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]);

  const filtered = active.places.filter(p => {
    const matchType = filter === "all" || p.type === filter;
    const matchQuery = !query.trim() ||
      `${p.name} ${p.category} ${p.blurb}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchType && matchQuery;
  });
  const attractions = filtered.filter(p => p.type === "attraction");
  const vendors     = filtered.filter(p => p.type === "vendor");

  return (
    <div className="destinations-page">
      {/* Stop selector */}
      <nav className="destinations-nav" aria-label="Stop selector">
        <div className="container destinations-nav__inner">
          <ul role="list" className="destinations-nav__list">
            {stops.map((stop, i) => (
              <li key={stop.id} role="listitem">
                <button
                  className={["destinations-nav__item", stop.id === active.id ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setActive(stop); setFilter("all"); setQuery(""); heroRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  aria-current={stop.id === active.id ? "page" : undefined}
                >
                  <span className="destinations-nav__num">{String(i + 1).padStart(2, "0")}</span>
                  <span>{stop.name}</span>
                  <span className="destinations-nav__km">{stop.km === 0 ? "Start" : `${stop.km} km`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Hero */}
      <div className="destinations-hero" ref={heroRef} id={active.id}>
        <div
          className="destinations-hero__bg"
          style={{ backgroundImage: `url("${HERO_IMAGES[active.id] ?? HERO_IMAGES["cape-town"]}")` }}
          aria-hidden="true"
        />
        <div className="destinations-hero__overlay" aria-hidden="true" />
        <div className="container destinations-hero__content">
          <p className="t-eyebrow destinations-hero__eyebrow">
            {active.province} · {active.km === 0 ? "Origin" : `${active.km.toLocaleString()} km`}
          </p>
          <h1 className="t-display t-display--lg destinations-hero__name">
            {active.name}
          </h1>
          <p className="destinations-hero__teaser">{active.teaser}</p>
          <Link className="destinations-hero__hub-link" to={`/stops/${active.id}`}>
            Open the {active.name} stop hub <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* Your time at this stop */}
      <div className="container destinations-window">
        <div className="destinations-window__line">
          <span className="destinations-window__label">Scheduled departure</span>
          <b>{scheduleLabel(active.id) ?? "Not a scheduled call"}</b>
          {trip && !onTrip(trip, active.id) && (
            <span className="destinations-window__off">Not on your leg</span>
          )}
        </div>
        <div className="destinations-window__line">
          <span className="destinations-window__label">Time at this stop</span>
          {ownStop && <b className="destinations-window__own">Your own stop — no rush</b>}
          <div className="destinations-window__choices" role="group" aria-label="How long the train stands here">
            {STOP_MINUTE_CHOICES.map(m => (
              <button
                key={m}
                className={["destinations-window__choice", m === stopMinutes ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => setStopMinutes(m)}
                aria-pressed={m === stopMinutes}
                type="button"
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
        <p className="destinations-window__note">
          Set what the conductor announced. Everything below is measured as the walk there
          and back against that time, not as a distance.
        </p>
        <p className="destinations-window__warning" role="note">
          <b>These are estimates, and the train will not wait.</b> Walking times assume a clear
          route at a steady pace — they do not know about queues, stairs, closed gates, security
          checks or a platform you cannot re-enter. Leave yourself more time than the app says,
          keep your coach in sight, and if you are unsure, stay on board.
        </p>
        <div className="destinations-window__trip">
          <button className="destinations-window__triplink" onClick={() => setEditingTrip(true)} type="button">
            {trip
              ? `Your trip: ${tripStops(trip)[0].name} to ${tripStops(trip)[tripStops(trip).length - 1].name} — change`
              : "Set your boarding and alighting stops"}
          </button>
        </div>
      </div>

      {editingTrip && (
        <TripSetup
          initial={trip}
          onSave={next => { saveTrip(next); setTrip(next); setEditingTrip(false); }}
          onClose={() => setEditingTrip(false)}
        />
      )}

      {/* Photographs */}
      <div className="container destinations-gallery">
        <PhotoCarousel shots={shotsFor(active.id)} place={active.name} />
      </div>

      {/* Content */}
      <div className="container destinations-content">
        {/* Controls */}
        <div className="destinations-controls">
          <div className="destinations-filter-tabs" role="group" aria-label="Filter by type">
            {(["all", "attraction", "vendor"] as const).map(f => (
              <button
                key={f}
                className={["destinations-filter-tab", filter === f ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
              >
                {f === "all" ? "All" : f === "attraction" ? "Attractions" : "Vendors"}
              </button>
            ))}
          </div>
          <label className="destinations-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search around ${active.name}`}
              aria-label="Search places"
            />
          </label>
          {saved.length > 0 && (
            <span className="destinations-saved-count">
              <Heart size={12} fill="currentColor" aria-hidden="true" />
              {saved.length} saved
            </span>
          )}
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="destinations-empty">
            <Search size={28} aria-hidden="true" />
            <b>No places found</b>
            <span>Try a different search or clear the filter.</span>
          </div>
        ) : (
          <>
            {(filter === "all" || filter === "attraction") && attractions.length > 0 && (
              <section className="destinations-group" aria-labelledby={`${active.id}-attractions`}>
                <header className="destinations-group__header">
                  <span className="destinations-group__icon" aria-hidden="true"><Compass size={15} /></span>
                  <h2 id={`${active.id}-attractions`} className="t-heading t-heading--lg">Attractions</h2>
                  <small>{attractions.length}</small>
                </header>
                <div className="destinations-group__grid">
                  {attractions.map(place => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      saved={saved.includes(place.id)}
                      onToggleSave={toggleSaved}
                      window={{ stopId: active.id, stopName: active.name, stopMinutes, unlimited: ownStop }}
                    />
                  ))}
                </div>
              </section>
            )}
            {(filter === "all" || filter === "vendor") && vendors.length > 0 && (
              <section className="destinations-group" aria-labelledby={`${active.id}-vendors`}>
                <header className="destinations-group__header">
                  <span className="destinations-group__icon" aria-hidden="true"><Store size={15} /></span>
                  <h2 id={`${active.id}-vendors`} className="t-heading t-heading--lg">Local Vendors</h2>
                  <small>{vendors.length}</small>
                </header>
                <div className="destinations-group__grid">
                  {vendors.map(place => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      saved={saved.includes(place.id)}
                      onToggleSave={toggleSaved}
                      window={{ stopId: active.id, stopName: active.name, stopMinutes, unlimited: ownStop }}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <NearbyList stop={active} stopMinutes={stopMinutes} unlimited={ownStop} query={query} />
      </div>
    </div>
  );
}
