/**
 * The journey clock: what time it is on this train, for this passenger.
 *
 * The ride's temporal source of truth is the passenger's own itinerary, not the
 * device clock and not the position of a slider. If the timetable says the
 * train leaves Pretoria at 08:30, the ride begins at 08:30 and the sky is an
 * 08:30 sky. If the passenger boards at Kimberley, the ride begins at
 * Kimberley, at Kimberley's scheduled time, with zero kilometres travelled —
 * the Pretoria-to-Kimberley section is context on the map, not something they
 * have to sit through.
 *
 * Three rules that the rest of the app depends on:
 *
 *   TIME IS AN INSTANT, NEVER AN HOUR. Everything here is a real `Date`.
 *   Working in bare hours is what makes a journey break at midnight, and this
 *   journey crosses midnight every single time it runs.
 *
 *   THE RAILWAY'S TIMEZONE, NEVER THE BROWSER'S. A tourist's phone may be set
 *   to Europe/Berlin. A train that departs at 08:30 departs at 08:30 in
 *   Pretoria regardless. All civil times here are South African Standard Time.
 *   South Africa has observed no daylight saving since 1944, so SAST is a fixed
 *   UTC+02:00 and a wall-clock time converts to an instant by arithmetic —
 *   no timezone database needed, and no risk of a DST rule changing under us.
 *
 *   NOTHING IS INVENTED. Distances come from the mapped geometry and times from
 *   the published timetable, both through `corridor`. Where the published table
 *   does not cover something — a northbound service, or the exact km of a stop
 *   we have no editorial page for — this module says so rather than filling the
 *   gap with a plausible number.
 */

import {
  CALLS,
  CALL_DAYS,
  RAILWAY_UTC_OFFSET_MINUTES,
  RAILWAY_TIMEZONE_LABEL,
  TOTAL_KM,
  type Direction,
} from "./corridor";
import { stops } from "../data";

const MINUTE = 60_000;
const DAY_MINUTES = 1440;

// ── SAST arithmetic ─────────────────────────────────────────────────────────

/** Minutes past midnight for a "HH:MM" string. */
function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * A South African civil date and time, as an instant.
 *
 * `date` is "YYYY-MM-DD" read as a SAST calendar date. Because SAST is a fixed
 * UTC+02:00 the conversion is exact: build the instant in UTC and step back the
 * offset. `Date.UTC` handles month lengths, leap days and year ends itself, so
 * 29 February and 31 December need no special case here.
 */
export function sastInstant(date: string, minutesIntoDay: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)
    + (minutesIntoDay - RAILWAY_UTC_OFFSET_MINUTES) * MINUTE);
}

/** The SAST civil date of an instant, "YYYY-MM-DD". */
export function sastDate(at: Date): string {
  const shifted = new Date(at.getTime() + RAILWAY_UTC_OFFSET_MINUTES * MINUTE);
  return shifted.toISOString().slice(0, 10);
}

/** The SAST wall clock of an instant, "HH:MM". */
export function sastClock(at: Date): string {
  const shifted = new Date(at.getTime() + RAILWAY_UTC_OFFSET_MINUTES * MINUTE);
  return shifted.toISOString().slice(11, 16);
}

/** "05:48 SAST" — the label a passenger reads. */
export function sastLabel(at: Date): string {
  return `${sastClock(at)} ${RAILWAY_TIMEZONE_LABEL}`;
}

/** Whole days between two SAST calendar dates. */
export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((sastInstant(toDate, 0).getTime() - sastInstant(fromDate, 0).getTime()) / (DAY_MINUTES * MINUTE));
}

/** Add whole days to a SAST calendar date. */
export function addDays(date: string, days: number): string {
  return sastDate(new Date(sastInstant(date, 12 * 60).getTime() + days * DAY_MINUTES * MINUTE));
}

/**
 * Today, as the railway counts it.
 *
 * A passenger in Berlin planning a South African journey at 23:30 their time is
 * planning for a South African tomorrow, and the default date has to be the
 * railway's, not their device's.
 */
export function todaySast(now: Date = new Date()): string {
  return sastDate(now);
}

// ── The stations this module can place in space and time ────────────────────

export interface ScheduledStation {
  stopId: string;
  name: string;
  /** Route kilometre, measured southbound from Pretoria. */
  km: number;
  /** Scheduled time, SAST wall clock. */
  time: string;
  /** Service day, 1-based, as the published timetable counts it. */
  serviceDay: number;
}

/**
 * The stations with both a published time and a measured position.
 *
 * The train also calls at Klerksdorp, Wellington and Bellville. They are in the
 * timetable but this app has no measured kilometre for them, and a made-up
 * position would put a station in the wrong place on the line — so they are
 * left out of the interpolation rather than guessed at. The effect is that time
 * between two editorial stops is spread evenly across the distance between
 * them, which is an approximation and is documented as one.
 */
export const SCHEDULE: ScheduledStation[] = CALLS
  .map((call, i) => ({ call, serviceDay: CALL_DAYS[i] }))
  .filter(({ call }) => call.stopId !== null)
  .map(({ call, serviceDay }) => {
    const stop = stops.find(s => s.id === call.stopId);
    return stop && typeof stop.km === "number"
      ? { stopId: call.stopId as string, name: call.name, km: stop.km, time: call.time, serviceDay }
      : null;
  })
  .filter((s): s is ScheduledStation => s !== null);

/** Southbound is the published direction: Pretoria first, Cape Town last. */
export const SOUTHBOUND_STATIONS = SCHEDULE;

/**
 * Northbound, derived — and labelled as derived wherever it is shown.
 *
 * The operator publishes a southbound table. Rather than invent a northbound
 * one, this mirrors it: the stations in reverse order, and each leg taking the
 * same scheduled time it takes going the other way. The departure time of the
 * first station is the only free choice, and it is taken as the southbound
 * arrival time at that station so the service still starts at a plausible hour.
 */
export function northboundStations(): ScheduledStation[] {
  const south = SCHEDULE;
  const reversed = [...south].reverse();
  const out: ScheduledStation[] = [];
  let minutes = minutesOfDay(reversed[0].time);
  let day = 1;
  for (let i = 0; i < reversed.length; i += 1) {
    if (i > 0) {
      const legMinutes = absoluteMinutes(south[south.length - i], south[south.length - 1 - i]);
      minutes += legMinutes;
      while (minutes >= DAY_MINUTES) { minutes -= DAY_MINUTES; day += 1; }
    }
    out.push({ ...reversed[i], time: clockOf(minutes), serviceDay: day });
  }
  return out;
}

function clockOf(minutesIntoDay: number): string {
  const m = ((minutesIntoDay % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Scheduled minutes from one station to another, in timetable order. */
function absoluteMinutes(from: ScheduledStation, to: ScheduledStation): number {
  const a = from.serviceDay * DAY_MINUTES + minutesOfDay(from.time);
  const b = to.serviceDay * DAY_MINUTES + minutesOfDay(to.time);
  return Math.abs(b - a);
}

export function stationsFor(direction: Direction): ScheduledStation[] {
  return direction === "southbound" ? SOUTHBOUND_STATIONS : northboundStations();
}

/** Northbound times are ours, not the operator's, and the app must say so. */
export const DERIVED_DIRECTION_NOTICE =
  "Northbound times are mirrored from the published southbound timetable, not " +
  "published by the operator. Treat them as an illustration of the return journey.";

// ── The itinerary ───────────────────────────────────────────────────────────

export interface Itinerary {
  /** The SAST calendar date the passenger boards, "YYYY-MM-DD". */
  boardDate: string;
  direction: Direction;
  boardStopId: string;
  alightStopId: string;
  /** Minutes of delay to model. Zero unless a demonstration sets it. */
  delayMinutes?: number;
}

export interface ItineraryLeg {
  station: ScheduledStation;
  /** The scheduled instant this station is reached, delay included. */
  at: Date;
  /** Distance from the passenger's boarding station, in kilometres. */
  legKm: number;
  /** Day of the passenger's journey, 1-based from their own boarding day. */
  passengerDay: number;
}

export class ItineraryError extends Error {}

/**
 * The passenger's own leg: the stations they will actually pass, with real
 * instants, measured from where they get on rather than from Pretoria.
 */
export function buildLeg(itinerary: Itinerary): ItineraryLeg[] {
  const stations = stationsFor(itinerary.direction);
  const boardIndex = stations.findIndex(s => s.stopId === itinerary.boardStopId);
  const alightIndex = stations.findIndex(s => s.stopId === itinerary.alightStopId);

  if (boardIndex === -1) throw new ItineraryError(`No scheduled station "${itinerary.boardStopId}".`);
  if (alightIndex === -1) throw new ItineraryError(`No scheduled station "${itinerary.alightStopId}".`);
  if (alightIndex <= boardIndex) {
    throw new ItineraryError(
      `This service does not run from ${stations[boardIndex].name} to ${stations[alightIndex].name}.`);
  }

  const board = stations[boardIndex];
  const delay = Math.max(0, itinerary.delayMinutes ?? 0);

  // The service's own day 1 may be before the day this passenger boards: a
  // passenger joining at Beaufort West boards on the service's second day.
  const serviceDayOneDate = addDays(itinerary.boardDate, -(board.serviceDay - 1));

  return stations.slice(boardIndex, alightIndex + 1).map(station => {
    const date = addDays(serviceDayOneDate, station.serviceDay - 1);
    const at = new Date(sastInstant(date, minutesOfDay(station.time)).getTime() + delay * MINUTE);
    return {
      station,
      at,
      legKm: Math.abs(station.km - board.km),
      passengerDay: daysBetween(itinerary.boardDate, sastDate(at)) + 1,
    };
  });
}

// ── Where and when ──────────────────────────────────────────────────────────

export interface JourneyMoment {
  /** The instant, in real time. */
  at: Date;
  /** SAST wall clock, "05:48". */
  clock: string;
  /** SAST calendar date, "YYYY-MM-DD". */
  date: string;
  /** Day of the passenger's journey, 1-based. */
  day: number;
  /** Position along the whole corridor, in route kilometres. */
  routeKm: number;
  /** Distance this passenger has travelled on their own leg. */
  travelledKm: number;
  /** Distance still to go on their own leg. */
  remainingKm: number;
  /** 0 at boarding, 1 at their destination. */
  progress: number;
  previousStation: ScheduledStation | null;
  nextStation: ScheduledStation | null;
  /** Scheduled arrival at the next station, delay included. */
  nextStationAt: Date | null;
}

/**
 * The moment the passenger is living at a given distance into their own leg.
 *
 * Time comes from the timetable, interpolated across each segment by how far
 * along that segment the train is — so the clock and the kilometres advance
 * together and cannot drift apart, whatever the simulation speed is doing.
 */
export function momentAtLegKm(itinerary: Itinerary, legKm: number): JourneyMoment {
  const leg = buildLeg(itinerary);
  const totalLegKm = leg[leg.length - 1].legKm;
  const clamped = Math.min(Math.max(legKm, 0), totalLegKm);

  let index = 0;
  while (index < leg.length - 2 && leg[index + 1].legKm <= clamped) index += 1;

  const from = leg[index];
  const to = leg[Math.min(index + 1, leg.length - 1)];
  const span = to.legKm - from.legKm;
  const within = span > 0 ? (clamped - from.legKm) / span : 0;

  const at = new Date(from.at.getTime() + (to.at.getTime() - from.at.getTime()) * within);
  const direction = itinerary.direction === "southbound" ? 1 : -1;
  const routeKm = from.station.km + direction * (clamped - from.legKm);

  const atDestination = clamped >= totalLegKm;
  return {
    at,
    clock: sastClock(at),
    date: sastDate(at),
    day: daysBetween(itinerary.boardDate, sastDate(at)) + 1,
    routeKm: Math.min(Math.max(routeKm, 0), TOTAL_KM),
    travelledKm: clamped,
    remainingKm: Math.max(0, totalLegKm - clamped),
    progress: totalLegKm > 0 ? clamped / totalLegKm : 1,
    /* At zero this is the boarding station, which is correct: the passenger is
       standing at it, not between it and anything. */
    previousStation: from.station,
    nextStation: atDestination ? null : to.station,
    nextStationAt: atDestination ? null : to.at,
  };
}

/** The same moment, addressed by route kilometre rather than leg kilometre. */
export function momentAtRouteKm(itinerary: Itinerary, routeKm: number): JourneyMoment {
  const leg = buildLeg(itinerary);
  const boardKm = leg[0].station.km;
  return momentAtLegKm(itinerary, Math.abs(routeKm - boardKm));
}

/** How far into their own leg the passenger is at a given instant. */
export function legKmAt(itinerary: Itinerary, at: Date): number {
  const leg = buildLeg(itinerary);
  const first = leg[0].at.getTime();
  const last = leg[leg.length - 1].at.getTime();
  const t = Math.min(Math.max(at.getTime(), first), last);

  for (let i = 0; i < leg.length - 1; i += 1) {
    const from = leg[i], to = leg[i + 1];
    if (t <= to.at.getTime()) {
      const span = to.at.getTime() - from.at.getTime();
      const within = span > 0 ? (t - from.at.getTime()) / span : 0;
      return from.legKm + (to.legKm - from.legKm) * within;
    }
  }
  return leg[leg.length - 1].legKm;
}

/** The whole scheduled running time of this passenger's leg, in minutes. */
export function legMinutes(itinerary: Itinerary): number {
  const leg = buildLeg(itinerary);
  return Math.round((leg[leg.length - 1].at.getTime() - leg[0].at.getTime()) / MINUTE);
}

/**
 * The status line, as a passenger reads it:
 *
 *   DAY 2 · 05:48 SAST
 *   Approaching Matjiesfontein
 *   Scheduled arrival 06:30
 */
export interface StatusLines {
  when: string;
  heading: string;
  arrival: string | null;
  /** "Live", or "Simulation · 16x". */
  mode: string;
}

export interface StatusOptions {
  /** True when the position comes from device GPS rather than the simulation. */
  live: boolean;
  /** Simulation speed, shown so nobody mistakes 16x for real time. */
  speed?: number;
  /** Minutes of delay being modelled, if any. */
  delayMinutes?: number;
}

export function statusLines(moment: JourneyMoment, options: StatusOptions): StatusLines {
  const delayed = (options.delayMinutes ?? 0) > 0;
  return {
    when: `DAY ${moment.day} · ${sastLabel(moment.at)}`,
    heading: moment.nextStation ? `Approaching ${moment.nextStation.name}` : "Arrived",
    /* "Scheduled" is the operator's number. The moment we shift it by a modelled
       delay it stops being theirs, so it stops being called scheduled. */
    arrival: moment.nextStationAt
      ? `${delayed ? "Estimated" : "Scheduled"} arrival ${sastClock(moment.nextStationAt)}`
      : null,
    mode: options.live
      ? "Live"
      : `Simulation${options.speed && options.speed !== 1 ? ` · ${options.speed}x` : ""}`,
  };
}
