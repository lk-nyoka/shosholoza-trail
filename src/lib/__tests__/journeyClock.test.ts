/**
 * The journey clock, tested against the cases that actually break clocks.
 *
 * This journey crosses midnight every time it runs, spans two calendar days,
 * can be joined halfway, and will be demonstrated on a laptop that may be set
 * to any timezone on earth. Each of those is a way for a naive implementation
 * to be quietly wrong, so each one is asserted here.
 *
 * On timezone independence: every expectation below is a South African wall
 * clock. The functions build instants with `Date.UTC` and read them back with
 * `toISOString`, so no local-time method is ever consulted. These assertions
 * run green in the UTC container and on the team's UTC+2 machines; an
 * implementation that reached for local time could not pass in both.
 *
 * Run: npm test
 */
declare const process: { env: Record<string, string | undefined> } | undefined;
// Set before any Date work in this file. Node re-reads TZ on assignment in the
// versions this project uses; where it does not, the assertions still hold,
// because the implementation never asks what the local zone is.
if (typeof process !== "undefined" && process.env) process.env.TZ = "America/New_York";

import {
  DERIVED_DIRECTION_NOTICE,
  ItineraryError,
  SCHEDULE,
  addDays,
  buildLeg,
  daysBetween,
  legKmAt,
  legMinutes,
  momentAtLegKm,
  momentAtRouteKm,
  northboundStations,
  sastClock,
  sastDate,
  sastInstant,
  statusLines,
  type Itinerary,
} from "../journeyClock";
import { JOURNEY_MINUTES } from "../corridor";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
        `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
const near = (name: string, actual: number, expected: number, tolerance: number) =>
  check(name, Math.abs(actual - expected) <= tolerance, `got ${actual}, wanted ~${expected}`);

const southbound = (over: Partial<Itinerary> = {}): Itinerary => ({
  boardDate: "2026-09-25",
  direction: "southbound",
  boardStopId: "pretoria",
  alightStopId: "cape-town",
  ...over,
});

// ── The schedule itself ─────────────────────────────────────────────────────
eq("eight stations have both a time and a measured position", SCHEDULE.length, 8);
eq("the first is Pretoria at kilometre zero", [SCHEDULE[0].stopId, SCHEDULE[0].km], ["pretoria", 0]);
eq("Pretoria departs at 08:30", SCHEDULE[0].time, "08:30");
check("stations are in increasing distance order",
      SCHEDULE.every((s, i) => i === 0 || s.km > SCHEDULE[i - 1].km));

// ── SAST arithmetic, independent of the machine's timezone ─────────────────
eq("a SAST wall clock becomes the right instant",
   sastInstant("2026-09-25", 8 * 60 + 30).toISOString(), "2026-09-25T06:30:00.000Z");
eq("and reads back as the same wall clock", sastClock(sastInstant("2026-09-25", 8 * 60 + 30)), "08:30");
eq("and the same calendar date", sastDate(sastInstant("2026-09-25", 8 * 60 + 30)), "2026-09-25");
eq("just before SAST midnight is still that date", sastDate(sastInstant("2026-09-25", 23 * 60 + 59)), "2026-09-25");
eq("SAST midnight is the next date", sastDate(sastInstant("2026-09-25", 24 * 60)), "2026-09-26");

// Month, year and leap-day boundaries.
eq("month boundary", addDays("2026-09-30", 1), "2026-10-01");
eq("year boundary", addDays("2026-12-31", 1), "2027-01-01");
eq("leap day exists in 2028", addDays("2028-02-28", 1), "2028-02-29");
eq("and the day after it is March", addDays("2028-02-29", 1), "2028-03-01");
eq("a non-leap year skips it", addDays("2027-02-28", 1), "2027-03-01");
eq("days between across a month end", daysBetween("2026-09-30", "2026-10-02"), 2);
eq("days between across a leap day", daysBetween("2028-02-28", "2028-03-01"), 2);

// ── Pretoria boarding at 08:30 ──────────────────────────────────────────────
{
  const it = southbound();
  const leg = buildLeg(it);
  eq("the whole line is eight stations", leg.length, 8);
  eq("the ride begins at 08:30", sastClock(leg[0].at), "08:30");
  eq("on the day the passenger said", sastDate(leg[0].at), "2026-09-25");
  eq("zero kilometres travelled at boarding", leg[0].legKm, 0);
  eq("it arrives the next day at 12:40", [sastDate(leg[7].at), sastClock(leg[7].at)],
     ["2026-09-26", "12:40"]);
  eq("arrival is day 2 for this passenger", leg[7].passengerDay, 2);
  eq("the leg takes the whole published run", legMinutes(it), JOURNEY_MINUTES);

  const start = momentAtLegKm(it, 0);
  eq("the first moment is 08:30 on day 1", [start.clock, start.day], ["08:30", 1]);
  eq("nothing travelled yet", start.travelledKm, 0);
  eq("the next station is Johannesburg", start.nextStation?.stopId, "johannesburg");
  eq("progress starts at zero", start.progress, 0);
}

// ── Kimberley boarding: the ride starts at Kimberley, not Pretoria ─────────
{
  const it = southbound({ boardStopId: "kimberley" });
  const leg = buildLeg(it);
  eq("the leg starts at Kimberley", leg[0].station.stopId, "kimberley");
  eq("and runs to Cape Town", leg[leg.length - 1].station.stopId, "cape-town");
  eq("Pretoria and Johannesburg are not replayed", leg.length, 6);
  eq("the ride begins at Kimberley's scheduled time", sastClock(leg[0].at), "19:07");
  eq("on the passenger's own date", sastDate(leg[0].at), "2026-09-25");
  eq("travelled distance starts at zero for this passenger", leg[0].legKm, 0);

  const start = momentAtLegKm(it, 0);
  eq("their day 1 is the day they board", start.day, 1);
  near("they are at Kimberley on the corridor", start.routeKm, 539.7, 1.5);
  near("remaining distance is Kimberley to Cape Town", start.remainingKm, 1568.3 - 539.7, 2);
  eq("the next station is De Aar", start.nextStation?.stopId, "de-aar");
}

// ── Crossing midnight, and day one becoming day two ────────────────────────
{
  const it = southbound({ boardStopId: "kimberley" });
  const leg = buildLeg(it);
  const deAar = leg.find(l => l.station.stopId === "de-aar")!;
  const beaufort = leg.find(l => l.station.stopId === "beaufort")!;

  eq("De Aar is 23:05 on the boarding day", [sastClock(deAar.at), sastDate(deAar.at)],
     ["23:05", "2026-09-25"]);
  eq("Beaufort West is 03:40 the next morning", [sastClock(beaufort.at), sastDate(beaufort.at)],
     ["03:40", "2026-09-26"]);
  check("and it really is later, not earlier", beaufort.at.getTime() > deAar.at.getTime(),
        `${beaufort.at.toISOString()} vs ${deAar.at.toISOString()}`);
  eq("De Aar is day 1", deAar.passengerDay, 1);
  eq("Beaufort West is day 2", beaufort.passengerDay, 2);

  const justBefore = momentAtLegKm(it, deAar.legKm + 0.01);
  const justAfter = momentAtLegKm(it, beaufort.legKm - 0.01);
  check("time never runs backwards across midnight",
        justAfter.at.getTime() > justBefore.at.getTime());
}

// ── Boarding on the service's second day ───────────────────────────────────
{
  const it = southbound({ boardStopId: "beaufort", boardDate: "2026-09-25" });
  const leg = buildLeg(it);
  eq("Beaufort West boarding is at 03:40 on the stated date",
     [sastClock(leg[0].at), sastDate(leg[0].at)], ["03:40", "2026-09-25"]);
  eq("and that is the passenger's day 1", leg[0].passengerDay, 1);
  eq("arrival is later the same day", sastDate(leg[leg.length - 1].at), "2026-09-25");
  eq("so the whole leg is one day", leg[leg.length - 1].passengerDay, 1);
}

// ── An intermediate leg that neither starts nor ends at a terminus ─────────
{
  const it = southbound({ boardStopId: "de-aar", alightStopId: "worcester" });
  const leg = buildLeg(it);
  eq("only the stations on the leg", leg.map(l => l.station.stopId),
     ["de-aar", "beaufort", "matjies", "worcester"]);
  eq("boarding at 23:05", sastClock(leg[0].at), "23:05");
  eq("alighting at 09:20 the next day", [sastClock(leg[3].at), sastDate(leg[3].at)],
     ["09:20", "2026-09-26"]);
  eq("ten hours fifteen on this leg", legMinutes(it), 10 * 60 + 15);
}

// ── Leap day, month end and year end as real journeys ──────────────────────
{
  const leap = buildLeg(southbound({ boardStopId: "kimberley", boardDate: "2028-02-29" }));
  eq("a journey boarding on 29 February arrives on 1 March",
     sastDate(leap[leap.length - 1].at), "2028-03-01");
  const monthEnd = buildLeg(southbound({ boardStopId: "kimberley", boardDate: "2026-09-30" }));
  eq("a journey boarding on 30 September arrives in October",
     sastDate(monthEnd[monthEnd.length - 1].at), "2026-10-01");
  const yearEnd = buildLeg(southbound({ boardStopId: "kimberley", boardDate: "2026-12-31" }));
  eq("a journey boarding on New Year's Eve arrives in the new year",
     sastDate(yearEnd[yearEnd.length - 1].at), "2027-01-01");
}

// ── Station arrival lands exactly on the published time ────────────────────
{
  const it = southbound();
  for (const leg of buildLeg(it)) {
    const moment = momentAtLegKm(it, leg.legKm);
    eq(`arriving at ${leg.station.stopId} reads its scheduled time`,
       moment.clock, leg.station.time);
  }
}

// ── Distance and time advance together, in both directions ─────────────────
{
  const it = southbound();
  const total = buildLeg(it).slice(-1)[0].legKm;
  for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const km = total * fraction;
    const moment = momentAtLegKm(it, km);
    near(`km ${Math.round(km)} round-trips through the clock`, legKmAt(it, moment.at), km, 1);
  }
  let last = -1;
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const moment = momentAtLegKm(it, total * f);
    check(`time is monotonic at ${Math.round(f * 100)}%`, moment.at.getTime() > last);
    last = moment.at.getTime();
  }
}

// ── Route kilometre addressing agrees with leg kilometre ───────────────────
{
  const it = southbound({ boardStopId: "kimberley" });
  const byRoute = momentAtRouteKm(it, 1035.5);
  eq("addressing Beaufort West by route km gives its time", byRoute.clock, "03:40");
  eq("and its day", byRoute.day, 2);
}

// ── Delays shift every time, and change the wording ────────────────────────
{
  const onTime = buildLeg(southbound());
  const late = buildLeg(southbound({ delayMinutes: 95 }));
  eq("a 95-minute delay moves departure to 10:05", sastClock(late[0].at), "10:05");
  eq("and arrival by the same amount",
     Math.round((late[7].at.getTime() - onTime[7].at.getTime()) / 60000), 95);
  eq("a delay past midnight still lands on the right date",
     sastDate(buildLeg(southbound({ boardStopId: "de-aar", delayMinutes: 60 }))[0].at), "2026-09-26");

  const moment = momentAtLegKm(southbound({ delayMinutes: 95 }), 0);
  eq("a delayed arrival is called estimated, not scheduled",
     statusLines(moment, { live: false, delayMinutes: 95 }).arrival?.startsWith("Estimated"), true);
  eq("an undelayed one is called scheduled",
     statusLines(momentAtLegKm(southbound(), 0), { live: false }).arrival?.startsWith("Scheduled"), true);
}

// ── The status line a passenger reads ──────────────────────────────────────
{
  const it = southbound({ boardStopId: "kimberley" });
  const beaufortKm = buildLeg(it).find(l => l.station.stopId === "beaufort")!.legKm;
  const lines = statusLines(momentAtLegKm(it, beaufortKm - 40), { live: false, speed: 16 });
  eq("the day and time line", lines.when.startsWith("DAY 2 · "), true);
  eq("the time carries its timezone", lines.when.endsWith(" SAST"), true);
  eq("the heading names the next station", lines.heading, "Approaching Beaufort West");
  eq("the arrival is the published one", lines.arrival, "Scheduled arrival 03:40");
  eq("the mode says it is a simulation and how fast", lines.mode, "Simulation · 16x");
  eq("a live ride says so", statusLines(momentAtLegKm(it, 0), { live: true }).mode, "Live");
}

// ── Northbound: derived, mirrored, and labelled ────────────────────────────
{
  const north = northboundStations();
  eq("northbound starts at Cape Town", north[0].stopId, "cape-town");
  eq("and ends at Pretoria", north[north.length - 1].stopId, "pretoria");
  eq("with the same eight stations", north.length, 8);

  const it: Itinerary = {
    boardDate: "2026-09-25", direction: "northbound",
    boardStopId: "cape-town", alightStopId: "pretoria",
  };
  const leg = buildLeg(it);
  eq("a northbound leg runs the whole way", leg.length, 8);
  eq("and takes the same time as southbound", legMinutes(it), JOURNEY_MINUTES);
  check("northbound time also only moves forward",
        leg.every((l, i) => i === 0 || l.at.getTime() > leg[i - 1].at.getTime()));

  const start = momentAtLegKm(it, 0);
  near("it begins at the Cape Town end of the corridor", start.routeKm, 1568.3, 2);
  const onward = momentAtLegKm(it, 200);
  check("and route kilometres count down as it goes north", onward.routeKm < start.routeKm,
        `${onward.routeKm} vs ${start.routeKm}`);
  check("the derived-timetable notice exists and says it is not the operator's",
        /not\s+published by the operator/i.test(DERIVED_DIRECTION_NOTICE));
}

// ── Impossible itineraries are refused, not fudged ─────────────────────────
{
  const refuses = (name: string, it: Itinerary) => {
    let threw = false;
    try { buildLeg(it); } catch (error) { threw = error instanceof ItineraryError; }
    check(name, threw);
  };
  refuses("boarding somewhere the train does not stop",
          southbound({ boardStopId: "nowhere" }));
  refuses("alighting somewhere the train does not stop",
          southbound({ alightStopId: "nowhere" }));
  refuses("travelling backwards along a southbound service",
          southbound({ boardStopId: "cape-town", alightStopId: "pretoria" }));
  refuses("boarding and alighting at the same station",
          southbound({ boardStopId: "kimberley", alightStopId: "kimberley" }));
}

// ── Clamping: a slider cannot push the journey off either end ─────────────
{
  const it = southbound();
  const total = buildLeg(it).slice(-1)[0].legKm;
  eq("before the start clamps to the start", momentAtLegKm(it, -500).clock, "08:30");
  eq("past the end clamps to the end", momentAtLegKm(it, total + 500).clock, "12:40");
  eq("and the end has no next station", momentAtLegKm(it, total).nextStation, null);
  eq("progress at the end is exactly one", momentAtLegKm(it, total).progress, 1);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
if (failures) throw new Error(`${failures} assertion(s) failed`);
