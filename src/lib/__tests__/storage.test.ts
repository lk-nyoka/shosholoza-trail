/**
 * What the passenger's own device keeps, and what "delete everything" means.
 *
 * Two release gates depend on this file and neither can be checked by reading
 * the code: that choosing no journey modes stays no journey modes across a
 * reload, and that the deletion control really does empty every namespace the
 * app writes to. Both have silently regressed before.
 *
 * Run: npx esbuild src/lib/__tests__/storage.test.ts --bundle --platform=node \
 *        --format=cjs --outfile=/tmp/s.cjs && node /tmp/s.cjs
 */
import { savedModes, saveModes, modesChosen } from "../modes";
import { eraseEverything } from "../erase";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${a}, wanted ${e})`}`);
}

class MemoryStore {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  get length() { return this.map.size; }
  keys() { return [...this.map.keys()]; }
}

// Object.keys(store) is what erase.ts iterates, so the stub has to expose the
// keys as own properties the way a real Storage does.
function store(): Storage {
  const s = new MemoryStore();
  return new Proxy(s as unknown as Storage, {
    ownKeys: () => (s as unknown as MemoryStore).keys(),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

const local = store(), session = store();
const deleted: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: local,
  sessionStorage: session,
  caches: {
    keys: async () => ["st-imagery-v1", "workbox-precache"],
    delete: async (n: string) => { deleted.push(n); return true; },
  },
};
// erase.ts reads `caches` and `navigator` as globals, window.localStorage as a member.
(globalThis as unknown as Record<string, unknown>).caches = (globalThis as any).window.caches;

// ── Journey modes ───────────────────────────────────────────────────────────
check("nothing chosen yet → all three modes", savedModes(), ["adventure", "creative", "networking"]);
check("nothing chosen yet → onboarding still asks", modesChosen(), false);

saveModes(["adventure"]);
check("one mode persists", savedModes(), ["adventure"]);
check("choosing marks onboarding done", modesChosen(), true);

saveModes(["adventure", "networking"]);
check("two modes persist", savedModes(), ["adventure", "networking"]);

saveModes([]);
check("zero modes stays zero modes", savedModes(), []);
check("zero modes still counts as chosen", modesChosen(), true);

local.setItem("st.modes.v2", '["adventure","not-a-mode",7]');
check("junk values are dropped, valid ones kept", savedModes(), ["adventure"]);
local.setItem("st.modes.v2", "{not json");
check("unparseable storage falls back, does not throw", savedModes(), ["adventure", "creative", "networking"]);

// ── Delete everything ───────────────────────────────────────────────────────
saveModes(["creative"]);
local.setItem("st.passenger.v1", '{"name":"Lindokuhle"}');
local.setItem("st.trip.v1", "{}");
local.setItem("st.reservations.v1", "[]");
local.setItem("st.location-consent.v1", "granted");
local.setItem("st.outbox.v1", "[]");
local.setItem("shosholoza.session", "5f0c-…-uuid");
local.setItem("shosholoza.saved-places.v1", '["big-hole"]');
session.setItem("st.demo.v1", "1");
local.setItem("theme-from-another-app", "keep me");

const result = await eraseEverything();

check("every app key removed", (local as any).length, 1);
check("an unrelated key is left alone", local.getItem("theme-from-another-app"), "keep me");
check("session storage cleared too", (session as any).length, 0);
check("telemetry session identifier is gone", local.getItem("shosholoza.session"), null);
check("saved places are gone", local.getItem("shosholoza.saved-places.v1"), null);
check("passenger record is gone", local.getItem("st.passenger.v1"), null);
check("offline caches deleted", deleted, ["st-imagery-v1", "workbox-precache"]);
check("count reported back to the passenger", result.keysRemoved, 9);
check("caches reported back to the passenger", result.cachesRemoved, 2);
check("modes are back to the default after erasure", savedModes(), ["adventure", "creative", "networking"]);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
// Thrown rather than process.exit so this file needs no Node types: an uncaught
// error still leaves a non-zero exit code for the runner and for CI.
if (failures) throw new Error(`${failures} assertion(s) failed`);
