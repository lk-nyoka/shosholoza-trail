import { STAGE_TEXT, type RideStage } from "./TrainMap";
import "./RideBoot.css";

/**
 * What the rider looks at while the world is being built.
 *
 * Before this there was nothing: a black rectangle for several seconds on a
 * phone, which reads as a crash. The temptation is a progress bar, and a
 * progress bar here would be a lie — the app does not know how long the
 * elevation tiles will take on a train.
 *
 * So it says what it is actually doing, one stage at a time, and each line
 * appears when that piece of work really starts. A rider who watches "Reading
 * the ground" sit there for ten seconds has learned something true about
 * their signal.
 *
 * Two ways out when it fails, because there are two different failures. A bad
 * tile server wants a retry. A phone that cannot manage the full scene wants
 * the lightweight version, which skips the sharp imagery rings and is what
 * the low-data mode already does.
 */
export default function RideBoot({
  stage,
  onRetry,
  onLightweight,
}: {
  stage: RideStage;
  onRetry: () => void;
  onLightweight: () => void;
}) {
  if (stage.kind === "ready" || stage.kind === "landscape") return null;

  const failed = stage.kind === "failed";
  return (
    <div className={failed ? "ride-boot ride-boot--failed" : "ride-boot"} role="status" aria-live="polite">
      <div className="ride-boot__mark" aria-hidden="true">
        <span className="ride-boot__rail" />
        <span className="ride-boot__rail" />
        <span className="ride-boot__sleeper" />
      </div>
      <p className="ride-boot__title">Shosholoza Trail</p>
      <p className="ride-boot__stage">{STAGE_TEXT[stage.kind]}</p>
      {failed && (
        <>
          <p className="ride-boot__why">
            {stage.reason}. This usually means the map data could not be reached.
          </p>
          <div className="ride-boot__actions">
            <button type="button" className="ride-boot__btn" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="ride-boot__btn ride-boot__btn--quiet" onClick={onLightweight}>
              Use the lightweight view
            </button>
          </div>
        </>
      )}
    </div>
  );
}
