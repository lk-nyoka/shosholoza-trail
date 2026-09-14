import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { ROUTE_KM_LABEL, stops, stopHero } from "../data";
import { HERO, shotsFor } from "../data/gallery";
import { durationLabel, scheduledMinutesBetween } from "../lib/timetable";
import "./Home.css";

const HERO_IMG = HERO.url;

const STATS = [
  { value: ROUTE_KM_LABEL, label: "km Distance" },
  /**
   * The scheduled run, worked out from the timetable rather than typed. The
   * headline used to say 27 hrs while the boarding pass, using the same
   * timetable, said 28h 10m.
   */
  { value: durationLabel(scheduledMinutesBetween("pretoria", "cape-town") ?? 0), label: "Scheduled" },
  { value: "8", label: "Towns & cities" },
];

/** Real photographs of the towns — the opening shot of each town's gallery. */
const STOP_IMAGES: Record<string, string> = Object.fromEntries(
  stops.map((stop) => [stop.id, shotsFor(stop.id)[0]?.url ?? stopHero(stop.id)]),
);

export default function Home() {
  return (
    <div className="home">
      {/* ── Hero ─────────────────────────────────────── */}
      <section className="home-hero" aria-label="Journey introduction">
        <div
          className="home-hero__bg"
          style={{ backgroundImage: `url("${HERO_IMG}")` }}
          aria-hidden="true"
        />
        <div className="home-hero__overlay" aria-hidden="true" />

        <div className="container home-hero__content">
          <p className="t-eyebrow home-hero__eyebrow">
            Pretoria → Cape Town · 8 Stops
          </p>
          <h1 className="t-display t-display--xl home-hero__headline">
            The country goes<br />
            past<br />
            <em className="home-hero__italic">at window height.</em>
          </h1>
          <p className="home-hero__body">
            Shosholoza Trail turns the {ROUTE_KM_LABEL}&nbsp;km rail journey across
            South Africa into something you can watch unfold — with the stories,
            food and people of every town appearing exactly as you reach them.
          </p>
          <div className="home-hero__actions">
            <Link to="/start" className="btn btn--primary btn--lg">
              Start my journey
            </Link>
            <Link to="/ai" className="btn btn--outline btn--lg">
              Ask the AI Guide
            </Link>
          </div>
          <dl className="home-hero__stats">
            {STATS.map(({ value, label }) => (
              <div key={label} className="home-hero__stat">
                <dt className="home-hero__stat-value">{value}</dt>
                <dd className="home-hero__stat-label">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Scroll cue */}
        <div className="home-hero__scroll" aria-hidden="true">
          <span />
        </div>
      </section>

      {/* ── Editorial canvas ─────────────────────────── */}
      <div className="home-editorial">
        {/* The Line section */}
        <section className="section home-line" aria-labelledby="the-line-heading">
          <div className="container">
            <header className="section__header">
              <p className="t-eyebrow">The Line</p>
              <h2 className="t-display t-display--md home-line__heading" id="the-line-heading">
                Eight places that change the moment<br className="home-line__br" />
                you look out of the window.
              </h2>
            </header>

            <div className="home-stops">
              {stops.map((stop, i) => (
                <Link
                  key={stop.id}
                  to={`/destinations#${stop.id}`}
                  className="home-stop-card"
                  aria-label={`${stop.name} — ${stop.province}, ${stop.km} km`}
                >
                  <div className="home-stop-card__image">
                    <img
                      src={STOP_IMAGES[stop.id] ?? HERO_IMG}
                      alt={`${stop.name}, ${stop.province}`}
                      loading={i < 2 ? "eager" : "lazy"}
                      width={600}
                      height={400}
                    />
                    <span className="home-stop-card__km">
                      {stop.km === 0 ? "Origin" : `${stop.km.toLocaleString()} km`}
                    </span>
                  </div>
                  <div className="home-stop-card__body">
                    <p className="t-eyebrow home-stop-card__province">
                      {stop.province}
                    </p>
                    <h3 className="t-display t-display--sm home-stop-card__name">
                      {stop.name}
                    </h3>
                    <p className="home-stop-card__teaser">{stop.teaser}</p>
                    <span className="home-stop-card__cta">
                      Explore <ArrowRight size={13} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* AI Guide promo */}
        <section className="home-ai-promo" aria-labelledby="ai-promo-heading">
          <div className="container home-ai-promo__inner">
            <div className="home-ai-promo__copy">
              <p className="t-eyebrow">AI Guide</p>
              <h2
                className="t-display t-display--md home-ai-promo__heading"
                id="ai-promo-heading"
              >
                Every question answered<br />from the corridor itself.
              </h2>
              <p className="home-ai-promo__body">
                Ask about any stop, vendor or landscape. Every answer draws only
                from verified corridor content — no hallucinated opening hours or
                invented restaurants.
              </p>
              <Link to="/ai" className="btn btn--primary">
                <Sparkles size={15} aria-hidden="true" />
                Open AI Guide
              </Link>
            </div>
            <div className="home-ai-promo__visual" aria-hidden="true">
              <div className="home-ai-chat-mock">
                <div className="home-ai-chat-mock__bubble home-ai-chat-mock__bubble--user">
                  What should I eat in Matjiesfontein?
                </div>
                <div className="home-ai-chat-mock__bubble home-ai-chat-mock__bubble--ai">
                  The Coffee House beside the platform serves homemade bakes and
                  freshly brewed coffee — it's the only café on the single
                  preserved street. For a fuller meal, the Lord Milner Hotel
                  dining room is steps away.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Journey CTA strip */}
        <section className="home-journey-cta" aria-label="Start your journey">
          <div className="container home-journey-cta__inner">
            <div>
              <p className="t-eyebrow">Live Journey</p>
              <h2 className="t-display t-display--sm">Watch the route unfold.</h2>
            </div>
            <Link to="/journey" className="btn btn--primary btn--lg">
              Open Journey Map <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
