/**
 * The passenger's own trip.
 *
 * The app used to show every passenger the whole Pretoria–Cape Town line
 * whether they were riding all of it or one leg of it, which is why it could
 * describe itself as "the right place at the right time" and still feel like it
 * was written for somebody else. Two taps fix that, and everything downstream —
 * which stops matter, how long is left, which merchants are worth showing —
 * follows from them.
 *
 * It lives on the passenger's own device first, always — the app must be able
 * to answer "which stops are mine" with the radio off. Where a backend is
 * configured the trip is also mirrored to it, so the passenger can pick the
 * journey up on another phone later. Nothing waits on that round trip.
 */
import { stops } from "../data";
import type { Stop } from "../types";
import { enqueue, newKey } from "./backend/outbox";
import { backendConfigured } from "./backend/client";
import { DEFAULT_STOP_MINUTES, type Direction } from "./corridor";

const KEY = "st.trip.v1";

export interface Trip {
  boardId: string;
  alightId: string;
  /**
   * The SAST calendar date the passenger boards, "YYYY-MM-DD".
   *
   * Optional on read: trips saved before the journey clock existed have no
   * date, and throwing those away would lose somebody's journey. They fall back
   * to today, which is what they were implicitly assuming anyway.
   */
  date?: string;
  /** Optional for the same reason. The published service is southbound. */
  direction?: Direction;
}

function read(): Trip | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Trip>;
    if (!parsed.boardId || !parsed.alightId) return null;
    if (!stops.some(s => s.id === parsed.boardId)) return null;
    if (!stops.some(s => s.id === parsed.alightId)) return null;
    return {
      boardId: parsed.boardId,
      alightId: parsed.alightId,
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date : undefined,
      direction: parsed.direction === "northbound" || parsed.direction === "southbound"
        ? parsed.direction : undefined,
    };
  } catch {
    return null;
  }
}

export function savedTrip(): Trip | null {
  return read();
}

export function saveTrip(trip: Trip): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trip));
  } catch {
    /* The trip still applies for this session; it just won't be remembered. */
  }

  if (backendConfigured) {
    enqueue({
      kind: "trip",
      idempotencyKey: newKey(),
      boardStop: trip.boardId,
      alightStop: trip.alightId,
      stopMinutes: DEFAULT_STOP_MINUTES,
    });
  }
}

export function clearTrip(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The stops on this passenger's leg, boarding and alighting included. */
export function tripStops(trip: Trip | null): Stop[] {
  if (!trip) return stops;
  const a = stops.findIndex(s => s.id === trip.boardId);
  const b = stops.findIndex(s => s.id === trip.alightId);
  if (a === -1 || b === -1) return stops;
  return a <= b ? stops.slice(a, b + 1) : stops.slice(b, a + 1);
}

export function tripBounds(trip: Trip | null): { fromKm: number; toKm: number } {
  const legs = tripStops(trip);
  return { fromKm: legs[0].km, toKm: legs[legs.length - 1].km };
}

export function onTrip(trip: Trip | null, stopId: string): boolean {
  return tripStops(trip).some(s => s.id === stopId);
}
