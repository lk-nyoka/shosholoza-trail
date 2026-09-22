import { useEffect, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Compass, MessageCircleQuestion, Ticket, TrainFront, MapPin,
} from "lucide-react";
import { greeting, passenger, type Passenger } from "../lib/passenger";
import { tripStops } from "../lib/trip";
import { durationLabel, scheduleLabel, scheduledMinutesBetween } from "../lib/corridor";
import { reservations, STATE_LABEL, type Reservation } from "../lib/reserve";
import OfflineJourney from "../components/ui/OfflineJourney";
import { eraseEverything } from "../lib/erase";
import "./Trip.css";

/**
 * The hub.
 *
 * Everything this app can do already existed; what was missing was a place that
 * knows whose journey it is and sends you to the right part of it. This is that
 * place: your pass, where you are in the line, and the three things you would
 * actually reach for while sitting on a train.
 */
export default function Trip() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Passenger | null>(() => passenger());
  const [held, setHeld] = useState<Reservation[]>([]);

  useEffect(() => { setHeld(reservations()); }, []);
  /**
   * Someone arriving here without a journey is not lost — they simply have not
   * told us which part of the line is theirs yet. Say that and offer the way
   * on. An automatic redirect used to fire 1.4 seconds later, which is less
   * time than it takes to read the sentence explaining what happened, and it
   * took the choice away from somebody who opened "My Journey" on purpose.
   */

  if (!me) {
    return (
      <div className="container trip-handoff" role="status">
        <p className="t-eyebrow">My Journey</p>
        <h1 className="t-display t-display--md">Let's set your journey up first</h1>
        <p>
          This page holds your boarding pass, your stops and anything you reserve. It needs to
          know where you board and where you get off — two questions, on the next screen.
        </p>
        <Link to="/start" className="btn btn--primary">Set up my journey</Link>
      </div>
    );
  }

  const legs   = tripStops(me.trip);
  const board  = legs[0];
  const alight = legs[legs.length - 1];
  const minutes = scheduledMinutesBetween(me.trip.boardId, me.trip.alightId);
  const intermediate = legs.slice(1, -1);

  const forget = async () => {
    await eraseEverything();
    setMe(null);
    navigate("/start", { replace: true });
  };

  return (
    <div className="trip-page">
      <div className="container trip-inner">

        <header className="trip-head">
          <p className="t-eyebrow">{greeting(me.name)}</p>
          <h1 className="t-display t-display--md trip-head__title">Your journey</h1>
        </header>

        {/* ── The pass ─────────────────────────────────────────── */}
        <section className="pass lands" aria-label="Your boarding pass">
          <div className="pass__top">
            <span className="pass__brand"><TrainFront size={15} aria-hidden="true" /> Shosholoza Trail</span>
            <span className="pass__ref">{me.reference}</span>
          </div>

          <div className="pass__leg">
            <div>
              <small>Board</small>
              <b>{board.name}</b>
              <span>{scheduleLabel(board.id) ?? "—"}</span>
            </div>
            <span className="pass__arrow" aria-hidden="true"><ArrowRight size={18} /></span>
            <div className="pass__leg-end">
              <small>Get off</small>
              <b>{alight.name}</b>
              <span>{scheduleLabel(alight.id) ?? "—"}</span>
            </div>
          </div>

          <dl className="pass__meta">
            <div><dt>Passenger</dt><dd>{me.name}</dd></div>
            <div><dt>Scheduled</dt><dd>{minutes ? durationLabel(minutes) : "—"}</dd></div>
            <div><dt>Stops on the way</dt><dd>{intermediate.length}</dd></div>
          </dl>

          <p className="pass__note">
            Not a ticket. Buy from the operator — this holds your journey inside the app.
          </p>
        </section>

        {/* ── The stops on your leg ────────────────────────────── */}
        <section className="trip-section" aria-labelledby="your-stops">
          <h2 id="your-stops" className="t-heading t-heading--lg">Your stops</h2>
          <ol className="trip-stops reveal">
            {legs.map((stop, i) => (
              <li
                key={stop.id}
                className={i === 0 || i === legs.length - 1 ? "trip-stops__end" : ""}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="trip-stops__dot" aria-hidden="true" />
                <Link to={`/destinations#${stop.id}`} className="trip-stops__link">
                  <b>{stop.name}</b>
                  <span>{scheduleLabel(stop.id) ?? `${Math.round(stop.km)} km`}</span>
                </Link>
                <span className="trip-stops__role">
                  {i === 0 ? "You board" : i === legs.length - 1 ? "You get off" : "Calls here"}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── What you would reach for ─────────────────────────── */}
        <section className="trip-section" aria-labelledby="do-now">
          <h2 id="do-now" className="t-heading t-heading--lg">While you travel</h2>
          <div className="trip-actions">
            <Link to="/ride" className="trip-action">
              <span className="trip-action__icon" aria-hidden="true"><TrainFront size={17} /></span>
              <b>Follow the line</b>
              <span>Watch the route as the train runs it, with every town named as you pass.</span>
            </Link>
            <Link to="/destinations" className="trip-action">
              <span className="trip-action__icon" aria-hidden="true"><Compass size={17} /></span>
              <b>At the next stop</b>
              <span>What you can reach in the minutes the train is standing — and reserve it.</span>
            </Link>
            <Link to="/ai" className="trip-action">
              <span className="trip-action__icon" aria-hidden="true"><MessageCircleQuestion size={17} /></span>
              <b>Ask the guide</b>
              <span>Answers drawn from a verified knowledge base. Works with no signal.</span>
            </Link>
          </div>
        </section>

        {/* ── Reservations ─────────────────────────────────────── */}
        <section className="trip-section" aria-labelledby="held">
          <h2 id="held" className="t-heading t-heading--lg">Your reservations</h2>
          {held.length === 0 ? (
            <p className="trip-empty">
              Nothing reserved yet. Reserve at a stop and the collection code appears here —
              you pay the vendor in person.
            </p>
          ) : (
            <ul className="trip-reservations">
              {held.map(r => (
                <li key={r.id}>
                  <span className="trip-reservations__code"><Ticket size={13} aria-hidden="true" /> {r.code}</span>
                  <span className="trip-reservations__what"><b>{r.placeName}</b><small><MapPin size={10} aria-hidden="true" /> {r.stopName}</small></span>
                  <span className={`trip-reservations__state trip-reservations__state--${r.state}`}>{STATE_LABEL[r.state]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Offline ──────────────────────────────────────────── */}
        <section className="trip-section" aria-labelledby="offline">
          <h2 id="offline" className="t-heading t-heading--lg">Before the signal goes</h2>
          <OfflineJourney />
        </section>

        <footer className="trip-foot">
          <Link to="/start">Change my trip</Link>
          <button onClick={forget} type="button">Delete everything on this device</button>
        </footer>
      </div>
    </div>
  );
}
