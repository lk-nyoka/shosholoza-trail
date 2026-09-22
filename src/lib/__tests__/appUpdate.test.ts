/**
 * The update test.
 *
 * Every case here is one that actually stranded a passenger on an old build,
 * or would have:
 *
 *   - the worker that was already waiting when the page loaded, so no event
 *     ever fires;
 *   - the twenty-eight-hour session with no navigation, so nothing ever
 *     checks;
 *   - the tap that does nothing because `controllerchange` never arrives;
 *   - the check that throws because the train is in the Karoo.
 *
 * And the other half: that a migration or a reset never takes the passenger's
 * own work with it. That one is checked from both directions — the keys that
 * must survive, and the keys that must go.
 *
 *   npx esbuild src/lib/__tests__/appUpdate.test.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
 */
import {
  AppUpdate,
  CONTROLLER_TIMEOUT_MS,
  DATA_VERSION,
  DATA_VERSION_KEY,
  DISPOSABLE_PREFIXES,
  PRESERVED_KEYS,
  RESET_CONFIRM,
  RESET_DESCRIPTION,
  SKIP_WAITING,
  UPDATE_POLL_MS,
  migrateStorage,
  resetOfflineData,
  type StorageLike,
  type UpdatableRegistration,
  type UpdateHost,
  type UpdateState,
  type WaitingWorker,
} from "../appUpdate";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok =
    actual === expected ||
    (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 1e-9);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, wanted ${expected})`}`);
};

// ── A fake service worker, with a clock we drive ──────────────────────────

interface Fake {
  host: UpdateHost;
  reloads: () => number;
  messages: () => unknown[];
  updateCalls: () => number;
  fireControllerChange: () => void;
  advance: (ms: number) => void;
  setWaiting: (present: boolean) => void;
  failUpdates: (fail: boolean) => void;
}

const makeFake = (options: { waiting?: boolean } = {}): Fake => {
  const messages: unknown[] = [];
  let reloads = 0;
  let updateCalls = 0;
  let failing = false;
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; handler: () => void }>();
  const controllerListeners = new Set<() => void>();

  const worker: WaitingWorker = {
    postMessage(message) { messages.push(message); },
    addEventListener() {},
    state: "installed",
  };

  const registration: UpdatableRegistration = {
    waiting: options.waiting ? worker : null,
    update() {
      updateCalls += 1;
      return failing ? Promise.reject(new Error("offline")) : Promise.resolve(null);
    },
  };

  const host: UpdateHost = {
    registration,
    onControllerChange(listener) {
      controllerListeners.add(listener);
      return () => controllerListeners.delete(listener);
    },
    reload() { reloads += 1; },
    setTimeout(handler, ms) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, handler });
      return handle;
    },
    clearTimeout(handle) { timers.delete(handle); },
  };

  return {
    host,
    reloads: () => reloads,
    messages: () => messages,
    updateCalls: () => updateCalls,
    fireControllerChange: () => { for (const listener of [...controllerListeners]) listener(); },
    advance(ms) {
      /*
       * Step the clock to each timer's due time rather than jumping straight
       * to the end.
       *
       * A repeating timer re-schedules itself from the clock as it stands
       * when it fires. Jumping three hours in one go and then firing what is
       * due would run one tick, which would then schedule its successor three
       * hours in the future - so three hours of journey would produce one
       * check instead of three, and the test would be measuring the fake
       * rather than the code.
       */
      const target = now + ms;
      for (let guard = 0; guard < 10_000; guard += 1) {
        let nextAt = Infinity;
        let nextHandleDue: number | null = null;
        for (const [handle, timer] of timers) {
          if (timer.at <= target && timer.at < nextAt) {
            nextAt = timer.at;
            nextHandleDue = handle;
          }
        }
        if (nextHandleDue === null) break;
        const timer = timers.get(nextHandleDue)!;
        timers.delete(nextHandleDue);
        now = timer.at;
        timer.handler();
      }
      now = target;
    },
    setWaiting(present) { registration.waiting = present ? worker : null; },
    failUpdates(fail) { failing = fail; },
  };
};

// ── Detecting an update ───────────────────────────────────────────────────

{
  const fake = makeFake({ waiting: true });
  const app = new AppUpdate(fake.host);
  check("a worker waiting before the page loaded is found", app.detectWaiting(), true);
  check("...and the state says so", app.current().status, "available");
}

{
  const fake = makeFake();
  const app = new AppUpdate(fake.host);
  check("no waiting worker means nothing to offer", app.detectWaiting(), false);
  check("...and the state stays current", app.current().status, "current");
}

{
  const fake = makeFake();
  const app = new AppUpdate(fake.host);
  const seen: UpdateState["status"][] = [];
  app.subscribe(state => seen.push(state.status));
  check("a subscriber is told the state at once", seen[0], "current");
  app.markAvailable();
  check("...and again when it changes", seen[1], "available");
  app.markAvailable();
  check("...but not twice for the same state", seen.length, 2);
}

// ── The long journey: nothing navigates for twenty-eight hours ────────────

{
  const fake = makeFake();
  const app = new AppUpdate(fake.host);
  app.start();
  check("nothing is checked before the first interval", fake.updateCalls(), 0);
  fake.advance(UPDATE_POLL_MS);
  check("the first check happens on the hour", fake.updateCalls(), 1);
  fake.advance(UPDATE_POLL_MS * 3);
  check("...and keeps happening", fake.updateCalls(), 4);
  check("a 28-hour journey would check 28 times", Math.floor((28 * 3600_000) / UPDATE_POLL_MS), 28);
  app.stop();
}

{
  const fake = makeFake();
  const app = new AppUpdate(fake.host);
  app.start();
  fake.setWaiting(true);
  fake.advance(UPDATE_POLL_MS);
  // The poll is async; the detect runs after the promise settles.
  void Promise.resolve().then(() => {
    check("a build shipped mid-journey is found by the poll", app.current().status, "available");
  });
  app.stop();
}

{
  const fake = makeFake();
  fake.failUpdates(true);
  const app = new AppUpdate(fake.host);
  let threw = false;
  void app.check().catch(() => { threw = true; });
  void Promise.resolve().then(() => {
    check("a check in the Karoo fails silently", threw, false);
    check("...and leaves the app usable", app.current().status, "current");
  });
}

{
  const app = new AppUpdate({
    registration: null,
    onControllerChange: () => () => {},
    reload() {},
    setTimeout: () => 1,
    clearTimeout() {},
  });
  check("no registration at all is not a crash", app.detectWaiting(), false);
  void app.check();
}

// ── Applying it ───────────────────────────────────────────────────────────

{
  const fake = makeFake({ waiting: true });
  const app = new AppUpdate(fake.host);
  app.detectWaiting();
  app.apply();
  check("applying tells the waiting worker to take over", fake.messages().length, 1);
  check("...with the message the worker listens for", (fake.messages()[0] as { type: string }).type, SKIP_WAITING.type);
  check("...and does not reload until it has", fake.reloads(), 0);
  check("...while saying what it is doing", app.current().status, "applying");
  fake.fireControllerChange();
  check("the handover reloads the page", fake.reloads(), 1);
  fake.fireControllerChange();
  check("...exactly once", fake.reloads(), 1);
}

{
  const fake = makeFake({ waiting: true });
  const app = new AppUpdate(fake.host);
  app.apply();
  fake.advance(CONTROLLER_TIMEOUT_MS - 1);
  check("it waits for the handover first", fake.reloads(), 0);
  fake.advance(2);
  check("a handover that never comes still reloads", fake.reloads(), 1);
  fake.fireControllerChange();
  check("...and the late event does not reload again", fake.reloads(), 1);
}

{
  const fake = makeFake();
  const app = new AppUpdate(fake.host);
  app.apply();
  check("applying with nothing waiting sends no message", fake.messages().length, 0);
  fake.fireControllerChange();
  check("...but still reloads, because what is on screen is stale", fake.reloads(), 1);
}

{
  const fake = makeFake({ waiting: true });
  const app = new AppUpdate(fake.host);
  app.apply();
  app.apply();
  app.apply();
  check("a passenger tapping three times only applies once", fake.messages().length, 1);
  fake.fireControllerChange();
  check("...and reloads once", fake.reloads(), 1);
}

{
  const fake = makeFake({ waiting: true });
  const app = new AppUpdate(fake.host);
  app.apply();
  app.markAvailable();
  check("a late 'available' cannot interrupt an apply", app.current().status, "applying");
}

check("the handover timeout is generous but not a hang", CONTROLLER_TIMEOUT_MS >= 1500 && CONTROLLER_TIMEOUT_MS <= 5000, true);
check("the poll is hourly", UPDATE_POLL_MS, 3_600_000);

// ── Migration: the passenger's work survives ──────────────────────────────

const makeStorage = (entries: Record<string, string>): StorageLike & { all: () => Record<string, string> } => {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem(key, value) { map.set(key, value); },
    removeItem(key) { map.delete(key); },
    all: () => Object.fromEntries(map),
  };
};

{
  const storage = makeStorage({
    "st.trip.v1": "{}",
    "st.experiences.work.v1": "my verse",
    "st.experiences.done.v1": "[\"first-song\"]",
    "st.modes.v2": "[]",
    "st.outbox.v1": "[1]",
    "st.cache.tiles": "junk",
    "st.tiles.index": "junk",
    "st.timetable.v1": "stale",
    "unrelated.key": "someone else's",
  });
  const result = migrateStorage(storage);
  check("a device with no version marker is migrated", result.migrated, true);
  check("...from nothing", result.from, null);
  check("...to this build's version", result.to, DATA_VERSION);
  check("the marker is written", storage.getItem(DATA_VERSION_KEY), String(DATA_VERSION));

  check("the trip survives", storage.getItem("st.trip.v1"), "{}");
  check("what they wrote survives", storage.getItem("st.experiences.work.v1"), "my verse");
  check("their stamps survive", storage.getItem("st.experiences.done.v1"), "[\"first-song\"]");
  check("their modes survive", storage.getItem("st.modes.v2"), "[]");
  check("unsent work survives", storage.getItem("st.outbox.v1"), "[1]");

  check("cached tiles are dropped", storage.getItem("st.cache.tiles"), null);
  check("the tile index is dropped", storage.getItem("st.tiles.index"), null);
  check("a stale timetable is dropped", storage.getItem("st.timetable.v1"), null);
  check("another app's key is left alone", storage.getItem("unrelated.key"), "someone else's");
  check("the cleared list is accurate", result.cleared.length, 3);
}

{
  const storage = makeStorage({ [DATA_VERSION_KEY]: String(DATA_VERSION), "st.cache.tiles": "keep" });
  const result = migrateStorage(storage);
  check("an up-to-date device is not migrated", result.migrated, false);
  check("...and nothing is touched", storage.getItem("st.cache.tiles"), "keep");
}

{
  const storage = makeStorage({ [DATA_VERSION_KEY]: "not a number", "st.cache.x": "junk" });
  const result = migrateStorage(storage);
  check("a corrupt marker is treated as unversioned", result.from, null);
  check("...and the migration runs", result.migrated, true);
  check("...clearing what it should", storage.getItem("st.cache.x"), null);
}

{
  const storage = makeStorage({ "st.something.new": "from a newer build" });
  migrateStorage(storage);
  check("an unknown st. key is kept, not guessed at", storage.getItem("st.something.new"), "from a newer build");
}

{
  const storage = makeStorage({});
  const result = migrateStorage(storage);
  check("a brand new device migrates without error", result.migrated, true);
  check("...and is marked current", storage.getItem(DATA_VERSION_KEY), String(DATA_VERSION));
}

check("every preserved key is one this app writes", PRESERVED_KEYS.every(key => key.startsWith("st.")), true);
check("the preserved list covers the creative work", PRESERVED_KEYS.includes("st.experiences.work.v1"), true);
check("...and the stamps", PRESERVED_KEYS.includes("st.experiences.done.v1"), true);
check("...and the trip", PRESERVED_KEYS.includes("st.trip.v1"), true);
check("...and the outbox", PRESERVED_KEYS.includes("st.outbox.v1"), true);
check(
  "no preserved key is also disposable",
  PRESERVED_KEYS.every(key => !DISPOSABLE_PREFIXES.some(prefix => key.startsWith(prefix))),
  true,
);

// ── Reset ─────────────────────────────────────────────────────────────────

const makeCaches = (names: string[], refuse: string[] = []) => {
  let remaining = [...names];
  return {
    store: () => remaining,
    api: {
      keys: async () => [...remaining],
      delete: async (name: string) => {
        if (refuse.includes(name)) throw new Error("refused");
        const had = remaining.includes(name);
        remaining = remaining.filter(entry => entry !== name);
        return had;
      },
    },
  };
};

{
  const caches = makeCaches(["workbox-precache", "st-imagery", "st-vector"]);
  const storage = makeStorage({ "st.trip.v1": "{}", "st.cache.tiles": "junk", "st.experiences.work.v1": "mine" });
  void resetOfflineData(caches.api, storage).then(result => {
    check("every cache is cleared", result.caches.length, 3);
    check("...and really gone", caches.store().length, 0);
    check("the trip is untouched", storage.getItem("st.trip.v1"), "{}");
    check("what they wrote is untouched", storage.getItem("st.experiences.work.v1"), "mine");
    check("the derived cache key is cleared", storage.getItem("st.cache.tiles"), null);
    check("...and reported", result.storageKeys.length, 1);
  });
}

{
  const caches = makeCaches(["a", "b", "c"], ["b"]);
  void resetOfflineData(caches.api, null).then(result => {
    check("one cache refusing does not stop the others", result.caches.length, 2);
    check("...and the stubborn one is left", caches.store().join(","), "b");
  });
}

{
  void resetOfflineData(null, null).then(result => {
    check("a browser with no cache API is not an error", result.caches.length, 0);
    check("...nor is no storage", result.storageKeys.length, 0);
  });
}

{
  const broken = {
    keys: async () => { throw new Error("denied"); },
    delete: async () => true,
  };
  void resetOfflineData(broken, null).then(result => {
    check("a cache API that refuses to list is survivable", result.caches.length, 0);
  });
}

// The wording is the safety mechanism, so it is asserted like one.
check("the reset explains what it keeps", RESET_DESCRIPTION.includes("stay on this device"), true);
check("...and names the writing", RESET_DESCRIPTION.includes("written"), true);
check("...and the stamps", RESET_DESCRIPTION.includes("stamps"), true);
check("the confirmation says a connection is needed after", RESET_CONFIRM.includes("connection"), true);
check("the confirmation is a question", RESET_CONFIRM.trim().includes("?"), true);

// Everything above that runs in a promise has to settle before the count.
await Promise.resolve();
await Promise.resolve();
await new Promise(resolve => setTimeout(resolve, 0));

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
