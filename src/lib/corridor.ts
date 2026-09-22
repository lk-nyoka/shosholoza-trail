/**
 * The corridor: one place that owns every railway fact this app states.
 *
 * Route facts used to be typed into whichever page needed them, and they drifted
 * apart — the home page said 27 hours while the boarding pass said 28h 10m, one
 * dataset put Cape Town at 1 582 km while the mapped geometry measured 1 568.4,
 * and the route guide quoted a third set of station distances about 12 km off
 * the ones the stop pages showed. A passenger who checks two screens against
 * each other should never find two answers.
 *
 * So: every distance, time, day number and name below is either defined here or
 * re-exported here from the one module that computes it. Nothing else in the
 * app may define a route fact. If a page needs one, it imports it from here.
 *
 * What is authoritative, and from where:
 *
 *   Distances      derived from the mapped OSM rail geometry (`routeIndex`),
 *                  not from a published table. The geometry is what the ride
 *                  actually follows, so it is what the numbers must describe.
 *   Times and days the published Shosholoza Meyl timetable (`timetable`),
 *                  compiled from seat61.com and checked September 2026.
 *   Stop duration  not published by the operator, and not invented here. The
 *                  passenger sets it from what the conductor announces.
 *
 * None of this is live operational data and the app never implies that it is.
 */

import { TOTAL_KM, positionAt } from "./routeIndex";
import {
  CALLS,
  CALL_DAYS,
  DEFAULT_STOP_MINUTES,
  STOP_MINUTE_CHOICES,
  REACH_LABEL,
  callFor,
  durationLabel,
  parseDistanceKm,
  reachOf,
  scheduleLabel,
  scheduledMinutesBetween,
  walkMinutes,
  type Call,
  type Reach,
} from "./timetable";

// ── Identity ────────────────────────────────────────────────────────────────

/** The operator of the service this app describes. We are not them. */
export const OPERATOR_NAME = "Shosholoza Meyl";

/** Who built this, said the same way everywhere. */
export const TEAM_NAME = "4GeeksSake";
export const PRODUCT_NAME = "Shosholoza Trail";

/**
 * Said wherever a scheduled time appears, in the app and in the API.
 *
 * Kept word-for-word in step with the backend's own SCHEDULE_NOTICE so the two
 * cannot drift into saying different things about the same numbers.
 */
export const TIMETABLE_NOTICE =
  "Demonstration timetable — confirm with the operator before travel.";

/** The longer form, for pages with room to explain rather than warn. */
export const TIMETABLE_NOTICE_LONG =
  "Published schedule compiled from operator timetables (seat61.com, checked " +
  "September 2026). This is not live operational data. Confirm every departure " +
  "with the operator before travelling.";

/** Where the timetable came from, for the credits and the guide's citations. */
export const TIMETABLE_SOURCE = {
  name: "seat61.com — South Africa rail timetables",
  url: "https://www.seat61.com/SouthAfrica.htm",
  checked: "2026-09",
} as const;

// ── Geography ───────────────────────────────────────────────────────────────

export { TOTAL_KM, positionAt };

/** The corridor's two ends, in the order the published timetable runs. */
export const ORIGIN_STOP_ID = "pretoria";
export const TERMINUS_STOP_ID = "cape-town";

/** A journey can be run in either direction along the same geometry. */
export type Direction = "southbound" | "northbound";

/** Southbound is Pretoria → Cape Town, the direction the timetable publishes. */
export const DEFAULT_DIRECTION: Direction = "southbound";

// ── Timetable ───────────────────────────────────────────────────────────────

export {
  CALLS,
  CALL_DAYS,
  DEFAULT_STOP_MINUTES,
  STOP_MINUTE_CHOICES,
  REACH_LABEL,
  callFor,
  durationLabel,
  parseDistanceKm,
  reachOf,
  scheduleLabel,
  scheduledMinutesBetween,
  walkMinutes,
};
export type { Call, Reach };

/**
 * The stations a passenger may board or alight at, in route order.
 *
 * These are the calls this app has editorial content for. The train also stops
 * at Klerksdorp, Wellington and Bellville; those appear in the timetable but
 * not as boarding choices, because we have nothing to tell you about them yet
 * and offering a stop with an empty journey behind it would be worse than not
 * offering it.
 */
export const BOARDING_STOP_IDS: string[] = CALLS
  .filter(call => call.stopId !== null)
  .map(call => call.stopId as string);

/** The whole scheduled run, in minutes, worked out from the timetable. */
export const JOURNEY_MINUTES: number =
  scheduledMinutesBetween(ORIGIN_STOP_ID, TERMINUS_STOP_ID) ?? 0;

/** "28h 10m" — derived, never typed. */
export const JOURNEY_DURATION_LABEL: string = durationLabel(JOURNEY_MINUTES);

/** The same figure written out, for prose: "28 hours and 10 minutes". */
export function durationWords(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  if (hours && mins) return `${hours} and ${mins}`;
  return hours || mins || "0 minutes";
}

/** "28 hours and 10 minutes". */
export const JOURNEY_DURATION_WORDS: string = durationWords(JOURNEY_MINUTES);

/** How many calendar days the scheduled run spans. */
export const JOURNEY_DAYS: number = CALL_DAYS[CALL_DAYS.length - 1] ?? 1;

/**
 * The timetable's own timezone.
 *
 * Never the browser's. A tourist's phone may be set to Europe/Berlin, and a
 * train that departs at 08:30 departs at 08:30 in Pretoria whatever the
 * passenger's device believes the time to be.
 */
export const RAILWAY_TIMEZONE = "Africa/Johannesburg";

/** Standard offset for SAST. South Africa does not observe daylight saving. */
export const RAILWAY_UTC_OFFSET_MINUTES = 120;
export const RAILWAY_TIMEZONE_LABEL = "SAST";
