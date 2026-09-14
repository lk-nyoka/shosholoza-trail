import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTE_KM_LABEL, stopHero } from "../data";
import "./Stories.css";

interface Story {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  readTime: string;
  image: string;
  stop: string;
  featured?: boolean;
}

const STORIES: Story[] = [
  {
    id: "karoo-silence",
    title: "The Silence of the Karoo",
    subtitle: "Between De Aar and Beaufort West, the landscape becomes the story.",
    author: "Thabo Mokoena",
    readTime: "6 min read",
    image: stopHero("de-aar"),
    stop: "De Aar",
    featured: true,
  },
  {
    id: "diamond-dust",
    title: "Diamond Dust",
    subtitle: "Kimberley's Big Hole is a wound in the earth that made an empire — and broke one.",
    author: "Liezel van der Berg",
    readTime: "8 min read",
    image: stopHero("kimberley"),
    stop: "Kimberley",
  },
  {
    id: "milner-frozen",
    title: "Matjiesfontein: Frozen at 1890",
    subtitle: "One street, one hotel, one improbable act of Victorian preservation.",
    author: "Siya Dlamini",
    readTime: "5 min read",
    image: stopHero("matjies"),
    stop: "Matjiesfontein",
  },
  {
    id: "pretoria-jacaranda",
    title: "Pretoria in October",
    subtitle: "The jacaranda bloom is the city's annual argument for staying a little longer.",
    author: "Amira Osman",
    readTime: "4 min read",
    image: stopHero("pretoria"),
    stop: "Pretoria",
  },
  {
    id: "cape-town-mountain",
    title: "The Mountain Always in View",
    subtitle: "Cape Town's defining relationship with the flat-topped summit that watches everything.",
    author: "Marcus Johnson",
    readTime: "7 min read",
    image: stopHero("cape-town"),
    stop: "Cape Town",
  },
  {
    id: "johannesburg-maboneng",
    title: "Maboneng After Dark",
    subtitle: "The arts precinct that refused to let Johannesburg forget what it used to be.",
    author: "Fatima Jacobs",
    readTime: "5 min read",
    image: stopHero("johannesburg"),
    stop: "Johannesburg",
  },
];

export default function Stories() {
  const [featured, ...rest] = STORIES;

  return (
    <div className="stories-page">
      <div className="container">
        <header className="stories-header section">
          <p className="t-eyebrow">Stories</p>
          <h1 className="t-display t-display--lg stories-header__heading">
            Long reads from<br />the corridor.
          </h1>
          <p className="t-body stories-header__sub">
            Original writing from the communities, landscapes and histories along the
            {ROUTE_KM_LABEL}&nbsp;km between Pretoria and Cape Town.
          </p>
          <p className="stories-header__song">
            <Link to="/shosholoza">The song this line is named after →</Link>
          </p>
          <p className="stories-header__note">
            <b>Sample set.</b> These six show the format and the stops they attach to.
            The written pieces come from local historians, cultural custodians and
            residents, paid per verified story — contributor onboarding is open.
          </p>
        </header>

        {/* Featured */}
        <article className="stories-featured" aria-label="Featured story">
          <div className="stories-featured__image">
            <img
              src={featured.image}
              alt={`${featured.stop} — ${featured.title}`}
              loading="eager"
              width={800} height={500}
            />
            <span className="stories-featured__stop t-eyebrow">{featured.stop}</span>
          </div>
          <div className="stories-featured__body">
            <h2 className="t-display t-display--md stories-featured__title">
              {featured.title}
            </h2>
            <p className="t-body stories-featured__subtitle">{featured.subtitle}</p>
            <div className="stories-featured__meta">
              <span className="stories-author">{featured.author}</span>
              <span className="stories-time">
                <Clock size={12} aria-hidden="true" /> {featured.readTime}
              </span>
            </div>
            <span className="stories-pending" aria-label={`${featured.title} — story in production`}>
              Story in production
            </span>
          </div>
        </article>

        {/* Grid */}
        <section className="section--sm" aria-labelledby="more-stories">
          <h2 id="more-stories" className="t-heading t-heading--lg stories-grid-heading">
            More from the line
          </h2>
          <div className="stories-grid">
            {rest.map(story => (
              <article key={story.id} className="story-card">
                <div className="story-card__image-wrap">
                  <img
                    src={story.image}
                    alt={`${story.stop} — ${story.title}`}
                    loading="lazy"
                    width={600} height={380}
                  />
                  <span className="story-card__stop t-eyebrow">{story.stop}</span>
                </div>
                <div className="story-card__body">
                  <h3 className="t-heading t-heading--md story-card__title">{story.title}</h3>
                  <p className="t-body--sm story-card__subtitle">{story.subtitle}</p>
                  <div className="story-card__meta">
                    <span className="stories-author">{story.author}</span>
                    <span className="stories-time">
                      <Clock size={11} aria-hidden="true" /> {story.readTime}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
