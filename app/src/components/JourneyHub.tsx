// The Journey page: one place that shows the whole trail as a sequence of
// chapters - where you are, what you have finished, and what comes next.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Stamp as StampIcon } from 'lucide-react';
import { STOPS } from '../data';
import { chapters } from '../journey/ChapterNavigation';
import { readStamps, lastOpenedChapter, type Stamp } from '../journey/passport';
import { SiteHeader } from './SiteHeader';
import { MobileTabBar } from './MobileTabBar';

/** Stamps, re-read when a chapter awards one in another tab or this one. */
export function useStamps() {
  const [stamps, setStamps] = useState<Stamp[]>(() => readStamps());
  useEffect(() => {
    const refresh = () => setStamps(readStamps());
    addEventListener('storage', refresh);
    addEventListener('shosholoza:passport', refresh);
    return () => { removeEventListener('storage', refresh); removeEventListener('shosholoza:passport', refresh); };
  }, []);
  return stamps;
}

/** A chapter's own page, or null while it is still being built. */
export const chapterPath = (id: string) => chapters.find(chapter => chapter.id === id)?.path ?? null;

/** Plain links, since most chapters are standalone pages outside the router. */
function ChapterLink({ id, className, children, label }: { id: string; className?: string; children: React.ReactNode; label?: string }) {
  const path = chapterPath(id);
  if (!path) return <span className={className} aria-disabled="true" aria-label={label}>{children}</span>;
  return <a className={className} href={path} aria-label={label}>{children}</a>;
}

/** The trail as a line of eight stops: finished, current and still to come. */
export function JourneyRail({ current, stamps }: { current: string | null; stamps: Stamp[] }) {
  const done = new Set(stamps.map(stamp => stamp.id));
  const currentIndex = Math.max(0, STOPS.findIndex(stop => stop.id === current));
  return <nav className="journey-rail" aria-label="The journey, stop by stop">
    <div className="journey-rail-line" aria-hidden="true"><span style={{ width: `${(currentIndex / (STOPS.length - 1)) * 100}%` }} /><i className="journey-rail-train" style={{ left: `${(currentIndex / (STOPS.length - 1)) * 100}%` }} /></div>
    <ol>{STOPS.map((stop, index) => {
      const state = done.has(stop.id) ? 'done' : stop.id === current ? 'current' : chapterPath(stop.id) ? 'open' : 'soon';
      return <li key={stop.id} data-state={state}>
        <ChapterLink id={stop.id} className="journey-rail-stop" label={`${index + 1}. ${stop.name}${state === 'done' ? ', stamp collected' : state === 'soon' ? ', chapter coming soon' : ''}`}>
          <b>{done.has(stop.id) ? '✓' : String(index + 1).padStart(2, '0')}</b>
          <span>{stop.name}</span><small>{stop.km} km</small>
        </ChapterLink>
      </li>;
    })}</ol>
  </nav>;
}

export function JourneyHub() {
  const stamps = useStamps();
  const done = new Set(stamps.map(stamp => stamp.id));
  const last = lastOpenedChapter();
  // Resume where they were; otherwise the first chapter not yet finished.
  const resume = STOPS.find(stop => stop.id === last && !done.has(stop.id) && chapterPath(stop.id))
    ?? STOPS.find(stop => !done.has(stop.id) && chapterPath(stop.id)) ?? STOPS[0];
  const resumeIndex = STOPS.indexOf(resume);
  const started = Boolean(last) || stamps.length > 0;
  return <div className="page light-page">
    <SiteHeader />
    <main className="content-page journey-hub">
      <p className="eyebrow gold-dark">The journey</p>
      <h1>Eight chapters, Pretoria to the sea.</h1>
      <p className="intro">Each stop is its own interactive chapter. Ride them in order, or jump to any one; finishing a chapter stamps your Rail Passport.</p>
      <p><Link className="primary-btn" to="/animation">Start the 3D journey <ArrowRight /></Link></p>
      <JourneyRail current={resume.id} stamps={stamps} />
      <section className="journey-resume">
        <img src={resume.image} alt="" />
        <div>
          <p className="eyebrow">{started ? 'Continue where you left off' : 'Start at the beginning'} · Chapter {resumeIndex + 1} of 8</p>
          <h2>{resume.name}</h2>
          <p>{resume.teaser}</p>
          <ChapterLink id={resume.id} className="primary-btn">{started ? 'Continue' : 'Start Ride'} <ArrowRight /></ChapterLink>
        </div>
      </section>
      <h2 className="journey-hub-title">All chapters</h2>
      <ol className="journey-chapters">{STOPS.map((stop, index) => {
        const status = done.has(stop.id) ? 'Completed' : stop.id === last ? 'In progress' : chapterPath(stop.id) ? 'Not started' : 'Coming soon';
        return <li key={stop.id} data-status={status}>
          <ChapterLink id={stop.id} className="journey-chapter">
            <img src={stop.image} alt="" />
            <div>
              <p className="eyebrow">Chapter {index + 1} · {stop.km} km</p>
              <h3>{stop.name}</h3>
              <p>{stop.tagline}</p>
              <span className="chapter-status">{status === 'Completed' && <StampIcon aria-hidden="true" />}{status}</span>
            </div>
          </ChapterLink>
        </li>;
      })}</ol>
      <section className="dark-cta journey-passport-cta">
        <h2>Rail Passport · {stamps.length} of 8</h2>
        <p>Finish a chapter to collect its stamp. Your passport stays on this device.</p>
        <Link to="/passport">Open your passport</Link>
      </section>
    </main>
    <MobileTabBar />
  </div>;
}
