import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Users2, MapPin, ArrowRight, CheckCircle2 } from "lucide-react";
import { stops } from "../data";
import "./Plan.css";

const STOP_NAMES = stops.map(s => s.name);

interface FormState {
  origin: string;
  destination: string;
  date: string;
  passengers: string;
  accessibility: boolean;
  interests: string[];
}

const INTERESTS = ["Heritage & History", "Local Food", "Nature", "Art & Culture", "Markets & Craft"];

export default function Plan() {
  const [form, setForm] = useState<FormState>({
    origin: "Pretoria",
    destination: "Cape Town",
    date: "",
    passengers: "1",
    accessibility: false,
    interests: [],
  });
  const [submitted, setSubmitted] = useState(false);

  const toggle = (interest: string) =>
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest],
    }));

  /**
   * The line runs one way and stops once at each place, so a journey from
   * Pretoria to Pretoria — or from Worcester back up to Kimberley — is not a
   * trip this service makes. The form used to accept both and cheerfully
   * report "you're travelling from Pretoria to Pretoria".
   */
  const originIndex = STOP_NAMES.indexOf(form.origin);
  const destinationIndex = STOP_NAMES.indexOf(form.destination);
  const legProblem =
    originIndex === destinationIndex
      ? "Choose a different stop to get off at — this is where you board."
      : destinationIndex < originIndex
        ? `This service runs south. ${form.destination} comes before ${form.origin} on the line, so you would need the northbound working.`
        : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (legProblem) return;
    setSubmitted(true);
  };

  return (
    <div className="plan-page">
      <div className="plan-page__hero">
        <div className="container plan-page__hero-inner">
          <p className="t-eyebrow">Plan Your Trip</p>
          <h1 className="t-display t-display--lg plan-page__heading">
            Map your journey{" "}<br />before you board.
          </h1>
          <p className="t-body plan-page__sub">
            Tell us where you're starting, where you're heading and what matters to you.
            We'll show you what's waiting at every stop.
          </p>
        </div>
      </div>

      <div className="container plan-page__content">
        {submitted ? (
          <div className="plan-success">
            <CheckCircle2 size={44} aria-hidden="true" />
            <h2 className="t-display t-display--sm">Your plan is ready.</h2>
            <p className="t-body">
              You're travelling from <b>{form.origin}</b> to <b>{form.destination}</b>
              {form.date && ` on ${new Date(form.date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`}
              {form.passengers !== "1" ? ` with ${form.passengers} passengers` : ""}.
            </p>
            <div className="plan-success__actions">
              <Link to="/destinations" className="btn btn--primary">
                Explore destinations <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <button
                className="btn btn--outline-dark"
                onClick={() => setSubmitted(false)}
              >
                Change details
              </button>
            </div>
          </div>
        ) : (
          <form className="plan-form" onSubmit={handleSubmit} aria-label="Journey planning form">
            <div className="plan-form__grid">
              {/* Origin */}
              <div className="plan-field">
                <label className="plan-label" htmlFor="plan-origin">
                  <MapPin size={14} aria-hidden="true" /> Departing from
                </label>
                <select
                  id="plan-origin"
                  className="plan-select"
                  value={form.origin}
                  onChange={e => setForm(p => ({ ...p, origin: e.target.value }))}
                >
                  {STOP_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Destination */}
              <div className="plan-field">
                <label className="plan-label" htmlFor="plan-dest">
                  <MapPin size={14} aria-hidden="true" /> Arriving at
                </label>
                <select
                  id="plan-dest"
                  className="plan-select"
                  value={form.destination}
                  onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                >
                  {STOP_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="plan-field">
                <label className="plan-label" htmlFor="plan-date">
                  <CalendarDays size={14} aria-hidden="true" /> Travel date
                </label>
                <input
                  id="plan-date"
                  type="date"
                  className="plan-input"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              {/* Passengers */}
              <div className="plan-field">
                <label className="plan-label" htmlFor="plan-pax">
                  <Users2 size={14} aria-hidden="true" /> Passengers
                </label>
                <select
                  id="plan-pax"
                  className="plan-select"
                  value={form.passengers}
                  onChange={e => setForm(p => ({ ...p, passengers: e.target.value }))}
                >
                  {["1", "2", "3", "4", "5", "6+"].map(n => (
                    <option key={n} value={n}>{n} {n === "1" ? "passenger" : "passengers"}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Accessibility */}
            <div className="plan-checkbox">
              <input
                type="checkbox"
                id="plan-access"
                checked={form.accessibility}
                onChange={e => setForm(p => ({ ...p, accessibility: e.target.checked }))}
              />
              <label htmlFor="plan-access">
                I have accessibility or mobility requirements
              </label>
            </div>

            {/* Interests */}
            <fieldset className="plan-interests">
              <legend className="plan-label">What interests you most?</legend>
              <div className="plan-interests__grid">
                {INTERESTS.map(interest => (
                  <label key={interest} className="plan-interest-chip">
                    <input
                      type="checkbox"
                      checked={form.interests.includes(interest)}
                      onChange={() => toggle(interest)}
                      className="sr-only"
                    />
                    <span className={form.interests.includes(interest) ? "active" : ""}>
                      {interest}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {legProblem && (
              <p className="plan-problem" role="alert">{legProblem}</p>
            )}
            <button type="submit" className="btn btn--primary btn--lg plan-submit" disabled={Boolean(legProblem)}>
              Build my journey <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
