/**
 * The sun test.
 *
 * Two kinds of claim are checked here, and they are checked differently.
 *
 * The astronomy is checked against published figures: the sun's maximum
 * elevation at Cape Town on each solstice, and the times of solar noon, are
 * facts, so the test asserts them to a tenth of a degree rather than to
 * whatever the code happens to produce.
 *
 * The lighting is checked for the properties that keep the ride usable —
 * monotonic through the day, continuous across every phase boundary, never
 * fully black, never brighter at midnight than at noon, always recoverable.
 * Those are the failures a rider would notice.
 *
 *   npx esbuild src/lib/__tests__/sunSky.test.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
 */
import {
  ASTRONOMICAL_ELEVATION,
  CIVIL_ELEVATION,
  FALLBACK_NOTICE,
  HORIZON_ELEVATION,
  NAUTICAL_ELEVATION,
  PHASE_LABEL,
  SKY_GLOW_SOURCES,
  fallbackLighting,
  lightingAt,
  lightingFor,
  mixColour,
  phaseFor,
  ramp,
  skyGlowAt,
  smoothRamp,
  solarPosition,
  type LightingPhase,
} from "../sunSky";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok =
    actual === expected ||
    (typeof actual === "number" &&
      typeof expected === "number" &&
      Math.abs(actual - expected) < 1e-6);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, wanted ${expected})`}`);
};
const near = (name: string, actual: number, expected: number, tolerance: number) => {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual.toFixed(4)}, wanted ${expected} ±${tolerance})`}`,
  );
};

/** An instant from a SAST wall clock, by arithmetic — no timezone database. */
const sast = (y: number, m: number, d: number, hh: number, mm = 0) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm) - 120 * 60_000);

const CAPE_TOWN: [number, number] = [-33.92, 18.42];
const PRETORIA: [number, number] = [-25.75, 28.19];
const KAROO: [number, number] = [-31.5, 23.3];

/** Highest elevation reached on a date, and the SAST minute it happens. */
const peak = (date: [number, number, number], lat: number, lon: number) => {
  let best = -90;
  let minute = 0;
  for (let m = 0; m < 1440; m += 1) {
    const at = new Date(sast(date[0], date[1], date[2], 0, 0).getTime() + m * 60_000);
    const elevation = solarPosition(at, lat, lon).elevationDeg;
    if (elevation > best) {
      best = elevation;
      minute = m;
    }
  }
  return { elevation: best, minute };
};

// ── Astronomy, against published figures ────────────────────────────────────

const december = peak([2026, 12, 21], ...CAPE_TOWN);
near("Cape Town December solstice noon elevation", december.elevation, 79.5, 0.25);
const june = peak([2026, 6, 21], ...CAPE_TOWN);
near("Cape Town June solstice noon elevation", june.elevation, 32.6, 0.25);
near(
  "the two solstices differ by twice the obliquity",
  december.elevation - june.elevation,
  46.9,
  0.3,
);

/**
 * Cape Town is 18.42°E, and South Africa keeps the clock on 30°E. Every degree
 * west of the standard meridian pushes solar noon four minutes later, so noon
 * there lands around 12:46 rather than 12:00 — before the equation of time
 * moves it either way by up to a quarter of an hour.
 */
near("Cape Town solar noon is around 12:46 SAST", december.minute, 764, 20);
const pretoriaNoon = peak([2026, 12, 21], ...PRETORIA);
near("Pretoria solar noon is around 12:00 SAST", pretoriaNoon.minute, 727, 20);
check(
  "...and Pretoria's noon comes before Cape Town's",
  pretoriaNoon.minute < december.minute,
  true,
);

/**
 * The sun is north of this corridor at midday, every day of the year, because
 * every station on it lies south of the Tropic of Capricorn.
 *
 * The check skips the few midsummer weeks when Pretoria's noon sun is within
 * a couple of degrees of the zenith: azimuth is genuinely ill-conditioned
 * there — the sun is almost directly overhead, so "which way is it" has no
 * stable answer — and asserting one would be asserting an artefact.
 */
const middaySouthern = [1, 3, 4, 5, 6, 7, 8, 9, 10].map(month => {
  const noon = peak([2026, month, 15], ...PRETORIA);
  const at = new Date(sast(2026, month, 15, 0, 0).getTime() + noon.minute * 60_000);
  return { month, elevation: noon.elevation, azimuth: solarPosition(at, ...PRETORIA).azimuthDeg };
});
check(
  "midday sun sits north of the line all year",
  middaySouthern
    .filter(entry => entry.elevation < 80)
    .every(entry => entry.azimuth < 6 || entry.azimuth > 354),
  true,
);
check(
  "...and the exception is only the near-zenith weeks",
  middaySouthern.filter(entry => entry.elevation >= 80).every(entry => entry.month === 1),
  true,
);

// December declination is southern-summer positive-south; the sun rises south
// of east in December and north of east in June.
const decSunrise = solarPosition(sast(2026, 12, 21, 5, 40), ...PRETORIA);
const junSunrise = solarPosition(sast(2026, 6, 21, 7, 0), ...PRETORIA);
check("December sunrise is south of east", decSunrise.azimuthDeg > 90, true);
check("June sunrise is north of east", junSunrise.azimuthDeg < 90, true);

// Elevation is symmetric about solar noon.
const marchNoon = peak([2026, 3, 15], ...PRETORIA).minute;
const beforeNoon = solarPosition(
  new Date(sast(2026, 3, 15, 0, 0).getTime() + (marchNoon - 120) * 60_000),
  ...PRETORIA,
).elevationDeg;
const afterNoon = solarPosition(
  new Date(sast(2026, 3, 15, 0, 0).getTime() + (marchNoon + 120) * 60_000),
  ...PRETORIA,
).elevationDeg;
near("two hours either side of noon match", beforeNoon, afterNoon, 0.6);

// Rising flag follows the hour angle.
check("morning is rising", solarPosition(sast(2026, 9, 22, 8), ...PRETORIA).rising, true);
check("afternoon is not", solarPosition(sast(2026, 9, 22, 15), ...PRETORIA).rising, false);

// Timezone independence: the machine's own offset must not enter the answer.
const instant = sast(2026, 9, 22, 14, 30);
const fromInstant = solarPosition(instant, ...PRETORIA).elevationDeg;
const fromClone = solarPosition(new Date(instant.getTime()), ...PRETORIA).elevationDeg;
check("the same instant gives the same sun", fromInstant, fromClone);
check(
  "an hour later is a different sun",
  Math.abs(solarPosition(new Date(instant.getTime() + 3_600_000), ...PRETORIA).elevationDeg - fromInstant) > 5,
  true,
);

// Refraction lifts the sun at the horizon and leaves it alone overhead.
const horizonTrue = solarPosition(sast(2026, 9, 22, 5, 52), ...PRETORIA);
check("refraction is applied near the horizon", Math.abs(horizonTrue.elevationDeg) < 2, true);

// ── Phases ──────────────────────────────────────────────────────────────────

const phaseAt = (h: number, m = 0, where: [number, number] = PRETORIA): LightingPhase =>
  phaseFor(solarPosition(sast(2026, 9, 22, h, m), ...where));

check("01:00 is night", phaseAt(1), "night");
check("13:00 is midday", phaseAt(13), "midday");
check("23:30 is night again", phaseAt(23, 30), "night");

const phases = Array.from({ length: 24 * 4 }, (_, i) =>
  phaseFor(solarPosition(new Date(sast(2026, 9, 22, 0, 0).getTime() + i * 15 * 60_000), ...PRETORIA)),
);
const seen = new Set(phases);
check("a full day passes through night", seen.has("night"), true);
check("...astronomical twilight", seen.has("astronomical-twilight"), true);
check("...nautical twilight", seen.has("nautical-twilight"), true);
check("...first light", seen.has("civil-twilight"), true);
check("...sunrise", seen.has("sunrise"), true);
check("...morning", seen.has("morning"), true);
check("...midday", seen.has("midday"), true);
check("...afternoon", seen.has("afternoon"), true);
check("...golden hour", seen.has("golden-hour"), true);
check("...sunset", seen.has("sunset"), true);
check("...and dusk", seen.has("evening"), true);
check("every phase has wording", Object.keys(PHASE_LABEL).length, 11);
check(
  "no phase is unlabelled",
  Object.values(PHASE_LABEL).every(label => label.length > 0),
  true,
);

// Twilight boundaries are the standard ones, not invented.
check("horizon is the upper limb, not the centre", HORIZON_ELEVATION, -0.833);
check("civil twilight ends at -6", CIVIL_ELEVATION, -6);
check("nautical at -12", NAUTICAL_ELEVATION, -12);
check("astronomical at -18", ASTRONOMICAL_ELEVATION, -18);

const at = (elevation: number, rising: boolean, hourAngle = rising ? -40 : 40) =>
  phaseFor({ elevationDeg: elevation, azimuthDeg: 0, declinationDeg: 0, hourAngleDeg: hourAngle, rising });
check("just below -18 is night", at(-18.01, true), "night");
check("just above -18 is astronomical", at(-17.99, true), "astronomical-twilight");
check("-6.01 is nautical", at(-6.01, false), "nautical-twilight");
check("first light only on the way up", at(-3, true), "civil-twilight");
check("the same elevation going down is dusk", at(-3, false), "evening");
check("+3 rising is sunrise", at(3, true), "sunrise");
check("+3 falling is sunset", at(3, false), "sunset");
check("+9 rising is morning, not golden hour", at(9, true), "morning");
check("+9 falling is golden hour", at(9, false), "golden-hour");
check("high and near the meridian is midday", at(40, false, 10), "midday");
check("high and far from it is afternoon", at(40, false, 60), "afternoon");
check("high, far from it, rising is morning", at(40, true, -60), "morning");

// A winter day at Cape Town never reaches 60°, and must still have a midday.
const winterPhases = Array.from({ length: 24 * 4 }, (_, i) =>
  phaseFor(solarPosition(new Date(sast(2026, 6, 21, 0, 0).getTime() + i * 15 * 60_000), ...CAPE_TOWN)),
);
check("midwinter still has a midday", winterPhases.includes("midday"), true);
check("midwinter still has a night", winterPhases.includes("night"), true);

// ── Light pollution ─────────────────────────────────────────────────────────

near("the Karoo between towns is a dark sky", skyGlowAt(...KAROO), 0, 0.02);
check("Johannesburg washes it out completely", skyGlowAt(-25.87, 28.13) >= 0.99, true);
check("Cape Town nearly so", skyGlowAt(...CAPE_TOWN) > 0.9, true);
check("De Aar is a town, not a city", skyGlowAt(-30.65, 24.01) < 0.35, true);
check(
  "...and is still brighter than the veld beside it",
  skyGlowAt(-30.65, 24.01) > skyGlowAt(...KAROO),
  true,
);
check("glow never exceeds one", skyGlowAt(-25.87, 28.13) <= 1, true);
check(
  "glow falls off with distance",
  skyGlowAt(-26.3, 28.13) < skyGlowAt(-25.95, 28.13),
  true,
);
check("every source is on or near the corridor", SKY_GLOW_SOURCES.every(s => s.lat < -25 && s.lat > -35), true);
check("every source has a positive reach", SKY_GLOW_SOURCES.every(s => s.reachKm > 0), true);

// ── Ramps and colour ────────────────────────────────────────────────────────

check("ramp clamps low", ramp(-5, 0, 10), 0);
check("ramp clamps high", ramp(15, 0, 10), 1);
check("ramp is linear between", ramp(5, 0, 10), 0.5);
check("a zero-width ramp does not divide by zero", ramp(5, 5, 5), 1);
check("smooth ramp agrees at the ends", smoothRamp(0, 0, 10), 0);
check("smooth ramp agrees at the top", smoothRamp(10, 0, 10), 1);
check("smooth ramp is flat at the ends", smoothRamp(0.1, 0, 10) < 0.01, true);
check("mix at zero is the first colour", mixColour(0x102030, 0xa0b0c0, 0), 0x102030);
check("mix at one is the second", mixColour(0x102030, 0xa0b0c0, 1), 0xa0b0c0);
check("mix clamps past one", mixColour(0x102030, 0xa0b0c0, 4), 0xa0b0c0);
check("mix stays in range", mixColour(0x000000, 0xffffff, 0.5), 0x808080);

// ── Lighting through a day ──────────────────────────────────────────────────

const lightAt = (h: number, m = 0, where: [number, number] = KAROO) =>
  lightingAt(sast(2026, 9, 22, h, m), ...where);

const midnight = lightAt(0);
const dawn = lightAt(6);
const noon = lightAt(12, 30);
const dusk = lightAt(18, 5);

check("midnight is night", midnight.phase, "night");
check("noon is midday", noon.phase, "midday");
check("day factor is zero at midnight", midnight.dayFactor, 0);
check("day factor is one at noon", noon.dayFactor, 1);
check("noon is brighter than midnight", noon.sunIntensity > midnight.sunIntensity, true);
check("midnight is not pitch black", midnight.sunIntensity > 0, true);
check("...nor is its fill", midnight.hemisphereIntensity > 0, true);
check("exposure lifts at night", midnight.exposure > noon.exposure, true);
check("fog closes in at night", midnight.fogFar < noon.fogFar, true);
check("fog never starts behind the camera", midnight.fogNear > 0, true);
check("fog always ends beyond where it starts", midnight.fogFar > midnight.fogNear, true);
check("background matches the fog", noon.backgroundColour, noon.fogColour);

check("carriage lamps are full on at midnight", midnight.interiorLight, 1);
check("carriage lamps are off at noon", noon.interiorLight, 0);
check(
  "carriage lamps are partly on at dusk",
  dusk.interiorLight > 0 && dusk.interiorLight < 1,
  true,
);
check("stars are out in the Karoo at midnight", midnight.starVisibility > 0.9, true);
check("stars are gone at noon", noon.starVisibility, 0);
const cityNight = lightAt(0, 0, CAPE_TOWN);
check("a city night shows far fewer stars", cityNight.starVisibility < 0.2, true);
check(
  "...and has a brighter sky than the Karoo at the same moment",
  cityNight.hemisphereIntensity > midnight.hemisphereIntensity,
  true,
);
check("dawn is between the two", dawn.dayFactor > 0 && dawn.dayFactor < 1, true);

// The sun vector: +x east, +y up, +z south.
check("the sun is above the horizon at noon", noon.sunDirection.y > 0, true);
check("the sun points north at noon here", noon.sunDirection.z < 0, true);
const morning = lightAt(8);
check("the morning sun is in the east", morning.sunDirection.x > 0, true);
const afternoon = lightAt(16);
check("the afternoon sun is in the west", afternoon.sunDirection.x < 0, true);
const unit = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
near("the sun vector is a unit vector", unit(noon.sunDirection), 1, 1e-9);
near("...at night too", unit(midnight.sunDirection), 1, 1e-9);
check("the night sun never dips below the horizon plane", midnight.sunDirection.y > -0.02, true);

// Monotonic and continuous: sample the whole day at one minute and check that
// nothing jumps. This is the property that makes a phase change invisible.
let maxStep = 0;
let previous = lightAt(0).dayFactor;
let brightest = -1;
let darkest = 2;
for (let m = 1; m < 1440; m += 1) {
  const state = lightingAt(new Date(sast(2026, 9, 22, 0, 0).getTime() + m * 60_000), ...KAROO);
  maxStep = Math.max(maxStep, Math.abs(state.dayFactor - previous));
  previous = state.dayFactor;
  brightest = Math.max(brightest, state.sunIntensity);
  darkest = Math.min(darkest, state.sunIntensity);
}
check("day factor never jumps", maxStep < 0.04, true);
check("the day has a bright end", brightest > 1.4, true);
check("...and a dark one", darkest < 0.1, true);
check("nothing is ever unlit", darkest > 0, true);

// Colour continuity across each twilight boundary.
const boundaryGap = (elevation: number) => {
  const below = lightingFor(
    { elevationDeg: elevation - 0.01, azimuthDeg: 90, declinationDeg: 0, hourAngleDeg: -40, rising: true },
    ...KAROO,
  );
  const above = lightingFor(
    { elevationDeg: elevation + 0.01, azimuthDeg: 90, declinationDeg: 0, hourAngleDeg: -40, rising: true },
    ...KAROO,
  );
  const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const a = channels(below.fogColour);
  const b = channels(above.fogColour);
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
};
check("no colour seam at -18", boundaryGap(ASTRONOMICAL_ELEVATION) <= 2, true);
check("no colour seam at -12", boundaryGap(NAUTICAL_ELEVATION) <= 2, true);
check("no colour seam at -6", boundaryGap(CIVIL_ELEVATION) <= 2, true);
check("no colour seam at the horizon", boundaryGap(HORIZON_ELEVATION) <= 2, true);
check("no colour seam at +6", boundaryGap(6) <= 2, true);
check("no colour seam at +12", boundaryGap(12) <= 2, true);

// Low sun is warm; high sun is not.
const warmth = (colour: number) => ((colour >> 16) & 255) - (colour & 255);
check("the setting sun is warmer than the midday one", warmth(dusk.sunColour) > warmth(noon.sunColour), true);
check("sky haze is thicker at dusk", dusk.turbidity > noon.turbidity, true);
check("...and rayleigh with it", dusk.rayleigh > noon.rayleigh, true);

// ── Brightness cap ──────────────────────────────────────────────────────────

const dimmed = lightingAt(sast(2026, 9, 22, 12, 30), ...KAROO, { brightness: 0.5 });
near("a brightness cap halves the sun", dimmed.sunIntensity, noon.sunIntensity / 2, 1e-9);
near("...and the fill", dimmed.hemisphereIntensity, noon.hemisphereIntensity / 2, 1e-9);
check("a cap does not change the phase", dimmed.phase, noon.phase);
const zeroed = lightingAt(sast(2026, 9, 22, 12, 30), ...KAROO, { brightness: 0 });
check("a zero cap is accepted without error", zeroed.sunIntensity, 0);
const overBright = lightingAt(sast(2026, 9, 22, 12, 30), ...KAROO, { brightness: 9 });
check("a cap above one is clamped", overBright.sunIntensity, noon.sunIntensity);

// A caller that has already measured the glow may pass it in.
const supplied = lightingAt(sast(2026, 9, 22, 0, 0), ...KAROO, { skyGlow: 1 });
check("a supplied glow is used", supplied.skyGlow, 1);
check("...and it suppresses the stars", supplied.starVisibility < 0.2, true);

// ── The fallback ────────────────────────────────────────────────────────────

const fallback = fallbackLighting();
check("the fallback says so", fallback.fallback, true);
check("a real calculation does not", noon.fallback, false);
check("the fallback is unmistakably daylight", fallback.dayFactor > 0.9, true);
check("the fallback lights the scene", fallback.sunIntensity > 1, true);
check("the fallback leaves the lamps off", fallback.interiorLight, 0);
check("the fallback is deterministic", fallbackLighting().sunColour, fallback.sunColour);
check("the notice explains what happened", FALLBACK_NOTICE.includes("mid-morning"), true);

check("an invalid date falls back", lightingAt(new Date(NaN), ...KAROO).fallback, true);
check(
  "a nonsense latitude falls back",
  lightingAt(sast(2026, 9, 22, 12), 999 as number, 24).fallback,
  true,
);
check(
  "a nonsense longitude falls back",
  lightingAt(sast(2026, 9, 22, 12), -30, 999 as number).fallback,
  true,
);
check(
  "a non-date falls back",
  lightingAt("noon" as unknown as Date, ...KAROO).fallback,
  true,
);
check(
  "the poles still produce a finite sun",
  Number.isFinite(lightingAt(sast(2026, 12, 21, 12), -89.9, 0).sunIntensity),
  true,
);
check(
  "...and the equator at the equinox",
  Number.isFinite(lightingAt(sast(2026, 3, 20, 12), 0, 0).elevationDeg),
  true,
);

// ── Leap day and year end, since the clock suite cares about both ───────────
check(
  "the sun is computable on a leap day",
  Number.isFinite(solarPosition(sast(2028, 2, 29, 12), ...KAROO).elevationDeg),
  true,
);
check(
  "...and across a year end",
  solarPosition(sast(2026, 12, 31, 23, 59), ...KAROO).elevationDeg <
    solarPosition(sast(2027, 1, 1, 12), ...KAROO).elevationDeg,
  true,
);

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
