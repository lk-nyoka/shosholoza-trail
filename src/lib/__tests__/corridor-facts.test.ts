/**
 * One source of truth for every railway fact.
 *
 * Route facts used to be typed into whichever page needed them and drifted
 * apart: 27 hours on the home page against 28h 10m on the boarding pass, Cape
 * Town at 1 582 km in one dataset against 1 568.4 measured from the geometry,
 * and a third set of station distances inside the route guide. This suite is
 * what stops that happening again.
 *
 * Run: npm test
 */
import {
  BOARDING_STOP_IDS,
  CALLS,
  CALL_DAYS,
  JOURNEY_DAYS,
  JOURNEY_DURATION_LABEL,
  JOURNEY_DURATION_WORDS,
  JOURNEY_MINUTES,
  ORIGIN_STOP_ID,
  RAILWAY_TIMEZONE,
  TERMINUS_STOP_ID,
  TIMETABLE_NOTICE,
  TOTAL_KM,
  durationWords,
  scheduledMinutesBetween,
} from "../corridor";
import { stops } from "../../data";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
        `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);

// ── The corridor measures what the geometry measures ────────────────────────
check("total distance comes from the mapped geometry", TOTAL_KM > 1560 && TOTAL_KM < 1575, `${TOTAL_KM}`);
check("nothing anywhere still says 1582", TOTAL_KM !== 1582);

const terminus = stops.find(s => s.id === TERMINUS_STOP_ID);
check("the last stop sits at the end of the route",
      terminus !== undefined && Math.abs((terminus.km ?? 0) - TOTAL_KM) < 1,
      `${terminus?.km} vs ${TOTAL_KM}`);

const origin = stops.find(s => s.id === ORIGIN_STOP_ID);
eq("the first stop is kilometre zero", origin?.km, 0);

// ── Stop distances increase along the line, exactly once each ───────────────
const boarding = BOARDING_STOP_IDS.map(id => stops.find(s => s.id === id));
check("every boarding stop exists in the dataset", boarding.every(Boolean));
const kms = boarding.map(s => s?.km ?? -1);
check("stop distances run in order", kms.every((km, i) => i === 0 || km > kms[i - 1]), kms.join(", "));
eq("no stop is listed twice", new Set(BOARDING_STOP_IDS).size, BOARDING_STOP_IDS.length);

// ── The timetable is internally consistent ──────────────────────────────────
eq("every call has a day number", CALL_DAYS.length, CALLS.length);
check("day numbers never go backwards", CALL_DAYS.every((d, i) => i === 0 || d >= CALL_DAYS[i - 1]));
eq("the run spans the days the timetable implies", JOURNEY_DAYS, CALL_DAYS[CALL_DAYS.length - 1]);
check("the scheduled run is between 24 and 36 hours",
      JOURNEY_MINUTES > 24 * 60 && JOURNEY_MINUTES < 36 * 60, `${JOURNEY_MINUTES} min`);
eq("the duration label is derived, not typed", JOURNEY_DURATION_LABEL, "28h 10m");
eq("the words form matches the label", JOURNEY_DURATION_WORDS, "28 hours and 10 minutes");
check("nothing claims 27 hours", JOURNEY_DURATION_LABEL !== "27h" && JOURNEY_MINUTES !== 27 * 60);

// Each leg must take positive time — a negative leg means a day number is wrong.
for (let i = 1; i < BOARDING_STOP_IDS.length; i += 1) {
  const from = BOARDING_STOP_IDS[i - 1], to = BOARDING_STOP_IDS[i];
  const minutes = scheduledMinutesBetween(from, to);
  check(`${from} → ${to} takes positive time`, minutes !== null && minutes > 0, `${minutes}`);
}

// ── Words ───────────────────────────────────────────────────────────────────
eq("durationWords: exact hours", durationWords(120), "2 hours");
eq("durationWords: singular hour", durationWords(60), "1 hour");
eq("durationWords: minutes only", durationWords(45), "45 minutes");
eq("durationWords: singular minute", durationWords(1), "1 minute");
eq("durationWords: zero", durationWords(0), "0 minutes");

// ── The honesty label and the timezone ──────────────────────────────────────
check("the demonstration label names the operator check",
      /confirm with the operator/i.test(TIMETABLE_NOTICE), TIMETABLE_NOTICE);
eq("the railway runs on its own timezone, not the browser's", RAILWAY_TIMEZONE, "Africa/Johannesburg");

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
if (failures) throw new Error(`${failures} assertion(s) failed`);
