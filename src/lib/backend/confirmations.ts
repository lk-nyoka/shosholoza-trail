/**
 * A tiny notice board between the outbox and the things waiting on it.
 *
 * The outbox needs to tell reserve.ts that a code has come back from the
 * database, and reserve.ts needs to tell the outbox what to send. Having them
 * import each other works until a bundler decides otherwise, so they both talk
 * through here instead.
 */

export interface ReservationConfirmation {
  idempotencyKey: string;
  code: string;
  state: string;
}

type Listener = (confirmation: ReservationConfirmation) => void;

const listeners = new Set<Listener>();

export function onReservationConfirmed(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceReservation(confirmation: ReservationConfirmation): void {
  for (const listener of listeners) {
    try {
      listener(confirmation);
    } catch {
      /* one bad listener must not stop the rest */
    }
  }
}
