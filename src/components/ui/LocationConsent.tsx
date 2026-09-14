import { Link } from "react-router-dom";
import { MapPin, X } from "lucide-react";
import "./LocationConsent.css";

interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Shown once, before the first GPS read, and never again unless the passenger
 * clears it from the privacy page. Plain language, in the order a passenger
 * cares about: what is taken, what it is for, what is not done with it.
 */
export default function LocationConsent({ onAccept, onDecline }: Props) {
  return (
    <div className="consent-scrim" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="consent">
        <button className="consent__close" onClick={onDecline} aria-label="Close without sharing location">
          <X size={16} aria-hidden="true" />
        </button>

        <span className="consent__icon" aria-hidden="true"><MapPin size={18} /></span>
        <h2 id="consent-title" className="consent__title">Before we use your location</h2>

        <p className="consent__lede">
          Shosholoza Trail can follow your position along the line so stories, stops and
          nearby places appear as you actually reach them.
        </p>

        <dl className="consent__list">
          <div>
            <dt>What we read</dt>
            <dd>Your GPS position, accuracy and speed — only while you have the journey open.</dd>
          </div>
          <div>
            <dt>What it is used for</dt>
            <dd>Placing you on the route, working out arrival times, and showing what is near you.</dd>
          </div>
          <div>
            <dt>What we do not do</dt>
            <dd>
              We do not show your position to other passengers, do not keep a history of where
              you have been, and do not sell or share it.
            </dd>
          </div>
          <div>
            <dt>Changing your mind</dt>
            <dd>Stop tracking at any time. You can withdraw this permission on the privacy page.</dd>
          </div>
        </dl>

        <div className="consent__actions">
          <button className="btn btn--primary" onClick={onAccept}>Use my location</button>
          <button className="btn btn--outline" onClick={onDecline}>Not now</button>
        </div>

        <p className="consent__foot">
          The journey works without location — it simply plays the route instead of following you.{" "}
          <Link to="/privacy">How we handle your data</Link>
        </p>
      </div>
    </div>
  );
}
