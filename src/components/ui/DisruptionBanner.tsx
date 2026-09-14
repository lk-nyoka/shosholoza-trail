import { Bus, X } from "lucide-react";
import type { Disruption } from "../../types";
import "./DisruptionBanner.css";

interface Props {
  disruption: Disruption | null;
  demo?: boolean;
  onDismiss?: () => void;
}

const DEMO_DISRUPTION: Disruption = {
  id: 0,
  kind: "shuttle",
  start_km: 1020,
  end_km: 1080,
  title: "Interim shuttle activated",
  message:
    "Continue to Coach Bay B. The Cape Town connection departs in 18 minutes; platform staff are available to assist.",
  shuttle_stop: "Beaufort West",
  shuttle_departure: null,
};

export default function DisruptionBanner({ disruption, demo = false, onDismiss }: Props) {
  const d = disruption ?? (demo ? DEMO_DISRUPTION : null);
  if (!d) return null;
  return (
    <div className="disruption-banner" role="status" aria-live="assertive">
      <span className="disruption-banner__icon" aria-hidden="true">
        <Bus size={18} />
      </span>
      <div className="disruption-banner__body">
        {d.shuttle_stop && (
          <small className="t-eyebrow disruption-banner__eyebrow">
            Service recovery · {d.shuttle_stop}
          </small>
        )}
        <h3 className="disruption-banner__title">{d.title}</h3>
        <p className="disruption-banner__msg">{d.message}</p>
      </div>
      {onDismiss && (
        <button
          className="disruption-banner__close"
          onClick={onDismiss}
          aria-label="Dismiss disruption notice"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
