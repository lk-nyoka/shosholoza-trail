/**
 * The published timetable for the Pretoria–Cape Town service.
 *
 * These are the scheduled calling times as published for the Shosholoza Meyl
 * service (source: seat61.com/SouthAfrica.htm, the most reliable public record
 * of this timetable). They are scheduled times, not live ones — the app says so
 * wherever it shows them, because on this line the difference can be hours.
 *
 * The timetable publishes departure times only. It does not publish how long
 * the train stands at each station, and we do not invent that figure: how long
 * you have at a stop is something the passenger sets from what the conductor
 * announces. See `DEFAULT_STOP_MINUTES`.
 */

export interface Call {
  /** Matches Stop.id where the app has an editorial stop for this station. */
  stopId: string | null;
  name: string;
  /** Scheduled time, 24-hour, South African Standard Time. */
  time: string;
  /** Cape Town is an arrival; everything before it is a departure. */
  kind: "departure" | "arrival";
}

export const CALLS: Call[] = [
  { stopId: "pretoria",     name: "Pretoria",       time: "08:30", kind: "departure" },
  { stopId: "johannesburg", name: "Johannesburg",   time: "10:00", kind: "departure" },
  { stopId: null,           name: "Klerksdorp",     time: "14:15", kind: "departure" },
  { stopId: "kimberley",    name: "Kimberley",      time: "19:07", kind: "departure" },
  { stopId: "de-aar",       name: "De Aar",         time: "23:05", kind: "departure" },
  { stopId: "beaufort",     name: "Beaufort West",  time: "03:40", kind: "departure" },
  { stopId: "matjies",      name: "Matjiesfontein", time: "07:15", kind: "departure" },
  { stopId: "worcester",    name: "Worcester",      time: "09:20", kind: "departure" },
  { stopId: null,           name: "Wellington",     time: "11:10", kind: "departure" },
  { stopId: null,           name: "Bellville",      time: "12:10", kind: "departure" },
  { stopId: "cape-town",    name: "Cape Town",      time: "12:40", kind: "arrival"   },
];

/**
 * Which day of the journey each call falls on, worked out from the times
 * rather than stored. The train leaves Pretoria in the morning and reaches the
 * Cape around midday the next day, so a time earlier than the one before it has
 * crossed midnight.
 */
export const CALL_DAYS: number[] = (() => {
  let day = 1;
  return CALLS.map((call, i) => {
    if (i > 0 && minutesOfDay(call.time) < minutesOfDay(CALLS[i - 1].time)) day += 1;
    return day;
  });
})();

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function callFor(stopId: string): { call: Call; day: number } | null {
  const i = CALLS.findIndex(c => c.stopId === stopId);
  return i === -1 ? null : { call: CALLS[i], day: CALL_DAYS[i] };
}

/** "19:07 · day 1", the way a passenger reads a sleeper timetable. */
export function scheduleLabel(stopId: string): string | null {
  const found = callFor(stopId);
  if (!found) return null;
  return `${found.call.time} · day ${found.day}`;
}

/** Scheduled running time between two of our stops, in minutes. */
export function scheduledMinutesBetween(fromStopId: string, toStopId: string): number | null {
  const a = CALLS.findIndex(c => c.stopId === fromStopId);
  const b = CALLS.findIndex(c => c.stopId === toStopId);
  if (a === -1 || b === -1 || b <= a) return null;
  const start = CALL_DAYS[a] * 1440 + minutesOfDay(CALLS[a].time);
  const end   = CALL_DAYS[b] * 1440 + minutesOfDay(CALLS[b].time);
  return end - start;
}

export function durationLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/**
 * How long the train stands at a station.
 *
 * The timetable does not publish this and it varies by stop, by day and by how
 * far behind the train is running, so the app treats it as something the
 * passenger tells it — the conductor's announcement is the only reliable
 * source. This is the starting assumption, clearly labelled as one everywhere
 * it is used.
 */
export const DEFAULT_STOP_MINUTES = 5;
export const STOP_MINUTE_CHOICES = [2, 5, 10, 20, 45];

/** Walking pace used to turn a distance into minutes: 4.5 km/h, with luggage. */
const WALK_KMH = 4.5;

export function walkMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / WALK_KMH) * 60));
}

/** Distances are stored as display strings such as "1.2 km" or "300 m". */
export function parseDistanceKm(distance: string): number | null {
  const match = distance.trim().match(/^([\d.]+)\s*(km|m)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === "m" ? value / 1000 : value;
}

export type Reach = "platform" | "comfortable" | "tight" | "unreachable" | "unknown";

/**
 * Can I get there and back before the train leaves?
 *
 * Distance is the wrong unit on a train: 1.4 km is nothing on a free afternoon
 * and impossible in an eight-minute stop. Everything is measured as the return
 * walk against the time the passenger actually has.
 */
export function reachOf(distance: string, stopMinutes: number): {
  reach: Reach; walk: number | null; returnWalk: number | null;
} {
  const km = parseDistanceKm(distance);
  if (km === null) return { reach: "unknown", walk: null, returnWalk: null };
  const walk = walkMinutes(km);
  const returnWalk = walk * 2;
  if (km <= 0.15) return { reach: "platform", walk, returnWalk };
  // Two minutes to be served, two to get back aboard before the whistle.
  const needed = returnWalk + 4;
  if (needed <= stopMinutes * 0.7) return { reach: "comfortable", walk, returnWalk };
  if (needed <= stopMinutes)       return { reach: "tight", walk, returnWalk };
  return { reach: "unreachable", walk, returnWalk };
}

export const REACH_LABEL: Record<Reach, string> = {
  platform:    "On the platform",
  comfortable: "Time to spare",
  tight:       "Tight — don't linger",
  unreachable: "Not in this stop",
  unknown:     "Distance unknown",
};
