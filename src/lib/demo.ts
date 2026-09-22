/**
 * Demonstration mode.
 *
 * Four minutes on a stage is not the place to discover that the venue wifi is
 * saturated, that a judge's phone refused a location prompt, or that the train
 * happened to be in the middle of the Karoo with nothing to look at. Every one
 * of those has sunk a better product than this one.
 *
 * So: `?demo=1` pins the app to a prepared, deterministic state. It changes
 * nothing about what the app claims — every simulation label stays exactly
 * where it was, and a visible chip says DEMO so that nobody watching can
 * mistake a rehearsed run for a live one. It only removes the ways a
 * demonstration can fail for reasons that have nothing to do with the work.
 *
 *   ?demo=1   turn it on (remembered for the tab, so navigation keeps it)
 *   ?demo=0   turn it off
 *
 * It is deliberately a URL parameter rather than a build flag: the deployed
 * build the judges can open afterwards is the same build that was presented.
 */

const KEY = "st.demo.v1";

function readFlag(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param === "1" || param === "true") {
      window.sessionStorage.setItem(KEY, "1");
      return true;
    }
    if (param === "0" || param === "false") {
      window.sessionStorage.removeItem(KEY);
      return false;
    }
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Resolved once, at startup. A mode that could flip halfway through a
 * presentation would be worse than no mode at all.
 */
export const DEMO = typeof window === "undefined" ? false : readFlag();

/**
 * Where the ride begins in demo mode.
 *
 * 1 246 km: the run down into Matjiesfontein, with the Hex River mountains
 * ahead and a station worth arriving at eighteen kilometres away. Starting at
 * Pretoria means the first thing an audience sees is a suburb.
 */
export const DEMO_START_KM = 1246;

/** Slow enough to talk over, fast enough that the platform arrives on cue. */
export const DEMO_SPEED = 8;

/**
 * A fixed position for the live page, so it never asks a judge's phone for its
 * location and never shows a blank map because the fix has not arrived.
 */
export const DEMO_POSITION = { km: 1258.4, lat: -33.2311, lon: 20.6702 };

/** The one prepared question, so the guide answers instantly and identically. */
export const DEMO_QUESTION = "How long do I have at Matjiesfontein?";

/**
 * Developer instrumentation: vertex counts, imagery capture dates, how many
 * billboards are lit. Useful while building the scene, meaningless to someone
 * on a train, so it is off unless ?debug=1 asks for it.
 */
export const DEBUG =
  typeof window === "undefined"
    ? false
    : new URLSearchParams(window.location.search).get("debug") === "1";

// ── A known-good starting state ───────────────────────────────────────────

/**
 * The itinerary the demonstration runs on.
 *
 * Without one the ride has no clock: `buildLeg` needs a boarding station, an
 * alighting station and a date, and a judge opening `?demo=1` on a fresh
 * phone has none of them saved. The readout then falls back to kilometres,
 * which is the one part of the journey model worth showing.
 *
 * Pretoria to Cape Town, the whole line, on a fixed date — fixed so that the
 * same run on two different days shows the same clock, and so the rehearsal
 * and the performance are identical.
 */
export const DEMO_TRIP = {
  boardId: "pretoria",
  alightId: "cape-town",
  date: "2026-09-22",
  direction: "southbound" as const,
};

/** The modes the demonstration starts with — the thing we were picked for. */
export const DEMO_MODES = ["adventure", "learning", "creative"];

const TRIP_KEY = "st.trip.v1";
const MODES_KEY = "st.modes.v2";
/** What was on the device before the demo overwrote it, so it can be given back. */
const BACKUP_KEY = "st.demo.backup.v1";

/**
 * Put the app into the prepared state, keeping whatever was there.
 *
 * "Safe" is the operative word. A judge's phone, or a teammate's, may already
 * hold a real trip and real creative work; a demonstration that quietly
 * replaces them is not acceptable, however convenient. So the previous values
 * are taken first and restored by `endDemo`.
 *
 * It only ever writes when demo mode is actually on, and it never writes
 * twice — re-running it on a later navigation must not overwrite the backup
 * with the demo's own values.
 */
export function startDemo(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): boolean {
  try {
    if (storage.getItem(BACKUP_KEY) !== null) return false;
    storage.setItem(
      BACKUP_KEY,
      JSON.stringify({ trip: storage.getItem(TRIP_KEY), modes: storage.getItem(MODES_KEY) }),
    );
    storage.setItem(TRIP_KEY, JSON.stringify(DEMO_TRIP));
    storage.setItem(MODES_KEY, JSON.stringify(DEMO_MODES));
    return true;
  } catch {
    return false;
  }
}

/** Give the device back exactly what it had. */
export function endDemo(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): boolean {
  try {
    const raw = storage.getItem(BACKUP_KEY);
    if (raw === null) return false;
    const backup = JSON.parse(raw) as { trip: string | null; modes: string | null };
    if (backup.trip === null) storage.removeItem(TRIP_KEY);
    else storage.setItem(TRIP_KEY, backup.trip);
    if (backup.modes === null) storage.removeItem(MODES_KEY);
    else storage.setItem(MODES_KEY, backup.modes);
    storage.removeItem(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Warm the tiles the demonstration will fly through, before it starts.
 *
 * Four minutes on a stage is not the time to watch imagery stream in. This
 * fetches the ground around the demo's opening kilometres so the first frame
 * is already the Hex River mountains rather than grey.
 *
 * It is best-effort by design: it must never delay or block the app. A
 * demonstration on a saturated venue wifi with no preload is still a working
 * demonstration; one that hangs on a preload is not.
 */
export async function preloadDemo(
  fetchTile: (url: string) => Promise<unknown>,
  urls: string[],
): Promise<number> {
  let loaded = 0;
  await Promise.all(
    urls.map(async url => {
      try {
        await fetchTile(url);
        loaded += 1;
      } catch {
        /* One tile short is a grey square, not a failed demonstration. */
      }
    }),
  );
  return loaded;
}
