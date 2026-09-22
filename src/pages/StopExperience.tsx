import { ArrowLeft, ArrowRight, BookOpen, Camera, CircleHelp, MapPin, Store, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { stopHero, stops } from "../data";
import NotFound from "./NotFound";
import "./StopExperience.css";

const storyForStop: Record<string, { title: string; description: string }> = {
  kimberley: {
    title: "The Diamond Rush",
    description: "How a discovery changed Kimberley, the Northern Cape and the shape of modern South Africa.",
  },
  "de-aar": {
    title: "Junction in the Karoo",
    description: "A rail town built around the meeting point of lines, people and long distances.",
  },
  matjies: {
    title: "Frozen at 1890",
    description: "One street, one hotel and an improbable act of Victorian preservation.",
  },
};

export default function StopExperience() {
  const { stopId } = useParams();
  const stop = stops.find(candidate => candidate.id === stopId);
  if (!stop) return <NotFound />;
  const story = storyForStop[stop.id] ?? {
    title: `${stop.name}: a closer look`,
    description: stop.teaser,
  };
  const nextStop = stops.find(candidate => candidate.km > stop.km);

  return (
    <div className="stop-experience-page">
      <header className="stop-experience-hero">
        <img src={stopHero(stop.id)} alt={`${stop.name} route context`} />
        <div className="stop-experience-hero__shade" />
        <div className="container stop-experience-hero__content">
          <Link className="stop-experience-back" to="/destinations"><ArrowLeft size={15} /> All stops</Link>
          <p className="t-eyebrow">{stop.province} · stop {stops.indexOf(stop) + 1} of {stops.length}</p>
          <h1>{stop.name}</h1>
          <p>{stop.teaser}</p>
        </div>
      </header>

      <div className="container stop-experience-content">
        <nav className="stop-experience-tabs" aria-label="Stop experience sections">
          <a className="active" href="#overview">Overview</a>
          <a href="#stories">Stories</a>
          <a href="#vendors">Vendors</a>
        </nav>

        <section className="stop-experience-intro" id="overview">
          <div>
            <p className="t-eyebrow">Why this stop matters</p>
            <h2>A place worth arriving for.</h2>
            <p>{stop.name} sits {Math.round(stop.km).toLocaleString()} km along the Pretoria to Cape Town corridor. This stop hub gathers the stories, places and people that give the view meaning.</p>
          </div>
          <Link className="stop-experience-primary" to={`/ride?stop=${stop.id}`}>
            Follow the journey <ArrowRight size={15} />
          </Link>
        </section>

        <section className="stop-experience-grid" aria-label={`${stop.name} experiences`}>
          <article className="stop-experience-card stop-experience-card--story" id="stories">
            <div className="stop-experience-card__icon"><BookOpen size={18} /></div>
            <p className="t-eyebrow">Story</p>
            <h2>{story.title}</h2>
            <p>{story.description}</p>
            <Link to="/stories">Read stories <ArrowRight size={14} /></Link>
          </article>

          <article className="stop-experience-card stop-experience-card--quiz">
            <div className="stop-experience-card__icon"><CircleHelp size={18} /></div>
            <p className="t-eyebrow">Adventure</p>
            <h2>Take the {stop.name} quiz</h2>
            <p>Test what you noticed on the route and earn points for getting curious.</p>
            <Link to={`/ride?stop=${stop.id}`}>Start on the ride <ArrowRight size={14} /></Link>
          </article>

          <article className="stop-experience-card stop-experience-card--create">
            <div className="stop-experience-card__icon"><Camera size={18} /></div>
            <p className="t-eyebrow">Creative</p>
            <h2>Capture this place</h2>
            <p>Save a reflection, photograph or travel note from {stop.name} to your journey.</p>
            <Link to={`/ride?stop=${stop.id}`}>Open creative mode <ArrowRight size={14} /></Link>
          </article>

          <article className="stop-experience-card stop-experience-card--connect">
            <div className="stop-experience-card__icon"><Users size={18} /></div>
            <p className="t-eyebrow">Connect</p>
            <h2>Travellers nearby</h2>
            <p>See the people sharing this journey without exposing anyone's exact location.</p>
            <Link to="/app">See the journey feed <ArrowRight size={14} /></Link>
          </article>
        </section>

        <section className="stop-experience-vendors" id="vendors">
          <div className="stop-experience-section-heading">
            <div>
              <p className="t-eyebrow"><Store size={13} /> Local places</p>
              <h2>Spend time well.</h2>
            </div>
            <Link to={`/destinations#${stop.id}`}>View all places <ArrowRight size={14} /></Link>
          </div>
          <div className="stop-experience-place-list">
            {stop.places.slice(0, 3).map(place => (
              <article key={place.id} className="stop-experience-place">
                <img src={place.image} alt="" loading="lazy" />
                <div>
                  <strong>{place.name}</strong>
                  <span>{place.category} · {place.distance}</span>
                  <p>{place.blurb}</p>
                </div>
                <MapPin size={15} aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        {nextStop && (
          <p className="stop-experience-next">
            Next on the line: <Link to={`/stops/${nextStop.id}`}>{nextStop.name}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
