import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { stops } from "../../data";
import { durationLabel, scheduleLabel, scheduledMinutesBetween } from "../../lib/timetable";
import type { Trip } from "../../lib/trip";
import "./TripSetup.css";

interface Props {
  initial: Trip | null;
  onSave: (trip: Trip) => void;
  onClose: () => void;
}

/**
 * Two questions, asked once. Everything the app shows afterwards is the answer
 * to them.
 */
export default function TripSetup({ initial, onSave, onClose }: Props) {
  const [boardId, setBoardId]   = useState(initial?.boardId ?? stops[0].id);
  const [alightId, setAlightId] = useState(initial?.alightId ?? stops[stops.length - 1].id);

  const boardIndex  = stops.findIndex(s => s.id === boardId);
  const alightIndex = stops.findIndex(s => s.id === alightId);
  const valid = alightIndex > boardIndex;

  const minutes = valid ? scheduledMinutesBetween(boardId, alightId) : null;

  return (
    <div className="trip-scrim" role="dialog" aria-modal="true" aria-labelledby="trip-title">
      <div className="trip">
        <button className="trip__close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>

        <h2 id="trip-title" className="trip__title">Which part of the line is yours?</h2>
        <p className="trip__lede">
          The journey runs {stops.length} stops over a night and two days. Tell us your leg and
          the app follows yours instead of the whole line.
        </p>

        <div className="trip__fields">
          <label className="trip__field">
            <span>I board at</span>
            <select value={boardId} onChange={e => setBoardId(e.target.value)} id="trip-board">
              {stops.map(stop => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}{scheduleLabel(stop.id) ? ` — ${scheduleLabel(stop.id)}` : ""}
                </option>
              ))}
            </select>
          </label>

          <span className="trip__arrow" aria-hidden="true"><ArrowRight size={16} /></span>

          <label className="trip__field">
            <span>I get off at</span>
            <select value={alightId} onChange={e => setAlightId(e.target.value)} id="trip-alight">
              {stops.map(stop => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}{scheduleLabel(stop.id) ? ` — ${scheduleLabel(stop.id)}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {valid ? (
          <p className="trip__summary">
            {stops[boardIndex].name} to {stops[alightIndex].name}
            {minutes ? <> · scheduled <b>{durationLabel(minutes)}</b> on the train</> : null}
            {" "}· {Math.max(0, alightIndex - boardIndex - 1)} stop{alightIndex - boardIndex - 1 === 1 ? "" : "s"} along the way
          </p>
        ) : (
          <p className="trip__summary trip__summary--warn">
            Choose a stop further down the line than where you board.
          </p>
        )}

        <div className="trip__actions">
          <button
            className="btn btn--primary"
            disabled={!valid}
            onClick={() => onSave({ boardId, alightId })}
          >
            Save my trip
          </button>
          <button className="btn btn--outline" onClick={onClose}>Show me the whole line</button>
        </div>

        <p className="trip__foot">
          Times are the published schedule, not live running times. Kept on this device only.
        </p>
      </div>
    </div>
  );
}
