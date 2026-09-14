import { useState, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { TrainFront, Menu, X } from "lucide-react";
import "./Nav.css";
import { DEMO } from "../../lib/demo";

/**
 * Ordered the way the journey is: your trip first, then the line, then what is
 * at the stops, then the reading and the practical page. The old map views
 * (/journey, /plan) still exist and are reachable from the footer — they do the
 * same job as The Ride and the setup flow, and two entries for one job is what
 * made this feel like a pile of tools rather than one app.
 */
const NAV_LINKS = [
  { to: "/",            label: "Home" },
  { to: "/trip",        label: "My Journey" },
  { to: "/ride",        label: "The Ride" },
  { to: "/destinations",label: "Stops" },
  { to: "/stories",     label: "Stories" },
  { to: "/shosholoza",  label: "The Song" },
  { to: "/ai",          label: "Guide" },
  { to: "/app",         label: "Live GPS" },
  { to: "/help",        label: "Before You Board" },
];

/** Pages with a full-bleed hero photo behind the nav */
const PHOTO_ROUTES = ["/", "/journey", "/ride", "/app"];

export default function Nav() {
  const { pathname } = useLocation();
  const [open, setOpen]         = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isPhoto = PHOTO_ROUTES.includes(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <header
        className={[
          "st-nav",
          isPhoto && !scrolled ? "st-nav--photo" : "st-nav--solid",
          scrolled ? "st-nav--scrolled" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Main navigation"
      >
        <div className="st-nav__inner container">
          {/* Brand */}
          <Link className="st-nav__brand" to="/" aria-label="Shosholoza Trail home">
            <span className="st-nav__icon" aria-hidden="true"><TrainFront size={17} /></span>
            <span className="st-nav__wordmark">
              <b>Shosholoza</b> Trail
            </span>
          </Link>

          {/* Nobody watching a demonstration should have to wonder. */}
          {DEMO && (
            <span className="st-nav__demo" title="Prepared demonstration — positions and figures are simulated">
              Demo
            </span>
          )}

          {/* Desktop links */}
          <nav className="st-nav__links" aria-label="Site pages">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  ["st-nav__link", isActive ? "st-nav__link--active" : ""].filter(Boolean).join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* CTA + hamburger */}
          <div className="st-nav__actions">
            <Link to="/start" className="btn btn--primary btn--sm st-nav__cta">
              Start Journey
            </Link>
            <button
              className="st-nav__burger"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(v => !v)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        id="mobile-menu"
        className={["st-mobile-menu", open ? "st-mobile-menu--open" : ""].filter(Boolean).join(" ")}
        aria-hidden={!open}
      >
        <div className="st-mobile-menu__inner">
          <nav aria-label="Mobile navigation">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  ["st-mobile-link", isActive ? "st-mobile-link--active" : ""].filter(Boolean).join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <Link to="/start" className="btn btn--primary" style={{ marginTop: 24, width: "100%", justifyContent: "center" }}>
            Start Journey
          </Link>
        </div>
      </div>
      {open && (
        <div
          className="st-mobile-overlay"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
