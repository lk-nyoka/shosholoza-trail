/**
 * Reserve-and-collect.
 *
 * The app does not take payment. On this corridor the vendors are small — a
 * padstal, a platform café, a craft table — and asking them to onboard to a
 * payout system before a single passenger has bought anything is how a pilot
 * dies. So the passenger reserves, the vendor decides whether to prepare it,
 * and money changes hands in person the way it already does.
 *
 * The collection code is the point. It is what turns "someone said they'd come"
 * into a transaction both sides can verify, which is the thing a commission has
 * to be charged against. It is also what protects the vendor: nothing is
 * prepared until they accept, and an unclaimed code simply expires.
 *
 * A reservation is written to the device first and sent to the backend
 * afterwards, because the passenger is frequently somewhere with no signal at
 * the moment they press the button. Until the backend has answered, the code
 * shown is provisional and the card says so — a code this device invented is
 * not something a vendor could be expected to honour. The real code is issued
 * by the database, which is the only place that can guarantee it is unique and
 * can only be collected once.
 *
 * With no backend configured the app behaves exactly as it did before: the
 * reservation stays on the device, and the vendor's half is acted out and
 * labelled as a demonstration.
 */
import { enqueue, newKey } from "./backend/outbox";
import { onReservationConfirmed } from "./backend/confirmations";
import { backendConfigured } from "./backend/client";

export type ReservationState = "requested" | "accepted" | "declined" | "collected" | "expired";

export interface Reservation {
  id: string;
  /**
   * True once the database has issued the code. A provisional code is shown
   * greyed out with an explanation rather than presented as collectable.
   */
  confirmed?: boolean;
  /** The key that stops a retried send from creating a second reservation. */
  idempotencyKey?: string;
  placeId: string;
  placeName: string;
  stopId: string;
  stopName: string;
  code: string;
  state: ReservationState;
  requestedAt: number;
  note?: string;
}

const KEY = "st.reservations.v1";

/**
 * Short, readable over the noise of a station, and unambiguous when spoken:
 * no letters that sound alike and no digits that look like letters.
 */
const ALPHABET = "ACDEFHJKLMNPRTVWXY349";

function makeCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
  return `SZ-${body}`;
}

function readAll(): Reservation[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Reservation[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Reservation[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* best effort */
  }
}

export function reservations(): Reservation[] {
  return readAll().sort((a, b) => b.requestedAt - a.requestedAt);
}

export function reservationFor(placeId: string): Reservation | null {
  return readAll().find(r => r.placeId === placeId && r.state !== "expired" && r.state !== "declined") ?? null;
}

export function requestReservation(input: {
  placeId: string; placeName: string; stopId: string; stopName: string;
  note?: string;
}): Reservation {
  const idempotencyKey = newKey();
  const reservation: Reservation = {
    id: `${input.placeId}-${Date.now()}`,
    code: makeCode(),
    state: "requested",
    requestedAt: Date.now(),
    idempotencyKey,
    // With nowhere to send it, a device-local reservation is the whole story,
    // so there is nothing pending and nothing to apologise for.
    confirmed: !backendConfigured,
    ...input,
  };
  writeAll([...readAll().filter(r => r.placeId !== input.placeId), reservation]);

  if (backendConfigured) {
    enqueue({
      kind: "reservation",
      idempotencyKey,
      placeSlug: `ed:${input.placeId}`,
      note: input.note ?? null,
      serviceDate: new Date().toISOString().slice(0, 10),
    });
  }

  return reservation;
}

/**
 * The database has issued the real code. Swap it in, in place, so the
 * passenger's card stops saying "not yet confirmed" without them doing
 * anything.
 */
onReservationConfirmed(({ idempotencyKey, code, state }) => {
  writeAll(
    readAll().map(r =>
      r.idempotencyKey === idempotencyKey
        ? { ...r, code, state: state as ReservationState, confirmed: true }
        : r,
    ),
  );
});

export function setReservationState(id: string, state: ReservationState): void {
  writeAll(readAll().map(r => (r.id === id ? { ...r, state } : r)));
}

export function cancelReservation(id: string): void {
  writeAll(readAll().filter(r => r.id !== id));
}

export const STATE_LABEL: Record<ReservationState, string> = {
  requested: "Waiting for the vendor",
  accepted:  "Confirmed — collect with your code",
  declined:  "Vendor could not take it",
  collected: "Collected",
  expired:   "Expired",
};

/** What to show beneath the code while the backend has not answered yet. */
export const PENDING_NOTE =
  "Not sent yet — this code is provisional until your phone has signal again. " +
  "Don't rely on it at the counter.";
