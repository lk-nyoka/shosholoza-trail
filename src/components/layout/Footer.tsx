import { Link } from "react-router-dom";
import { TrainFront } from "lucide-react";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="st-footer" aria-label="Site footer">
      <div className="container st-footer__inner">
        <div className="st-footer__brand">
          <span className="st-footer__icon" aria-hidden="true"><TrainFront size={16} /></span>
          <span className="st-footer__wordmark"><b>Shosholoza</b> Trail</span>
        </div>
        <nav className="st-footer__links" aria-label="Footer navigation">
          <Link to="/trip">My Journey</Link>
          <Link to="/ride">The Ride</Link>
          <Link to="/journey">Route overview</Link>
          <Link to="/destinations">Destinations</Link>
          <Link to="/stories">Stories</Link>
          <Link to="/ai">AI Guide</Link>
          <Link to="/plan">Plan a trip</Link>
          <Link to="/app">Live GPS</Link>
          <Link to="/shosholoza">The song</Link>
          <Link to="/operator">Operator demo</Link>
          <Link to="/credits">Credits</Link>
          <Link to="/help">Before you board</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <p className="st-footer__legal">
          Rail geometry © OpenStreetMap contributors, ODbL 1.0.
          Map tiles © OpenStreetMap contributors.
          Photography via Wikimedia Commons — see{" "}
          <Link to="/credits">credits</Link> for attribution.
        </p>
        <p className="st-footer__copy">
          © {new Date().getFullYear()} Shosholoza Trail. Built for GKHack26.
        </p>
      </div>
    </footer>
  );
}
