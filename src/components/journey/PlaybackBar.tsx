import type { CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import type { Stop, PlaybackSpeed } from "../../types";
import { TOTAL_KM } from "../../lib/routeIndex";
import "./PlaybackBar.css";

const BASELINE_SPEED = 72;

function duration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rem = safe % 60;
  return hours ? `${hours}h ${String(rem).padStart(2, "0")}m` : `${rem}m`;
}

interface Props {
  km: number;
  next: Stop;
  playing: boolean;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onScrub: (km: number) => void;
  onSpeed: (s: PlaybackSpeed) => void;
  liveTracking?: boolean;
}

const SPEEDS: PlaybackSpeed[] = [1, 4, 12];

export default function PlaybackBar({ km, next, playing, speed, onPlay, onScrub, onSpeed, liveTracking = false }: Props) {
  const elapsed = duration((km / BASELINE_SPEED) * 60);
  const toNext = Math.max(0, Math.round(next.km - km));
  const progress = (km / TOTAL_KM) * 100;

  return (
    <section className="playback-bar" aria-label="Journey playback controls">
      <button
        className="playback-bar__play"
        onClick={onPlay}
        aria-label={playing ? "Pause journey" : "Play journey"}
      >
        {playing
          ? <Pause size={20} aria-hidden="true" />
          : <Play size={20} fill="currentColor" aria-hidden="true" />
        }
      </button>

      <div className="playback-bar__route">
        <div className="playback-bar__meta">
          <span><b>{Math.round(km).toLocaleString()} km</b> travelled</span>
          <span className="playback-bar__meta-center">{elapsed} elapsed</span>
          <span className="playback-bar__meta-right">{next.name} in {toNext} km</span>
        </div>
        <input
          className="playback-bar__scrubber"
          type="range"
          min={0}
          max={TOTAL_KM}
          step={0.1}
          value={km}
          disabled={liveTracking}
          aria-label="Journey progress"
          onChange={e => onScrub(Number(e.target.value))}
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />
      </div>

      {!liveTracking && (
        <div className="playback-bar__speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={s === speed ? "active" : ""}
              onClick={() => onSpeed(s)}
              aria-pressed={s === speed}
            >
              {s}×
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
