/**
 * The demonstration and offline-package test.
 *
 * Both halves are about the same thing: a claim the app makes that somebody
 * has to be able to rely on.
 *
 * A demonstration must not cost a teammate their real trip and their creative
 * work, must be identical on the rehearsal and on the day, and must give the
 * device back exactly what it had. Those are testable.
 *
 * An offline package must be able to say whether it is still good. "Something
 * is stored" is not that: a download taken in July against a route file we
 * have since corrected looks exactly like one taken this morning, and the one
 * place it matters is nine hours from a signal.
 *
 *   npx esbuild src/lib/__tests__/demoOffline.test.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
 */
import { DEMO_MODES, DEMO_TRIP, endDemo, preloadDemo, startDemo } from "../demo";
import { STALE_AFTER_DAYS, assessPackage, type OfflineManifest } from "../offlineJourney";
import { BOARDING_STOP_IDS, ORIGIN_STOP_ID, TERMINUS_STOP_ID } from "../corridor";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok =
    actual === expected ||
    (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 1e-9);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, wanted ${expected})`}`);
};

const makeStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    size: () => map.size,
  };
};

const TRIP_KEY = "st.trip.v1";
const MODES_KEY = "st.modes.v2";
const BACKUP_KEY = "st.demo.backup.v1";

// ── The prepared itinerary is a real one ──────────────────────────────────

check("the demo boards at the origin", DEMO_TRIP.boardId, ORIGIN_STOP_ID);
check("...and alights at the terminus", DEMO_TRIP.alightId, TERMINUS_STOP_ID);
check("both are stations the service calls at", BOARDING_STOP_IDS.includes(DEMO_TRIP.boardId), true);
check("...both of them", BOARDING_STOP_IDS.includes(DEMO_TRIP.alightId), true);
check("the date is fixed, so two runs are identical", /^\d{4}-\d{2}-\d{2}$/.test(DEMO_TRIP.date), true);
check("...and is a real date", Number.isNaN(Date.parse(DEMO_TRIP.date)), false);
check("the direction is one the timetable has", DEMO_TRIP.direction, "southbound");
check("the demo starts with the modes we were picked for", DEMO_MODES.length, 3);
check("...including adventure", DEMO_MODES.includes("adventure"), true);
check("...learning", DEMO_MODES.includes("learning"), true);
check("...and creative", DEMO_MODES.includes("creative"), true);

// ── Starting and ending it, without losing anyone's work ──────────────────

{
  const storage = makeStorage();
  check("a fresh device starts the demo", startDemo(storage), true);
  check("...with the prepared trip", JSON.parse(storage.getItem(TRIP_KEY)!).boardId, DEMO_TRIP.boardId);
  check("...and the prepared modes", JSON.parse(storage.getItem(MODES_KEY)!).length, 3);
  check("...and a backup, even though there was nothing", storage.getItem(BACKUP_KEY) !== null, true);

  check("ending it restores", endDemo(storage), true);
  check("...leaving no trip, because there was none", storage.getItem(TRIP_KEY), null);
  check("...no modes either", storage.getItem(MODES_KEY), null);
  check("...and no backup left behind", storage.getItem(BACKUP_KEY), null);
  check("the device is exactly as it was", storage.size(), 0);
}

{
  // The case that matters: a teammate's own phone.
  const realTrip = JSON.stringify({ boardId: "kimberley", alightId: "worcester" });
  const realModes = JSON.stringify(["learning"]);
  const storage = makeStorage({ [TRIP_KEY]: realTrip, [MODES_KEY]: realModes });

  startDemo(storage);
  check("the demo takes over the trip", JSON.parse(storage.getItem(TRIP_KEY)!).boardId, "pretoria");
  endDemo(storage);
  check("their real trip comes back", storage.getItem(TRIP_KEY), realTrip);
  check("...and their real modes", storage.getItem(MODES_KEY), realModes);
  check("...with nothing extra left over", storage.size(), 2);
}

{
  // Navigating inside a demo re-runs this. It must not overwrite the backup
  // with the demo's own values, which would strand the real trip for good.
  const realTrip = JSON.stringify({ boardId: "de-aar", alightId: "cape-town" });
  const storage = makeStorage({ [TRIP_KEY]: realTrip });
  startDemo(storage);
  check("a second start does nothing", startDemo(storage), false);
  startDemo(storage);
  startDemo(storage);
  endDemo(storage);
  check("...and the real trip still comes back", storage.getItem(TRIP_KEY), realTrip);
}

{
  const storage = makeStorage({ [TRIP_KEY]: "mine" });
  check("ending a demo that never started changes nothing", endDemo(storage), false);
  check("...and leaves the trip alone", storage.getItem(TRIP_KEY), "mine");
}

{
  const storage = makeStorage({ [BACKUP_KEY]: "not json at all" });
  check("a corrupt backup is not a crash", endDemo(storage), false);
}

{
  // Private mode: every write throws.
  const hostile = {
    getItem: () => null,
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  check("a device that refuses storage still runs", startDemo(hostile), false);
  check("...and ending is survivable too", endDemo(hostile), false);
}

// ── The preload never sinks the demonstration ─────────────────────────────

{
  const urls = ["a", "b", "c", "d"];
  void preloadDemo(async () => undefined, urls).then(loaded => {
    check("every tile preloads when the venue wifi is good", loaded, 4);
  });
}

{
  const urls = ["a", "b", "c", "d"];
  void preloadDemo(async (url: string) => {
    if (url === "b" || url === "d") throw new Error("saturated wifi");
    return undefined;
  }, urls).then(loaded => {
    check("failures do not stop the others", loaded, 2);
  });
}

{
  void preloadDemo(async () => { throw new Error("no network at all"); }, ["a", "b"]).then(loaded => {
    check("a venue with no network preloads nothing and does not throw", loaded, 0);
  });
}

{
  void preloadDemo(async () => undefined, []).then(loaded => {
    check("nothing to preload is fine", loaded, 0);
  });
}

// ── Is this download still good? ──────────────────────────────────────────

const NOW = new Date("2026-09-22T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const manifest = (over: Partial<OfflineManifest> = {}): OfflineManifest => ({
  storedAt: daysAgo(1),
  buildId: "26092209",
  photos: 353,
  tiles: 412,
  ...over,
});

{
  const state = assessPackage(null, "26092209", NOW);
  check("no manifest means nothing downloaded", state.storedAt, null);
  check("...which is not 'stale'", state.stale, false);
  check("...and reports no contents", state.photos, 0);
}

{
  const state = assessPackage(manifest(), "26092209", NOW);
  check("yesterday's download is current", state.stale, false);
  check("...with no reason to give", state.staleReason, null);
  check("...and its age in days", state.ageDays, 1);
  check("...and what it holds", state.photos, 353);
  check("...including the map", state.tiles, 412);
}

{
  const state = assessPackage(manifest({ storedAt: daysAgo(STALE_AFTER_DAYS - 1) }), "26092209", NOW);
  check("a download just inside the window is current", state.stale, false);
}

{
  const state = assessPackage(manifest({ storedAt: daysAgo(STALE_AFTER_DAYS) }), "26092209", NOW);
  check("a download at the window is stale", state.stale, true);
  check("...and says how old it is", state.staleReason?.includes(String(STALE_AFTER_DAYS)), true);
}

{
  const state = assessPackage(manifest({ storedAt: daysAgo(120) }), "26092209", NOW);
  check("a download from a previous trip is stale", state.stale, true);
  check("...with its real age", state.ageDays, 120);
}

{
  // The important one: yesterday's download, but the app has been corrected.
  const state = assessPackage(manifest({ buildId: "26091508" }), "26092209", NOW);
  check("a download from an older build is stale however new it is", state.stale, true);
  check("...and says why, which is not its age", state.staleReason?.includes("updated"), true);
  check("...even though it is one day old", state.ageDays, 1);
}

{
  const state = assessPackage(manifest({ buildId: "unknown" }), "26092209", NOW);
  check("a package from before build stamps is judged on age alone", state.stale, false);
}

{
  const state = assessPackage(manifest({ storedAt: daysAgo(-1) }), "26092209", NOW);
  check("a clock skewed into the future is not called stale", state.stale, false);
}

check("the staleness window is about a trip, not a week", STALE_AFTER_DAYS >= 14 && STALE_AFTER_DAYS <= 90, true);

await new Promise(resolve => setTimeout(resolve, 0));

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
