import { Link } from "react-router-dom";
import { useEffect } from "react";
import "./NotFound.css";

/**
 * A wrong address used to bounce silently to the home page, which reads as
 * "the app is broken" rather than "that page does not exist". Netlify serves
 * the app shell for every unknown path, so the HTTP status is still 200 and
 * always will be without a server - but the page itself can at least tell the
 * truth, keep itself out of the index, and point somewhere useful.
 */
export default function NotFound() {
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex";
    document.head.appendChild(tag);
    const title = document.title;
    document.title = "Page not found — Shosholoza Trail";
    return () => {
      tag.remove();
      document.title = title;
    };
  }, []);

  return (
    <div className="page nf">
      <div className="nf__inner">
        <p className="nf__eyebrow">Page not found</p>
        <h1 className="t-display t-display--md">
          There is no stop at this address.
        </h1>
        <p className="t-body nf__body">
          The link may be old, or mistyped. Everything on the line is reachable
          from the places below.
        </p>
        <nav className="nf__links" aria-label="Main destinations">
          <Link to="/" className="nf__link">Home</Link>
          <Link to="/trip" className="nf__link">Your journey</Link>
          <Link to="/destinations" className="nf__link">Stops &amp; places</Link>
          <Link to="/ride" className="nf__link">Ride the line</Link>
          <Link to="/help" className="nf__link">Before you board</Link>
        </nav>
      </div>
    </div>
  );
}
