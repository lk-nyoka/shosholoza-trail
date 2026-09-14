import { useState } from "react";
import { Clock, Footprints, Heart, MapPin, Star, Ticket } from "lucide-react";
import type { Place } from "../../types";
import { REACH_LABEL, reachOf } from "../../lib/timetable";
import {
  cancelReservation, PENDING_NOTE, requestReservation, reservationFor,
  setReservationState, STATE_LABEL, type Reservation,
} from "../../lib/reserve";
import "./PlaceCard.css";

interface Props {
  place: Place;
  saved: boolean;
  onToggleSave: (id: string) => void;
  /**
   * Present on the discovery page, where the passenger is deciding what they
   * can actually reach in the time the train is standing. Absent elsewhere, in
   * which case the card stays a plain listing.
   */
  window?: {
    stopId: string;
    stopName: string;
    stopMinutes: number;
    /** True where the passenger boards or alights: the whistle is not their problem. */
    unlimited?: boolean;
  };
}

export default function PlaceCard({ place, saved, onToggleSave, window: stopWindow }: Props) {
  const [reservation, setReservation] = useState<Reservation | null>(
    () => (stopWindow ? reservationFor(place.id) : null),
  );

  const measured = stopWindow ? reachOf(place.distance, stopWindow.stopMinutes) : null;
  const reach = stopWindow?.unlimited
    ? (measured?.reach === "platform" ? "platform" : "comfortable")
    : measured?.reach ?? "unknown";
  const walk = measured?.walk ?? null;
  const returnWalk = measured?.returnWalk ?? null;
  const needed = returnWalk === null ? null : returnWalk + 4;

  const canReserve = Boolean(stopWindow) && place.type === "vendor" && reach !== "unreachable";

  const reserve = () => {
    if (!stopWindow) return;
    setReservation(requestReservation({
      placeId: place.id, placeName: place.name,
      stopId: stopWindow.stopId, stopName: stopWindow.stopName,
    }));
  };

  /**
   * The vendor's half of the exchange needs a service that is not deployed yet,
   * so it is acted out here and labelled as a demonstration. The passenger's
   * half — the request, the code, the collection — is the real flow.
   */
  const simulateVendor = (state: "accepted" | "declined") => {
    if (!reservation) return;
    setReservationState(reservation.id, state);
    setReservation({ ...reservation, state });
  };

  const drop = () => {
    if (!reservation) return;
    cancelReservation(reservation.id);
    setReservation(null);
  };

  return (
    <article className="place-card" aria-label={`${place.name} — ${place.category}`}>
      <div className="place-card__image">
        <img
          src={place.image}
          alt={`${place.name} in ${place.category}`}
          loading="lazy"
          width={160}
          height={160}
        />
        <span className="place-card__distance" aria-label={`${place.distance} from station`}>
          <MapPin size={10} aria-hidden="true" />
          {place.distance}
        </span>
        <button
          className={["place-card__save", saved ? "place-card__save--saved" : ""].filter(Boolean).join(" ")}
          onClick={() => onToggleSave(place.id)}
          aria-label={`${saved ? "Remove" : "Save"} ${place.name}`}
          aria-pressed={saved}
          type="button"
        >
          <Heart size={13} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <div className="place-card__body">
        <div className="place-card__meta">
          <span className="place-card__category t-eyebrow">{place.category}</span>
          <span className="place-card__rating">
            <Star size={10} fill="currentColor" aria-hidden="true" />
            {place.rating.toFixed(1)}
          </span>
        </div>
        <h4 className="place-card__name">{place.name}</h4>
        <p className="place-card__blurb">{place.blurb}</p>
        {place.price && <span className="place-card__price">{place.price}</span>}

        {stopWindow && reach !== "unknown" && (
          <div className={`place-card__reach place-card__reach--${reach}`}>
            <span className="place-card__reach-label">{REACH_LABEL[reach]}</span>
            {reach !== "platform" && walk !== null && (
              <span className="place-card__reach-detail">
                <Footprints size={11} aria-hidden="true" />
                {walk} min each way
                <Clock size={11} aria-hidden="true" />
                {stopWindow.unlimited
                  ? "your own stop — take your time"
                  : reach === "unreachable"
                    ? `needs ${needed} min, you have ${stopWindow.stopMinutes}`
                    : `${needed} of your ${stopWindow.stopMinutes} min`}
              </span>
            )}
          </div>
        )}

        {canReserve && !reservation && (
          <button className="place-card__reserve" onClick={reserve} type="button">
            <Ticket size={12} aria-hidden="true" /> Reserve to collect
          </button>
        )}

        {reservation && (
          <div className="place-card__reservation">
            <div className="place-card__reservation-head">
              <b className={reservation.confirmed === false ? "place-card__code--pending" : undefined}>
                {reservation.code}
              </b>
              <span>
                {reservation.confirmed === false ? "Not sent yet" : STATE_LABEL[reservation.state]}
              </span>
            </div>
            {reservation.confirmed === false && (
              <p className="place-card__pending" role="status">{PENDING_NOTE}</p>
            )}
            {reservation.state === "requested" && (
              <>
                <p>Nothing is being prepared until the vendor accepts. Pay in person on collection.</p>
                <div className="place-card__sim" role="group" aria-label="Vendor response (demonstration)">
                  <small>Vendor side — demonstration</small>
                  <button onClick={() => simulateVendor("accepted")} type="button">Accept</button>
                  <button onClick={() => simulateVendor("declined")} type="button">Decline</button>
                </div>
              </>
            )}
            {reservation.state === "accepted" && (
              <p>Give this code at the counter at {reservation.stopName}. It expires when the train leaves.</p>
            )}
            {reservation.state === "declined" && (
              <p>They could not take it this time — nothing was prepared and nothing is owed.</p>
            )}
            <button className="place-card__drop" onClick={drop} type="button">Cancel</button>
          </div>
        )}
      </div>
    </article>
  );
}
