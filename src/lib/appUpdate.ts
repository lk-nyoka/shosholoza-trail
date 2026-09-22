/**
 * Getting a new build onto a passenger's phone, reliably.
 *
 * The app was configured with `registerType: "prompt"` — the new worker waits
 * until the passenger says so, which is the right call for somebody mid-page
 * on a train. But nothing in the app ever asked them. The plugin's injected
 * `registerSW.js` registers the worker and stops there, so a new build
 * installed, moved to `waiting`, and sat there for the rest of the
 * installation's life. A fix shipped on Friday would reach a phone that had
 * used the app once, in September, never.
 *
 * Four failure modes have to be covered, not one:
 *
 *   1. The update arrives while the page is open — `onNeedRefresh`.
 *   2. The update was already waiting before the page loaded — nothing fires,
 *      so `registration.waiting` has to be checked on registration.
 *   3. The page has been open for hours without a reload, which on a
 *      twenty-eight-hour journey is the normal case — so the registration is
 *      polled, and checked again whenever the tab comes back to the front or
 *      the connection returns.
 *   4. The passenger taps "Reload" and nothing happens, because `skipWaiting`
 *      raced the reload. The reload is driven by `controllerchange`, once,
 *      with a timeout that reloads anyway if the event never comes.
 *
 * Everything here is a pure state machine over a small slice of the service
 * worker API, injected rather than reached for, so the whole thing is
 * testable without a browser.
 */

// ── The slice of the platform this needs ──────────────────────────────────

export interface WaitingWorker {
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  state?: string;
}

export interface UpdatableRegistration {
  waiting: WaitingWorker | null;
  installing?: WaitingWorker | null;
  update(): Promise<unknown>;
  addEventListener?(type: "updatefound", listener: () => void): void;
}

export interface UpdateHost {
  /** Ask the browser to re-check for a new worker. */
  registration: UpdatableRegistration | null;
  /** Fires when the new worker takes control. */
  onControllerChange(listener: () => void): () => void;
  /** Reload the page. Separated out so a test can count the calls. */
  reload(): void;
  /** `setTimeout`, injected so a test does not have to wait. */
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export type UpdateState =
  | { status: "current" }
  | { status: "available" }
  | { status: "applying" };

export const SKIP_WAITING = { type: "SKIP_WAITING" } as const;

/**
 * How long to wait for `controllerchange` before reloading anyway.
 *
 * A reload that does not happen is worse than a reload that happens without
 * the handshake: the passenger tapped a button and the app did nothing, so
 * they conclude the update is broken. Three seconds is far longer than the
 * handshake takes and short enough not to read as a hang.
 */
export const CONTROLLER_TIMEOUT_MS = 3000;

/**
 * How often to ask the browser whether there is a new build.
 *
 * Every hour. The journey is twenty-eight hours and the app is meant to stay
 * open for it; a check costs one conditional request for a file that is
 * usually 304, and on a phone with no signal it fails silently and is retried
 * at the next opportunity.
 */
export const UPDATE_POLL_MS = 60 * 60 * 1000;

export class AppUpdate {
  private state: UpdateState = { status: "current" };
  private listeners = new Set<(state: UpdateState) => void>();
  private disposers: (() => void)[] = [];
  private timer: number | null = null;

  constructor(private host: UpdateHost) {}

  current(): UpdateState {
    return this.state;
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private set(state: UpdateState) {
    if (state.status === this.state.status) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** The update is here — from `onNeedRefresh`, or from our own check. */
  markAvailable() {
    if (this.state.status === "applying") return;
    this.set({ status: "available" });
  }

  /**
   * Look for a worker that is already waiting.
   *
   * This is case 2, and it is the one the plugin's own callbacks miss: if the
   * new build installed during a previous visit, no event fires on this one.
   */
  detectWaiting(): boolean {
    const waiting = this.host.registration?.waiting ?? null;
    if (!waiting) return false;
    this.markAvailable();
    return true;
  }

  /** Ask the browser to check. Never throws — offline is the normal case. */
  async check(): Promise<void> {
    try {
      await this.host.registration?.update();
    } catch {
      /* No signal, or the server is unreachable. Try again next time. */
    }
    this.detectWaiting();
  }

  /**
   * Apply the waiting update and reload, once.
   *
   * If there is no waiting worker — the passenger tapped an update that has
   * since been applied in another tab — this still reloads, because the state
   * they are looking at is stale either way.
   */
  apply(): void {
    if (this.state.status === "applying") return;
    this.set({ status: "applying" });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (this.timer !== null) {
        this.host.clearTimeout(this.timer);
        this.timer = null;
      }
      stopListening();
      this.host.reload();
    };

    const stopListening = this.host.onControllerChange(finish);
    this.timer = this.host.setTimeout(finish, CONTROLLER_TIMEOUT_MS);

    const waiting = this.host.registration?.waiting;
    if (waiting) waiting.postMessage(SKIP_WAITING);
  }

  /** Start polling and watching. Returns a disposer. */
  start(): () => void {
    this.detectWaiting();
    const tick = () => {
      void this.check();
      this.timer = this.host.setTimeout(tick, UPDATE_POLL_MS);
    };
    this.timer = this.host.setTimeout(tick, UPDATE_POLL_MS);
    return () => this.stop();
  }

  stop(): void {
    if (this.timer !== null) {
      this.host.clearTimeout(this.timer);
      this.timer = null;
    }
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.listeners.clear();
  }
}

// ── Offline data versioning ───────────────────────────────────────────────

/**
 * The version of the data this build writes to the device.
 *
 * Raise it when a stored shape changes in a way an older reader cannot
 * understand. The caches are then rebuilt — but the passenger's own content
 * is carried across, because losing it is not a cache miss, it is losing the
 * thing they made on a train with no signal.
 */
export const DATA_VERSION = 3;
export const DATA_VERSION_KEY = "st.data.version";

/**
 * Keys that hold the passenger's own journey and creative work.
 *
 * These survive every migration and every "reset offline data". Deleting them
 * is a separate, explicit act — `eraseEverything` in `erase.ts`, which says
 * plainly what it is about to remove.
 */
export const PRESERVED_KEYS = [
  "st.trip.v1",            // which leg of the line is theirs
  "st.experiences.done.v1", // stamps they have earned
  "st.experiences.work.v1", // what they wrote and drew
  "st.modes.v2",           // the modes they chose
  "st.passenger.v1",       // their name on the journey
  "st.reservations.v1",    // seats they hold
  "st.outbox.v1",          // work not yet sent, which is the whole point offline
] as const;

/** Keys a migration may drop: derived, re-fetchable, or build-specific. */
export const DISPOSABLE_PREFIXES = ["st.cache.", "st.tiles.", "st.timetable."] as const;

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MigrationResult {
  from: number | null;
  to: number;
  migrated: boolean;
  preserved: string[];
  cleared: string[];
}

/**
 * Bring stored data up to this build's version.
 *
 * The rule is stated once, here, rather than being decided key by key at some
 * later date: the passenger's content is preserved, everything derived is
 * dropped and rebuilt. A missing version marker means a device from before
 * versioning existed, which is treated as an old version rather than a new
 * one — the safe direction.
 */
export function migrateStorage(storage: StorageLike): MigrationResult {
  const raw = storage.getItem(DATA_VERSION_KEY);
  const from = raw === null ? null : Number.parseInt(raw, 10);
  const known = from !== null && Number.isFinite(from) ? from : null;

  if (known === DATA_VERSION) {
    return { from: known, to: DATA_VERSION, migrated: false, preserved: [], cleared: [] };
  }

  const preserved: string[] = [];
  const cleared: string[] = [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }

  for (const key of keys) {
    if (key === DATA_VERSION_KEY) continue;
    if ((PRESERVED_KEYS as readonly string[]).includes(key)) {
      preserved.push(key);
      continue;
    }
    if (DISPOSABLE_PREFIXES.some(prefix => key.startsWith(prefix))) {
      storage.removeItem(key);
      cleared.push(key);
      continue;
    }
    // Anything else this app owns but does not name is left alone: an unknown
    // `st.` key is far more likely to be something a newer build wrote than
    // something safe to delete.
    if (key.startsWith("st.")) preserved.push(key);
  }

  storage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
  return { from: known, to: DATA_VERSION, migrated: true, preserved, cleared };
}

/**
 * What "Reset offline data" removes, and what it does not.
 *
 * It clears the downloaded route — tiles, imagery, the precached shell — so a
 * passenger whose download is corrupt or out of date can start again. It does
 * not touch their trip, their stamps or their writing. The Help page says
 * exactly this next to the button, because a destructive control whose scope
 * is unclear is a control nobody dares press.
 */
export const RESET_DESCRIPTION =
  "Clears the downloaded map and route data so it can be fetched again. " +
  "Your trip, your stamps and anything you have written stay on this device.";

export const RESET_CONFIRM =
  "Clear the downloaded route data? You will need a connection to download it again.";

export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface ResetResult {
  caches: string[];
  storageKeys: string[];
}

/**
 * Drop every cache and every disposable key, keeping the passenger's content.
 *
 * Failures are swallowed per item rather than aborting: a browser that
 * refuses to delete one cache should not leave the other nine in place.
 */
export async function resetOfflineData(
  caches: CacheStorageLike | null,
  storage: StorageLike | null,
): Promise<ResetResult> {
  const removed: string[] = [];
  if (caches) {
    let names: string[] = [];
    try {
      names = await caches.keys();
    } catch {
      names = [];
    }
    for (const name of names) {
      try {
        if (await caches.delete(name)) removed.push(name);
      } catch {
        /* Leave it; the rest still go. */
      }
    }
  }

  const clearedKeys: string[] = [];
  if (storage) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      if ((PRESERVED_KEYS as readonly string[]).includes(key)) continue;
      if (!DISPOSABLE_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
      try {
        storage.removeItem(key);
        clearedKeys.push(key);
      } catch {
        /* Quota or private mode; nothing to do about it here. */
      }
    }
  }

  return { caches: removed, storageKeys: clearedKeys };
}

// ── The browser wiring ────────────────────────────────────────────────────

/** The real host, built from `navigator.serviceWorker`. */
export function browserHost(registration: UpdatableRegistration | null): UpdateHost {
  return {
    registration,
    onControllerChange(listener) {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return () => {};
      }
      const container = navigator.serviceWorker;
      container.addEventListener("controllerchange", listener);
      return () => container.removeEventListener("controllerchange", listener);
    },
    reload() {
      if (typeof window !== "undefined") window.location.reload();
    },
    setTimeout: (handler, ms) => window.setTimeout(handler, ms),
    clearTimeout: handle => window.clearTimeout(handle),
  };
}
