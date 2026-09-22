import { stops } from "../data";
import { HERO, shotsFor } from "../data/gallery";
import "./Credits.css";

interface Credit {
  title: string;
  author: string;
  platform: string;
  url: string;
  usedFor: string;
}

/**
 * Generated from the photographs the app actually uses, so a picture can never
 * be shown without appearing here. Each links to its Commons file page, where
 * the photographer and licence are recorded.
 */
const PHOTO_CREDITS: Credit[] = (() => {
  const seen = new Set<string>([HERO.file]);
  const rows: Credit[] = [{
    title: HERO.caption,
    author: "Named on the file page",
    platform: "Wikimedia Commons",
    url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(HERO.file.replace(/ /g, "_"))}`,
    usedFor: "Homepage",
  }];
  for (const stop of stops) {
    for (const shot of shotsFor(stop.id)) {
      if (seen.has(shot.file)) continue;
      seen.add(shot.file);
      rows.push({
        title: shot.caption,
        author: "Named on the file page",
        platform: "Wikimedia Commons",
        url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(shot.file.replace(/ /g, "_"))}`,
        usedFor: stop.name,
      });
    }
  }
  return rows;
})();

const DATA_CREDITS = [
  {
    name: "OpenStreetMap",
    description: "Railway geometry derived from OpenStreetMap railway=rail ways via the Overpass API.",
    license: "Open Database License (ODbL) 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "OpenStreetMap — mapped places",
    description: "Shops, cafés, banks, museums and memorials near each station, collected from the Overpass API in September 2026.",
    license: "Open Database License (ODbL) 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "OpenStreetMap Tile Servers",
    description: "Map tile imagery rendered by the OpenStreetMap tile infrastructure.",
    license: "© OpenStreetMap contributors",
    url: "https://operations.osmfoundation.org/policies/tiles/",
  },
];

export default function Credits() {
  return (
    <div className="credits-page">
      <div className="container">
        <header className="section credits-header">
          <p className="t-eyebrow">Credits</p>
          <h1 className="t-display t-display--lg credits-header__heading">
            Photography &{" "}<br />data attribution.
          </h1>
          <p className="t-body credits-header__sub">
            Photographs of the towns along the route come from Wikimedia Commons, the
            railway geometry from OpenStreetMap. We are grateful to every contributor.
          </p>
        </header>

        {/* Photography */}
        <section className="credits-section" aria-labelledby="photo-credits">
          <h2 id="photo-credits" className="t-heading t-heading--lg credits-section__heading">
            Photography
          </h2>
          <p className="credits-note">
            Photographs of places along the route come from{" "}
            <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>,
            each under the licence stated on its file page, where the photographer is
            named. Follow each source link before reusing an image commercially.
          </p>
          <div className="credits-table" role="table" aria-label="Photography credits">
            <div className="credits-table__head" role="row" aria-hidden="true">
              <span>Image</span>
              <span>Photographer</span>
              <span>Used for</span>
              <span>Source</span>
            </div>
            {PHOTO_CREDITS.map((credit, i) => (
              <div key={i} className="credits-table__row" role="row">
                <span className="credits-table__title" role="cell">{credit.title}</span>
                <span role="cell">{credit.author}</span>
                <span role="cell">{credit.usedFor}</span>
                <span role="cell">
                  <a href={credit.url} target="_blank" rel="noopener noreferrer">
                    {credit.platform} ↗
                  </a>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Data */}
        <section className="credits-section" aria-labelledby="data-credits">
          <h2 id="data-credits" className="t-heading t-heading--lg credits-section__heading">
            Data &amp; Map
          </h2>
          <div className="credits-data-grid">
            {DATA_CREDITS.map((d, i) => (
              <div key={i} className="credits-data-card">
                <h3 className="t-heading t-heading--md credits-data-card__name">{d.name}</h3>
                <p className="t-body--sm credits-data-card__desc">{d.description}</p>
                <p className="credits-data-card__license">{d.license}</p>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="credits-data-card__link">
                  View licence ↗
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* App */}
        <section className="credits-section section--sm" aria-labelledby="app-credits">
          <h2 id="app-credits" className="t-heading t-heading--lg credits-section__heading">
            Application
          </h2>
          <p className="t-body">
            Shosholoza Trail was built for GKHack26 using React, TypeScript, Vite and
            Three.js. It runs entirely in your browser — there is no server behind it, and
            nothing you enter leaves this device. Icons by{" "}
            <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer">Lucide</a>.
            Typography: Fraunces and Outfit via Google Fonts.
          </p>
          <p className="credits-build">
            Build <code>{__BUILD_ID__}</code> · if you are reporting something that looks
            wrong, quote this — it says exactly which version you are on.
          </p>
        </section>
      </div>
    </div>
  );
}
