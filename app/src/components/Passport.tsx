// The Rail Passport: a stamp slot per stop, stamped when its chapter is finished.
import { Link } from 'react-router-dom';
import { STOPS } from '../data';
import { SiteHeader } from './SiteHeader';
import { MobileTabBar } from './MobileTabBar';
import { chapterPath, useStamps } from './JourneyHub';

const dateFormat = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

export function Passport() {
  const stamps = useStamps();
  const byId = new Map(stamps.map(stamp => [stamp.id, stamp]));
  return <div className="page light-page">
    <SiteHeader />
    <main className="content-page passport-page">
      <p className="eyebrow gold-dark">Rail Passport</p>
      <h1>{stamps.length ? `${stamps.length} of 8 stamps collected.` : 'Your passport is waiting.'}</h1>
      <p className="intro">Each chapter stamps this page when you reach the end of its story. It is kept in this browser only.</p>
      <ol className="passport-book">{STOPS.map((stop, index) => {
        const stamp = byId.get(stop.id);
        const path = chapterPath(stop.id);
        return <li key={stop.id} data-stamped={Boolean(stamp)}>
          <div className="passport-seal" aria-hidden="true"><span>{stop.name}</span><small>{stamp ? '✓' : String(index + 1).padStart(2, '0')}</small></div>
          <div>
            <h2>{stop.name}</h2>
            <p>{stamp ? `Stamped ${dateFormat.format(new Date(stamp.at))}` : path ? 'Not yet stamped' : 'Chapter coming soon'}</p>
            {!stamp && path && <a href={path}>Ride this chapter →</a>}
          </div>
        </li>;
      })}</ol>
      <p><Link className="text-link" to="/chapters">Back to the journey</Link></p>
    </main>
    <MobileTabBar />
  </div>;
}
