import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

// One name per thing, everywhere: Journey (the chapters), Map, Stops. The
// ride itself is always "Start Ride".
const LINKS: [string, string][] = [
  ['/chapters', 'Journey'],
  ['/journey', 'Map'],
  ['/destinations', 'Stops'],
  ['/stories', 'Stories'],
  ['/ai', 'AI Guide'],
  ['/plan', 'Plan'],
];

export function SiteHeader({ tone = 'light' }: { tone?: 'light' | 'onImage' }) {
  const [open, setOpen] = useState(false);
  const onImage = tone === 'onImage';
  return (
    <header className={'site-header ' + (onImage ? 'on-image' : 'light')}>
      <div className="nav-shell">
        <Link to="/" className="brand">
          <span className="brand-mark">ST</span>
          <span>Shosholoza Trail</span>
        </Link>
        <nav className="desktop-nav">
          {LINKS.map(([to, l]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l}
            </NavLink>
          ))}
          <Link className="start-pill" to="/animation">
            Start Ride
          </Link>
        </nav>
        <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="mobile-menu">
          {LINKS.map(([to, l]) => (
            <Link onClick={() => setOpen(false)} key={to} to={to}>
              {l}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
