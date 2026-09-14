import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, TrainFront } from "lucide-react";
import { stops } from "../data";
import { durationLabel, scheduleLabel, scheduledMinutesBetween } from "../lib/timetable";
import { createPassenger, passenger, save } from "../lib/passenger";
import { saveTrip } from "../lib/trip";
import "./Start.css";

/**
 * Three steps, in the order every traveller already expects: what this is,
 * where you are going, who you are. It ends the way a booking ends — with
 * something that stands for your trip — and from there every other screen has
 * a reason to exist.
 */
export default function Start() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [boardId, setBoardId]   = useState(() => passenger()?.trip.boardId ?? stops[0].id);
  const [alightId, setAlightId] = useState(() => passenger()?.trip.alightId ?? stops[stops.length - 1].id);
  /** Someone coming back to change their leg keeps their reference and name. */
  const existing = passenger();
  const [name, setName]         = useState(existing?.name ?? "");
  const [contact, setContact]   = useState(existing?.contact ?? "");

  const boardIndex  = stops.findIndex(s => s.id === boardId);
  const alightIndex = stops.findIndex(s => s.id === alightId);
  const legValid    = alightIndex > boardIndex;
  const minutes     = legValid ? scheduledMinutesBetween(boardId, alightId) : null;

  /**
   * Someone who declines setup here must not be asked the same question again
   * twelve hundred milliseconds later by the ride. One refusal is enough.
   */
  const skipToRide = () => {
    try { window.localStorage.setItem("st.trip-asked.v1", "1"); } catch { /* fine */ }
    navigate("/ride");
  };

  const finish = () => {
    const trip = { boardId, alightId };
    saveTrip(trip);
    if (existing) {
      // Changing your leg is not a new booking: the reference stays put.
      save({ ...existing, name: name.trim() || existing.name, contact: contact.trim() || undefined, trip });
    } else {
      createPassenger({ name: name.trim() || "Traveller", contact, trip });
    }
    navigate("/trip");
  };

  return (
    <div className="start-page">
      <div className="start">
        <ol className="start__steps" aria-label="Setup progress">
          {["Welcome", "Your trip", "Your details"].map((label, i) => (
            <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
              <span aria-hidden="true">{i < step ? <Check size={11} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="start__panel">
            <span className="start__icon" aria-hidden="true"><TrainFront size={20} /></span>
            <h1 className="start__title">The line, as you travel it</h1>
            <p className="start__lede">
              Shosholoza Trail follows the Pretoria–Cape Town railway and tells you what you are
              passing, what is worth getting off for, and how long you actually have when the
              train stops.
            </p>
            <ul className="start__points">
              <li><b>Built for no signal.</b> Download once and the whole journey keeps working
                through the Karoo.</li>
              <li><b>Measured in minutes, not kilometres.</b> Every shop and sight is judged
                against the time the train is standing.</li>
              <li><b>Nothing leaves your phone.</b> No account, no tracking, no data sold.</li>
            </ul>
            <div className="start__actions">
              <button className="btn btn--primary" onClick={() => setStep(1)}>
                Set up my journey <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button className="btn btn--ghost" onClick={skipToRide}>
                Just show me the ride
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="start__panel">
            <h1 className="start__title">Which part of the line is yours?</h1>
            <p className="start__lede">
              The train calls at {stops.length} stops over a night and two days. Your leg decides
              what the app shows you.
            </p>
            <div className="start__fields">
              <label className="start__field">
                <span>I board at</span>
                <select value={boardId} onChange={e => setBoardId(e.target.value)} id="start-board">
                  {stops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{scheduleLabel(s.id) ? ` — ${scheduleLabel(s.id)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="start__field">
                <span>I get off at</span>
                <select value={alightId} onChange={e => setAlightId(e.target.value)} id="start-alight">
                  {stops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{scheduleLabel(s.id) ? ` — ${scheduleLabel(s.id)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={`start__summary${legValid ? "" : " start__summary--warn"}`}>
              {legValid
                ? <>{stops[boardIndex].name} to {stops[alightIndex].name}
                    {minutes ? <> · scheduled <b>{durationLabel(minutes)}</b></> : null}
                    {" "}· {Math.max(0, alightIndex - boardIndex - 1)} stop{alightIndex - boardIndex - 1 === 1 ? "" : "s"} on the way</>
                : "Choose a stop further down the line than where you board."}
            </p>
            <div className="start__actions">
              <button className="btn btn--primary" disabled={!legValid} onClick={() => setStep(2)}>
                Continue <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button className="btn btn--ghost" onClick={() => setStep(0)}>Back</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="start__panel">
            <h1 className="start__title">Who is travelling?</h1>
            <p className="start__lede">
              A first name is enough. This build has no accounts: everything below stays on this
              phone and is never uploaded. A contact detail is only useful once vendors can
              confirm a collection, which needs a service that does not exist yet — until then
              it sits here unused, and you can leave it blank.
            </p>
            <div className="start__fields start__fields--stack">
              <label className="start__field">
                <span>Name <em>optional</em></span>
                <input
                  id="start-name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Lindokuhle" autoComplete="given-name"
                />
              </label>
              <label className="start__field">
                <span>Phone or email <em>optional</em></span>
                <input
                  id="start-contact" value={contact} onChange={e => setContact(e.target.value)}
                  placeholder="Kept on this phone — nothing is sent yet"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="start__actions">
              <button className="btn btn--primary" onClick={finish}>
                {existing ? "Save my journey" : "Create my boarding pass"} <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button className="btn btn--ghost" onClick={() => setStep(1)}>Back</button>
            </div>
            <p className="start__foot">
              Leave the name blank and your pass simply reads "Traveller". You can change or
              delete all of this later from your journey screen.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
