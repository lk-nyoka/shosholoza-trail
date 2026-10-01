// Hadeda ibises crossing the sky above the corridor.
//
// Why hadedas: a Pretoria sky is not an empty gradient. The bird you actually
// see (and hear, at dawn, from every rooftop) is the hadeda - dark, heavy-bodied,
// broad rounded wings and a long decurved bill, flying in loose straggling groups
// of three to seven with a slow, deep wingbeat. A generic "V of gulls" would
// read as anywhere; a few hadedas labouring overhead read as Gauteng.
//
// How: every bird's position is an analytic function of time and the camera
// position, so there is no simulation state to drift with frame rate and the
// same time always gives the same sky. Each flock flies a gently snaking path in
// its own heading frame; that frame is tiled around the camera (toroidal wrap),
// so a flock leaving the region reappears on the far side and there are always a
// few in view. Birds shrink to nothing near the wrap edge instead of popping.
// Placement is a seeded scatter (mulberry32, as in Vegetation.ts), so screenshots
// stay comparable between builds.
//
// Two instanced meshes carry the lot: one for bodies, one for wings (left and
// right are the same quad, the left turned half about the vertical) - two draw
// calls for every bird in the sky.
//
// Simplified: no flocking behaviour (offsets within the flock are fixed plus a
// slow wander), no call audio here, wings are single rigid quads hinged at the
// shoulder with no elbow or primaries, and birds are drawn somewhat larger than
// life so they still read as birds at 40-120 m rather than as specks.
import * as THREE from 'three';

const DEFAULT_SEED = 20260922;
const DEFAULT_FLOCKS = 5;
/** Half-length of the wrap window along a flock's heading, metres. */
const ALONG_REACH = 450;
/** Half-width of the wrap window across a flock's heading, metres. */
const ACROSS_REACH = 350;
/** Distance over which a bird shrinks away at the wrap edge. */
const EDGE_FADE = 45;
/** Drawn larger than a real hadeda (~1.1 m span) so it reads at altitude. */
const BIRD_SCALE = 1.6;
const MIN_ALTITUDE = 40;
const MAX_ALTITUDE = 120;

export type BirdSystem = {
  meshes: THREE.InstancedMesh[];
  count: number;
  update(time: number, centre: THREE.Vector3, groundAt: (x: number, z: number) => number): void;
  /** Positions of every bird body this frame, for tests/debug. */
  positions(): THREE.Vector3[];
  dispose(): void;
};

/** Deterministic PRNG. Same seed, same sky, every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wraps value into [-reach, reach). */
function wrap(value: number, reach: number) {
  const period = reach * 2;
  return value - period * Math.floor((value + reach) / period);
}

type Flock = {
  /** Unit heading in the ground plane. */
  hx: number;
  hz: number;
  speed: number;
  /** Where along its heading the flock starts, and which lane across. */
  start: number;
  lane: number;
  /** Snaking of the path: amplitude and wavelength (metres). */
  curveAmp: number;
  curveLength: number;
  curvePhase: number;
  altitude: number;
  altitudeWander: number;
  altitudePhase: number;
};

type Bird = {
  flock: number;
  /** Offset within the flock, in the flock's frame: behind, across, up. */
  back: number;
  side: number;
  up: number;
  wanderPhase: number;
  flapHz: number;
  flapPhase: number;
  glidePeriod: number;
  glidePhase: number;
};

/** Squat low-poly hadeda: body, head and a long decurved bill, facing +z. */
function bodyGeometry() {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.12, 0.11, 0.3);
  parts.push(body);

  const head = new THREE.OctahedronGeometry(1, 0);
  head.scale(0.055, 0.055, 0.075);
  head.translate(0, 0.03, 0.36);
  parts.push(head);

  // The bill, in two segments bending down: the hadeda's signature profile.
  const billA = new THREE.ConeGeometry(0.018, 0.1, 4);
  billA.rotateX(Math.PI / 2 + 0.25);
  billA.translate(0, 0.015, 0.47);
  parts.push(billA.toNonIndexed());
  billA.dispose();
  const billB = new THREE.ConeGeometry(0.012, 0.08, 4);
  billB.rotateX(Math.PI / 2 + 0.7);
  billB.translate(0, -0.02, 0.55);
  parts.push(billB.toNonIndexed());
  billB.dispose();

  // Short tail wedge.
  const tail = new THREE.ConeGeometry(0.07, 0.16, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.35, 1);
  tail.translate(0, 0, -0.34);
  parts.push(tail.toNonIndexed());
  tail.dispose();

  let length = 0;
  for (const part of parts) length += part.getAttribute('position').array.length;
  const positions = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    const array = part.getAttribute('position').array as ArrayLike<number>;
    positions.set(array, offset);
    offset += array.length;
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  merged.scale(BIRD_SCALE, BIRD_SCALE, BIRD_SCALE);
  return merged;
}

/**
 * One broad, rounded-off wing hinged at the origin and spanning +x, lying in
 * the XZ plane with its top face up. Symmetric front-to-back, so the same quad
 * turned half about y serves as the left wing.
 */
function wingGeometry() {
  const span = 0.56;
  const root = 0.2; // half-chord at the shoulder
  const tip = 0.13; // half-chord at the tip - hadeda wings stay broad
  // Two triangles, wound counter-clockwise seen from above (+y).
  const positions = new Float32Array([
    0, 0, -root, 0, 0, root, span, 0, tip,
    0, 0, -root, span, 0, tip, span, 0, -tip,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.scale(BIRD_SCALE, BIRD_SCALE, BIRD_SCALE);
  return geometry;
}

export function createBirds(
  material: THREE.Material,
  options: { flocks?: number; seed?: number } = {},
): BirdSystem {
  const random = mulberry32(options.seed ?? DEFAULT_SEED);
  const flockCount = Math.max(0, Math.floor(options.flocks ?? DEFAULT_FLOCKS));

  const flocks: Flock[] = [];
  const birds: Bird[] = [];
  for (let f = 0; f < flockCount; f++) {
    const heading = random() * Math.PI * 2;
    flocks.push({
      hx: Math.sin(heading),
      hz: Math.cos(heading),
      speed: 11 + random() * 5,
      start: random() * ALONG_REACH * 2,
      lane: (random() * 2 - 1) * ACROSS_REACH,
      curveAmp: 15 + random() * 35,
      curveLength: 90 + random() * 120,
      curvePhase: random() * Math.PI * 2,
      // Keep the wander inside the 40-120 m band.
      altitude: MIN_ALTITUDE + 10 + random() * (MAX_ALTITUDE - MIN_ALTITUDE - 20),
      altitudeWander: 3 + random() * 5,
      altitudePhase: random() * Math.PI * 2,
    });
    // Loose, straggling groups of 3-7: a ragged line more than a tidy V.
    const size = 3 + Math.floor(random() * 5);
    for (let b = 0; b < size; b++) {
      birds.push({
        flock: f,
        back: b * (3 + random() * 3) + random() * 2,
        side: (random() * 2 - 1) * (4 + b * 1.5),
        up: (random() * 2 - 1) * 2,
        wanderPhase: random() * Math.PI * 2,
        flapHz: 2.5 + random() * 0.5,
        flapPhase: random() * Math.PI * 2,
        glidePeriod: 7 + random() * 6,
        glidePhase: random() * Math.PI * 2,
      });
    }
  }

  const count = birds.length;
  const bodyGeo = bodyGeometry();
  const wingGeo = wingGeometry();
  const bodies = new THREE.InstancedMesh(bodyGeo, material, Math.max(1, count));
  const wings = new THREE.InstancedMesh(wingGeo, material, Math.max(1, count * 2));
  bodies.count = count;
  wings.count = count * 2;
  // Instances roam hundreds of metres from the mesh origin; the default
  // bounding sphere would cull them wrongly.
  bodies.frustumCulled = false;
  wings.frustumCulled = false;
  bodies.castShadow = false;
  wings.castShadow = false;

  const current = birds.map(() => new THREE.Vector3());

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const heading = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const flap = new THREE.Quaternion();
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const wingRotation = new THREE.Quaternion();
  const shoulder = new THREE.Vector3();
  const wingPosition = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forwardAxis = new THREE.Vector3(0, 0, 1);

  // Park everything at zero scale until the first update.
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) bodies.setMatrixAt(i, matrix);
  for (let i = 0; i < count * 2; i++) wings.setMatrixAt(i, matrix);

  function update(time: number, centre: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    for (let i = 0; i < count; i++) {
      const bird = birds[i];
      const flock = flocks[bird.flock];
      const { hx, hz } = flock;
      // Perpendicular (to the right of the heading) in the ground plane.
      const px = hz, pz = -hx;

      // Flock centre in its heading frame, wrapped around the camera.
      const s = flock.start + flock.speed * time;
      const theta = s / flock.curveLength + flock.curvePhase;
      const centreAlong = centre.x * hx + centre.z * hz;
      const centreAcross = centre.x * px + centre.z * pz;
      const along = wrap(s - centreAlong, ALONG_REACH);
      const across = wrap(flock.lane + flock.curveAmp * Math.sin(theta) - centreAcross, ACROSS_REACH);

      // Direction of travel follows the snaking path's tangent.
      const slope = (flock.curveAmp / flock.curveLength) * Math.cos(theta);
      const inv = 1 / Math.hypot(1, slope);
      const fx = (hx + px * slope) * inv, fz = (hz + pz * slope) * inv;
      const rx = fz, rz = -fx;

      // Loose formation: fixed offset plus a slow individual wander.
      const wander = time * 0.23 + bird.wanderPhase;
      const back = bird.back + 1.2 * Math.sin(wander);
      const side = bird.side + 1.5 * Math.sin(wander * 0.7 + 1.3);

      const x = centre.x + hx * along + px * across - fx * back + rx * side;
      const z = centre.z + hz * along + pz * across - fz * back + rz * side;

      // Wingbeat: slow and deep, with occasional glides on held wings.
      const glideWave = Math.sin((2 * Math.PI * time) / bird.glidePeriod + bird.glidePhase);
      const glide = THREE.MathUtils.smoothstep(glideWave, 0.45, 0.8);
      const beat = Math.sin(2 * Math.PI * bird.flapHz * time + bird.flapPhase);
      const flapAngle = 0.12 + (1 - glide) * 0.75 * beat;

      const altitude = flock.altitude
        + flock.altitudeWander * Math.sin(time * 0.11 + flock.altitudePhase)
        + bird.up
        // The body rises on the downstroke.
        - (1 - glide) * 0.08 * beat;
      const y = groundAt(x, z) + altitude;
      current[i].set(x, y, z);

      // Shrink away near the wrap edge rather than popping.
      const edge = Math.min(ALONG_REACH - Math.abs(along), ACROSS_REACH - Math.abs(across));
      const size = THREE.MathUtils.clamp(edge / EDGE_FADE, 0, 1);

      heading.setFromAxisAngle(up, Math.atan2(fx, fz));
      // Bank into the turn a little.
      const curvature = -(flock.curveAmp / (flock.curveLength * flock.curveLength)) * Math.sin(theta);
      roll.setFromAxisAngle(forwardAxis, THREE.MathUtils.clamp(-curvature * 40, -0.35, 0.35));
      heading.multiply(roll);

      scale.setScalar(size);
      matrix.compose(current[i], heading, scale);
      bodies.setMatrixAt(i, matrix);

      for (let w = 0; w < 2; w++) {
        const sideSign = w === 0 ? 1 : -1;
        shoulder.set(sideSign * 0.08 * BIRD_SCALE, 0.04 * BIRD_SCALE, 0.04 * BIRD_SCALE)
          .multiplyScalar(size)
          .applyQuaternion(heading);
        wingPosition.copy(current[i]).add(shoulder);
        flap.setFromAxisAngle(forwardAxis, sideSign * flapAngle);
        wingRotation.copy(heading).multiply(flap);
        if (w === 1) wingRotation.multiply(turn);
        matrix.compose(wingPosition, wingRotation, scale);
        wings.setMatrixAt(i * 2 + w, matrix);
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  }

  return {
    meshes: [bodies, wings],
    count,
    update,
    positions: () => current.map((p) => p.clone()),
    dispose() {
      bodyGeo.dispose();
      wingGeo.dispose();
      bodies.dispose();
      wings.dispose();
    },
  };
}
