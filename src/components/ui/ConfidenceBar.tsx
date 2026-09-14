import type { Confidence } from "../../types";
import "./ConfidenceBar.css";

interface Props {
  value: Confidence;
}

const LEVELS: Confidence[] = ["none", "low", "medium", "high"];
const LABEL: Record<Confidence, string> = {
  none:   "Awaiting signal",
  low:    "Low confidence",
  medium: "Medium confidence",
  high:   "High confidence",
};

export default function ConfidenceBar({ value }: Props) {
  const active = LEVELS.indexOf(value);
  return (
    <div className="conf-bar" aria-label={`Telemetry confidence: ${value}`}>
      <span className="conf-bar__bars" aria-hidden="true">
        {LEVELS.map((level, i) => (
          <i
            key={level}
            className={["conf-bar__seg", i > 0 && i <= active ? "conf-bar__seg--on" : ""].filter(Boolean).join(" ")}
            style={{ height: `${(i + 1) * 4 + 2}px` }}
          />
        ))}
      </span>
      <small className="conf-bar__label t-body--xs">{LABEL[value]}</small>
    </div>
  );
}
