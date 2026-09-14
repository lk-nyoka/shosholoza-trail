import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Eye, LineChart, Lock, Store, Ticket } from "lucide-react";
import { stops } from "../data";
import { NEARBY } from "../data/nearby";
import { scheduleLabel } from "../lib/timetable";
import "./Operator.css";

/**
 * What a rail or tourism operator sees.
 *
 * The licensing tier is the primary revenue line in the business model, and
 * until now there was nothing behind it to point at. This is that screen.
 *
 * It is a demonstration and it says so on every view. The figures below are
 * generated from the route itself — number of stops, how many mapped places sit
 * near each one — so they are consistent and explainable rather than invented
 * numbers dressed up as a live feed. When the service exists these read from it
 * and nothing else about this page needs to change.
 */

const DEMO_EMAIL = "operator@demo.shosholozatrail.co.za";
const DEMO_PASSWORD = "demo";

/** Deterministic from the route, so the same stop always shows the same figure. */
function sampleEngagement(stopId: string, index: number) {
  const nearby = (NEARBY[stopId] ?? []).length;
  const seed = [...stopId].reduce((total, ch) => total + ch.charCodeAt(0), 0);
  const views = 180 + (seed % 90) + nearby * 14 + (8 - index) * 12;
  const saves = Math.round(views * (0.16 + ((seed % 7) / 100)));
  const reservations = Math.round(saves * (0.22 + ((seed % 5) / 100)));
  return { views, saves, reservations, nearby };
}

export default function Operator() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => stops.map((stop, i) => ({ stop, ...sampleEngagement(stop.id, i) })),
    [],
  );

  const totals = rows.reduce(
    (sum, r) => ({
      views: sum.views + r.views,
      saves: sum.saves + r.saves,
      reservations: sum.reservations + r.reservations,
    }),
    { views: 0, saves: 0, reservations: 0 },
  );

  /** 12% of an average basket, the mid-point of the published commission band. */
  const commission = Math.round(totals.reservations * 148 * 0.12);
  const busiest = [...rows].sort((a, b) => b.views - a.views).slice(0, 4);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      setSignedIn(true);
      setError(null);
    } else {
      setError("Use the demonstration details shown below the form.");
    }
  };

  if (!signedIn) {
    return (
      <div className="op-gate">
        <form className="op-card" onSubmit={submit}>
          <span className="op-card__icon" aria-hidden="true"><Lock size={18} /></span>
          <h1 className="op-card__title">Operator sign-in</h1>
          <p className="op-card__lede">
            Route management and passenger engagement for operators licensing the platform.
          </p>

          <label className="op-field">
            <span>Email</span>
            <input
              id="op-email" type="email" value={email} autoComplete="username"
              onChange={e => setEmail(e.target.value)} placeholder={DEMO_EMAIL}
            />
          </label>
          <label className="op-field">
            <span>Password</span>
            <input
              id="op-password" type="password" value={password} autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="op-error">{error}</p>}

          <button className="btn btn--primary" type="submit">Sign in</button>

          <p className="op-card__demo">
            <b>Demonstration only.</b> There is no operator account system yet and nothing here
            is checked against a server. Sign in with <code>{DEMO_EMAIL}</code> and the password{" "}
            <code>{DEMO_PASSWORD}</code> to see the screen.
          </p>
          <Link to="/" className="op-card__back">Back to the journey</Link>
        </form>
      </div>
    );
  }

  return (
    <div className="op-page">
      <div className="container op-inner">
        <p className="op-banner">
          <Eye size={13} aria-hidden="true" />
          <b>Sample data.</b> Every figure on this page is generated from the route for
          demonstration. No passenger has been counted and no money has changed hands.
        </p>

        <header className="op-head">
          <div>
            <p className="t-eyebrow">Shosholoza Meyl · pilot</p>
            <h1 className="t-display t-display--md op-head__title">Pretoria → Cape Town</h1>
          </div>
          <button className="op-signout" onClick={() => setSignedIn(false)} type="button">
            Sign out
          </button>
        </header>

        <section className="op-figures" aria-label="This week">
          <div><dt>Journeys followed</dt><dd>{totals.views.toLocaleString()}</dd><small>passengers opening the route</small></div>
          <div><dt>Places saved</dt><dd>{totals.saves.toLocaleString()}</dd><small>attractions and vendors kept</small></div>
          <div><dt>Reservations</dt><dd>{totals.reservations.toLocaleString()}</dd><small>collected with a code</small></div>
          <div><dt>Commission</dt><dd>R{commission.toLocaleString()}</dd><small>12% of verified collections</small></div>
        </section>

        <section className="op-section" aria-labelledby="by-stop">
          <header className="op-section__head">
            <span className="op-section__icon" aria-hidden="true"><LineChart size={15} /></span>
            <h2 id="by-stop" className="t-heading t-heading--lg">Engagement by stop</h2>
          </header>
          <div className="op-table-wrap">
            <table className="op-table">
              <thead>
                <tr>
                  <th scope="col">Stop</th>
                  <th scope="col">Scheduled</th>
                  <th scope="col">Followed</th>
                  <th scope="col">Saved</th>
                  <th scope="col">Reserved</th>
                  <th scope="col">Listings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.stop.id}>
                    <th scope="row">{row.stop.name}</th>
                    <td>{scheduleLabel(row.stop.id) ?? "—"}</td>
                    <td>{row.views}</td>
                    <td>{row.saves}</td>
                    <td>{row.reservations}</td>
                    <td>{row.nearby}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="op-section" aria-labelledby="busiest">
          <header className="op-section__head">
            <span className="op-section__icon" aria-hidden="true"><Store size={15} /></span>
            <h2 id="busiest" className="t-heading t-heading--lg">Where the attention goes</h2>
          </header>
          <ul className="op-bars">
            {busiest.map(row => (
              <li key={row.stop.id}>
                <span className="op-bars__name">{row.stop.name}</span>
                <span className="op-bars__track" aria-hidden="true">
                  <span style={{ width: `${Math.round((row.views / busiest[0].views) * 100)}%` }} />
                </span>
                <span className="op-bars__value">{row.views}</span>
              </li>
            ))}
          </ul>
          <p className="op-note">
            Useful because it is not what an operator expects: the quiet stops in the Karoo hold
            attention longest, because there is nothing else to look at for hours.
          </p>
        </section>

        <section className="op-section" aria-labelledby="manage">
          <header className="op-section__head">
            <span className="op-section__icon" aria-hidden="true"><Building2 size={15} /></span>
            <h2 id="manage" className="t-heading t-heading--lg">Route management</h2>
          </header>
          <ul className="op-manage">
            <li>
              <b>Stops and timings</b>
              <span>Eight editorial stops, scheduled times from the published timetable.</span>
              <em>Read-only in this demonstration</em>
            </li>
            <li>
              <b>Vendor listings</b>
              <span>{Object.values(NEARBY).flat().length} mapped places along the corridor, awaiting vendor claims.</span>
              <em>Claiming needs the service</em>
            </li>
            <li>
              <b>Contributed content</b>
              <span>Stories and photographs submitted by communities, pending moderation.</span>
              <em>Queue needs the service</em>
            </li>
          </ul>
        </section>

        <footer className="op-foot">
          <Ticket size={13} aria-hidden="true" />
          Licensing runs from a single route to a fleet. Pilot access is free for the first
          window, in exchange for engagement data and a case study.
        </footer>
      </div>
    </div>
  );
}
