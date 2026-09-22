/**
 * The building-versus-railway test.
 *
 * The case that matters is the one corner-testing cannot see: a footprint whose
 * every corner is comfortably clear of the line while the line runs through its
 * middle. Park Station is mapped that way - one polygon over its own platforms -
 * and extruded it became a solid block with the train inside it.
 *
 *   npx esbuild src/lib/__tests__/corridor.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
 */
import { distanceToTrack, ringIntersectsCorridor, segmentDistanceSq } from "../railWorld";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = Math.abs(Number(actual) - Number(expected)) < 1e-6 || actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  (got ${actual}, wanted ${expected})`}`);
};

// A line of track running west to east through z = 0.
const straightTrack = Array.from({ length: 41 }, (_, i) => ({ x: -200 + i * 10, z: 0 }));

// ── segmentDistanceSq ───────────────────────────────────────────────────────
check("crossing segments are zero apart", segmentDistanceSq(-5, 0, 5, 0, 0, -5, 0, 5), 0);
check("parallel segments 5 m apart", segmentDistanceSq(0, 5, 10, 5, 0, 0, 10, 0), 25);
check("collinear but disjoint", segmentDistanceSq(0, 0, 10, 0, 20, 0, 30, 0), 100);

// ── the Park Station case ───────────────────────────────────────────────────
// 300 m x 120 m, straddling the line. Every corner is 60 m from the rails -
// well outside the 17 m clearance - and the track runs right through it.
const station = [-150, -60,  150, -60,  150, 60,  -150, 60];
check("track through the middle is caught", ringIntersectsCorridor(station, straightTrack, 17), true);

// The old corner test on the same polygon: all four corners are 60 m away.
const cornersOnly = [-150, -60, 150, -60, 150, 60, -150, 60]
  .reduce<number[][]>((acc, v, i) => (i % 2 ? (acc[acc.length - 1].push(v), acc) : [...acc, [v]]), [])
  .map(([x, z]) => Math.min(...straightTrack.map(t => Math.hypot(t.x - x, t.z - z))));
check("...and every corner really was clear", Math.min(...cornersOnly) > 17, true);

// ── a wall running parallel, endpoints far from any sample ──────────────────
const wall = [-500, 8, -480, 8, -480, 30, -500, 30];
const shortTrack = [{ x: -495, z: 0 }, { x: -485, z: 0 }];
check("parallel wall 8 m from the rails is caught", ringIntersectsCorridor(wall, shortTrack, 17), true);

// ── a building that genuinely is clear ──────────────────────────────────────
const house = [40, 60, 60, 60, 60, 80, 40, 80];
check("a house 60 m away is left alone", ringIntersectsCorridor(house, straightTrack, 17), false);

// ── nothing near at all: the cheap path ─────────────────────────────────────
const faraway = [5000, 5000, 5020, 5000, 5020, 5020, 5000, 5020];
check("open country costs one bounding box", ringIntersectsCorridor(faraway, straightTrack, 17), false);

// ── just outside vs just inside the clearance ───────────────────────────────
check("18 m away is clear", ringIntersectsCorridor([0, 18, 10, 18, 10, 40, 0, 40], straightTrack, 17), false);
check("16 m away is not", ringIntersectsCorridor([0, 16, 10, 16, 10, 40, 0, 40], straightTrack, 17), true);

// ── Tree canopy clearance on a curve ────────────────────────────────────────
// The tree belt offsets each tree perpendicular to the line at its own sample
// and then jitters it up to 16.5 m ALONG the tangent. On a curve the line bends
// back towards the tree while the tangent does not, so clearance measured at
// one sample is not clearance from the track.

// A 250 m-radius curve - tighter than anything on this route, which is the
// point: if the rule holds here it holds everywhere.
const curve = Array.from({ length: 60 }, (_, i) => {
  const angle = (i / 59) * (Math.PI / 2);
  return { x: 250 * Math.cos(angle), z: 250 * Math.sin(angle) };
});

check("a point on the curve is zero from it", distanceToTrack(250, 0, curve) < 0.01, true);
check("the centre of the curve is one radius away", Math.abs(distanceToTrack(0, 0, curve) - 250) < 0.5, true);
check(
  "a point 30 m outside the curve measures 30 m",
  Math.abs(distanceToTrack(280, 0, curve) - 30) < 0.5,
  true,
);

// The failure the fix is for: perpendicular at the sample, then slid along the
// tangent. On the inside of the curve that lands closer than it started.
const sample = curve[0];                       // (250, 0)
const tangent = { x: 0, z: 1 };                // heading along +z here
const inward = { x: -1, z: 0 };                // towards the centre of the curve
const naive = {
  x: sample.x + inward.x * 17 + tangent.x * 16.5,
  z: sample.z + inward.z * 17 + tangent.z * 16.5,
};
check(
  "the naive placement really does breach the clearance",
  distanceToTrack(naive.x, naive.z, curve) < 17,
  true,
);

// The correction: push straight out along the same normal until it clears.
let corrected = { ...naive };
for (let attempt = 0; attempt < 3; attempt += 1) {
  const actual = distanceToTrack(corrected.x, corrected.z, curve);
  if (actual >= 17) break;
  const push = 17 - actual + 0.5;
  corrected = { x: corrected.x + inward.x * push, z: corrected.z + inward.z * push };
}
check("...and pushing out fixes it", distanceToTrack(corrected.x, corrected.z, curve) >= 17, true);
check("...without moving it further than it had to", distanceToTrack(corrected.x, corrected.z, curve) < 24, true);

// An empty or single-point line must not divide by zero.
check("no samples is infinitely far", distanceToTrack(0, 0, []), Infinity);
check("one sample is a point distance", distanceToTrack(3, 4, [{ x: 0, z: 0 }]), 5);
check("a zero-length segment does not divide by zero", distanceToTrack(0, 5, [{ x: 0, z: 0 }, { x: 0, z: 0 }]), 5);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
