// People waiting on platforms.
//
// An empty platform reads as a closed station. A handful of figures standing
// about and a few on the benches is enough to say "people wait here" at train
// speed. The figure is Sketchbook's rigged "boxman" mannequin (MIT, swift502;
// see public/licenses/sketchbook-boxman.txt), reused unmodified: each person is
// a skeleton-aware clone with its own copy of the material, tinted a plain
// everyday clothing colour. One skinned mesh and one material per person, so a
// person costs one draw call (plus one in the shadow pass).
//
// What is approximate: the mannequin has no walk clip, so nobody walks; the
// standing crowd idles and a few of them turn on the spot now and then. The
// tint covers the whole figure, face included - there is no separate skin or
// trouser material to colour. Placement is a seeded scatter, not a survey of
// where people actually stand.
//
// Coordinates: a person faces local +Z at `facing` 0 (positive `facing` turns
// them toward +X, i.e. to their left). A standing person's feet sit on
// `position.y`; a sitting person's seat - the underside of the thighs - sits on
// `position.y`, so a sitting spot's y is the bench top, not the floor.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type PassengerSpot = { position: THREE.Vector3; facing: number; pose: 'standing' | 'sitting' };

export type Passengers = { group: THREE.Group; count: number; update(dt: number): void; dispose(): void };

/** A person, standing, from heels to crown. */
export const PERSON_HEIGHT = 1.72;
/** Seat height above the platform used for bench spots: a standard public bench. */
export const BENCH_SEAT_HEIGHT = 0.45;
const DEFAULT_SEED = 20260921;
/** Share of standing people who shift their stance and turn now and then. */
const TURNER_SHARE = 0.3;
/** Seconds between turns for someone who turns. */
const TURN_INTERVAL: [number, number] = [5, 14];
/** How far one turn swings a person, radians. */
const TURN_ANGLE: [number, number] = [0.35, 0.8];
/** A turner never drifts further than this from the facing they were given. */
const TURN_LIMIT = 0.9;
const CROSSFADE = 0.3;

/** Plain everyday clothing: denims, navy, charcoal, khaki, office shirts, a few brighter tops. */
const CLOTHING = [
  '#2f4a6d', '#3b5578', '#1f2a3c', '#4a4f57', '#6b6f75', '#8a7a5c', '#a39170',
  '#5a3e2b', '#7b2d2d', '#9c4a3a', '#2e5e4e', '#4d6b3a', '#c9b99a', '#d8d2c4',
  '#b85c38', '#c79a2e', '#6a4c7d', '#8e2f4f', '#3f7f93', '#e0dcd2',
];

/** Deterministic PRNG. Same seed, same crowd, every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: () => number, [low, high]: [number, number]) => low + (high - low) * random();

/**
 * Spots on a platform given in some parent's local space: the caller adds the
 * returned group to that parent. Standing people are spread along x in
 * [xFrom, xTo], across a band `depth` wide centred on `z`, feet at `top`. Each
 * bench gets one sitting person, seated `BENCH_SEAT_HEIGHT` above `top` near the
 * bench's x; a caller whose benches are a different height moves that spot's y.
 * `facing` (default 0, local +Z) is where everyone mostly looks: toward the track.
 */
export function platformSpots(options: {
  xFrom: number; xTo: number; z: number; depth: number; top: number; standing: number;
  benches?: { x: number; z: number }[]; facing?: number; seed?: number;
}): PassengerSpot[] {
  const random = mulberry32(options.seed ?? DEFAULT_SEED);
  const facing = options.facing ?? 0;
  const low = Math.min(options.xFrom, options.xTo);
  const high = Math.max(options.xFrom, options.xTo);
  const count = Math.max(0, Math.floor(options.standing));
  const spots: PassengerSpot[] = [];

  // Stratified: one person per equal slice of the platform, jittered within the
  // middle of its slice, so people spread out without ever standing inside each other.
  const slice = count > 0 ? (high - low) / count : 0;
  for (let i = 0; i < count; i++) {
    const x = low + slice * (i + 0.15 + 0.7 * random());
    const z = options.z + (random() - 0.5) * options.depth;
    // Mostly looking down the track side, some glancing along the platform.
    const turn = (random() - 0.5) * 1.2 + (random() < 0.2 ? (random() < 0.5 ? -1 : 1) * 0.9 : 0);
    spots.push({ position: new THREE.Vector3(x, options.top, z), facing: facing + turn, pose: 'standing' });
  }

  for (const bench of options.benches ?? []) {
    const x = bench.x + (random() - 0.5) * 1.6;
    spots.push({
      position: new THREE.Vector3(x, options.top + BENCH_SEAT_HEIGHT, bench.z),
      facing,
      pose: 'sitting',
    });
  }
  return spots;
}

function findClip(clips: THREE.AnimationClip[], name: string, fallback: boolean): THREE.AnimationClip | undefined {
  return THREE.AnimationClip.findByName(clips, name) ?? (fallback ? clips[0] : undefined);
}

/**
 * Standing height and heel level of the source figure, measured on a throwaway
 * clone posed as it will be shown (first frame of `idle`), in its own units.
 */
function measure(source: GLTF, idle: THREE.AnimationClip | undefined) {
  const probe = SkeletonUtils.clone(source.scene);
  // Measured about the figure's own origin, as each person is placed.
  probe.position.set(0, 0, 0);
  const mixer = new THREE.AnimationMixer(probe);
  if (idle) {
    mixer.clipAction(idle).play();
    mixer.update(0);
  }
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe, true);
  mixer.stopAllAction();
  mixer.uncacheRoot(probe);
  probe.traverse(object => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) (object as THREE.SkinnedMesh).skeleton.dispose();
  });
  const height = box.isEmpty() ? 0 : box.max.y - box.min.y;
  return { height, feet: box.isEmpty() ? 0 : box.min.y };
}

type Person = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  materials: THREE.Material[];
  skeletons: THREE.Skeleton[];
  /** Only for standing people who turn. */
  turner?: {
    idle: THREE.AnimationAction;
    left: THREE.AnimationAction;
    right: THREE.AnimationAction;
    baseFacing: number;
    offset: number;
    wait: number;
    /** The turn clip playing, if any, with its remaining time and yaw rate. */
    active: THREE.AnimationAction | null;
    remaining: number;
    rate: number;
    random: () => number;
  };
};

export function createPassengers(source: GLTF, spots: PassengerSpot[], options: { seed?: number } = {}): Passengers {
  const group = new THREE.Group();
  group.name = 'passengers';
  const random = mulberry32(options.seed ?? DEFAULT_SEED);
  const clips = source.animations ?? [];

  const idleClip = findClip(clips, 'idle', true);
  const sittingClip = findClip(clips, 'sitting', true);
  const leftClip = findClip(clips, 'rotate_left', false);
  const rightClip = findClip(clips, 'rotate_right', false);

  const { height, feet } = measure(source, idleClip);
  const scale = height > 1e-6 ? PERSON_HEIGHT / height : 1;
  const people: Person[] = [];

  spots.forEach((spot, index) => {
    const figure = SkeletonUtils.clone(source.scene);
    figure.scale.multiplyScalar(scale);
    // Standing: heels on the spot. Sitting: the pose's seat is at the figure's
    // origin, so the origin goes on the bench top.
    figure.position.set(0, spot.pose === 'standing' ? -feet * scale : 0, 0);

    const root = new THREE.Group();
    root.name = `passenger-${index}`;
    root.position.copy(spot.position);
    root.rotation.y = spot.facing;
    root.add(figure);
    group.add(root);

    const colour = new THREE.Color(CLOTHING[Math.floor(random() * CLOTHING.length)]);
    // A little per-person shade so two people in "the same" colour still differ.
    colour.offsetHSL(0, 0, (random() - 0.5) * 0.08);
    const materials: THREE.Material[] = [];
    const skeletons: THREE.Skeleton[] = [];
    figure.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = (material: THREE.Material) => {
        const copy = material.clone();
        const tinted = copy as THREE.Material & { color?: THREE.Color };
        if (tinted.color?.isColor) tinted.color.copy(colour);
        materials.push(copy);
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skeletons.push((mesh as THREE.SkinnedMesh).skeleton);
    });

    const mixer = new THREE.AnimationMixer(figure);
    const clip = spot.pose === 'sitting' ? sittingClip : idleClip;
    const person: Person = { root, mixer, materials, skeletons };
    if (clip) {
      const action = mixer.clipAction(clip);
      // Random-looking start and a slight tempo difference keep the crowd out of lockstep.
      action.time = random() * clip.duration;
      action.timeScale = 0.85 + random() * 0.3;
      action.play();

      if (spot.pose === 'standing' && clip === idleClip && leftClip && rightClip && random() < TURNER_SHARE) {
        const turnRandom = mulberry32(Math.floor(random() * 4294967296));
        person.turner = {
          idle: action,
          left: mixer.clipAction(leftClip),
          right: mixer.clipAction(rightClip),
          baseFacing: spot.facing,
          offset: 0,
          wait: between(turnRandom, TURN_INTERVAL) * turnRandom(),
          active: null,
          remaining: 0,
          rate: 0,
          random: turnRandom,
        };
      }
    }
    people.push(person);
  });

  const startTurn = (turner: NonNullable<Person['turner']>) => {
    const angle = between(turner.random, TURN_ANGLE);
    // Turn back toward the given facing when drifting far, otherwise either way.
    let direction = turner.random() < 0.5 ? -1 : 1;
    if (Math.abs(turner.offset + direction * angle) > TURN_LIMIT) direction = -direction;
    const action = direction > 0 ? turner.left : turner.right;
    const duration = action.getClip().duration || 0.6;
    action.reset().setLoop(THREE.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    turner.idle.crossFadeTo(action, CROSSFADE, false);
    turner.active = action;
    turner.remaining = duration;
    turner.rate = (direction * angle) / duration;
  };

  const endTurn = (turner: NonNullable<Person['turner']>) => {
    turner.idle.reset().play();
    turner.active?.crossFadeTo(turner.idle, CROSSFADE, false);
    turner.active = null;
    turner.rate = 0;
    turner.wait = between(turner.random, TURN_INTERVAL);
  };

  return {
    group,
    count: people.length,
    update(dt: number) {
      for (const person of people) {
        const turner = person.turner;
        if (turner) {
          if (turner.remaining > 0) {
            const step = Math.min(dt, turner.remaining);
            turner.offset += turner.rate * step;
            person.root.rotation.y = turner.baseFacing + turner.offset;
            turner.remaining -= dt;
            if (turner.remaining <= 0) endTurn(turner);
          } else {
            turner.wait -= dt;
            if (turner.wait <= 0) startTurn(turner);
          }
        }
        person.mixer.update(dt);
      }
    },
    dispose() {
      for (const person of people) {
        person.mixer.stopAllAction();
        person.mixer.uncacheRoot(person.mixer.getRoot());
        // Geometry is shared with the source model and stays with it.
        for (const material of person.materials) material.dispose();
        for (const skeleton of person.skeletons) skeleton.dispose();
        group.remove(person.root);
      }
      people.length = 0;
    },
  };
}
