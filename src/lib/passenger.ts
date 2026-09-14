/**
 * The passenger's own record.
 *
 * Every travel app people already know — Trainline, Omio, an airline — is built
 * on the same spine: you say who you are and where you are going once, you are
 * given something that stands for your trip, and every screen afterwards is
 * about that trip rather than about the product. This app had all the parts and
 * none of that spine, so it read as a set of separate tools.
 *
 * There is no server yet, so there is no real account: this is a record kept on
 * the passenger's own device. It is deliberately shaped like the account it
 * will become — same fields, same reference — so that when the backend exists
 * the only thing that changes is where it is stored.
 */
import type { Trip } from "./trip";

const KEY = "st.passenger.v1";

export interface Passenger {
  /** What we call them on screen. Nothing else is required. */
  name: string;
  /** Optional, and only used to send a copy of a reservation. Never uploaded in this build. */
  contact?: string;
  trip: Trip;
  /** Stands in for a ticket reference until the operator issues real ones. */
  reference: string;
  createdAt: number;
}

const ALPHABET = "ACDEFHJKLMNPRTVWXY349";

function makeReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
  return `ST-${body.slice(0, 3)}-${body.slice(3)}`;
}

export function passenger(): Passenger | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Passenger;
    return parsed?.name && parsed?.trip?.boardId ? parsed : null;
  } catch {
    return null;
  }
}

export function createPassenger(input: { name: string; contact?: string; trip: Trip }): Passenger {
  const record: Passenger = {
    name: input.name.trim(),
    contact: input.contact?.trim() || undefined,
    trip: input.trip,
    reference: makeReference(),
    createdAt: Date.now(),
  };
  save(record);
  return record;
}

export function save(record: Passenger): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* The session continues; it simply will not be remembered. */
  }
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

export function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}
