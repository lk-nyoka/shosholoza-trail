// The small things beside the track.
//
// A railway is not just rails and wire. What makes a corridor read as a working
// main line rather than a model is the clutter: colour-light signals, relay
// cabinets, cable troughing, kilometre posts, boundary fence. None of it is
// interesting on its own; together it is most of the difference.
//
// All of it is instanced and placed deterministically from route position, so
// the same seed gives the same lineside every run and a screenshot is
// comparable between builds.
import * as THREE from 'three';

const SIGNAL_SPACING = 1_400;
const HUT_SPACING = 900;
const KM_POST_SPACING = 1_000;
const TROUGH_SPACING = 6;
const FENCE_SPACING = 12;
/** Fence and troughing sit outside the formation; signals further out still. */
const TROUGH_OFFSET = 4.4;
const FENCE_OFFSET = 11;
const SIGNAL_OFFSET = 5.2;

type Projector = {
  project(distance: number): THREE.Vector3;
  basis(distance: number): THREE.Vector3;
};

export type LinesideMaterials = {
  metal: THREE.Material;
  concrete: THREE.Material;
  cable: THREE.Material;
  /** Emissive; the signal lamps are the only light source beside the line. */
  lampGreen: THREE.Material;
  lampRed: THREE.Material;
};

export type Lineside = {
  group: THREE.Group;
  counts: Record<string, number>;
  /** Signals ahead of the train show green, behind show red. */
  update(distance: number): void;
  dispose(): void;
};

export function createLineside(
  { project, basis }: Projector,
  fromMetres: number,
  toMetres: number,
  materials: LinesideMaterials,
): Lineside {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const owned: THREE.BufferGeometry[] = [box];

  /** Track frame at a route position: centre, forward, and the left-hand normal. */
  const frameAt = (distance: number) => {
    const centre = project(distance);
    const forward = basis(distance);
    return { centre, forward, side: new THREE.Vector3(-forward.z, 0, forward.x), heading: Math.atan2(-forward.z, forward.x) };
  };

  const span = toMetres - fromMetres;
  const counts: Record<string, number> = {};

  const place = (mesh: THREE.InstancedMesh, index: number, at: THREE.Vector3, heading: number, scale: [number, number, number]) => {
    dummy.position.copy(at);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  // --- Cable troughing: concrete channel sections running the whole length.
  // Nothing says "railway" faster at track level, and it is nearly free.
  const troughCount = Math.floor(span / TROUGH_SPACING);
  const troughs = new THREE.InstancedMesh(box, materials.concrete, troughCount);
  troughs.receiveShadow = true;
  for (let i = 0; i < troughCount; i++) {
    const distance = fromMetres + i * TROUGH_SPACING;
    const { centre, side, heading } = frameAt(distance);
    place(troughs, i, centre.clone().addScaledVector(side, -TROUGH_OFFSET).setY(centre.y + 0.22), heading, [TROUGH_SPACING * 0.92, 0.44, 0.6]);
  }
  counts.troughs = troughCount;
  group.add(troughs);

  // --- Boundary fence: posts only. Wire between them would be invisible at any
  // distance this scene is ever viewed from.
  const fenceCount = Math.floor(span / FENCE_SPACING) * 2;
  const fence = new THREE.InstancedMesh(box, materials.metal, fenceCount);
  // 950 posts, 120 mm square. Their shadows are sub-pixel at any distance the
  // scene is viewed from, and they were a third of the shadow pass.
  fence.castShadow = false;
  for (let i = 0; i < fenceCount / 2; i++) {
    const distance = fromMetres + i * FENCE_SPACING;
    const { centre, side, heading } = frameAt(distance);
    for (const sign of [-1, 1]) {
      place(fence, i * 2 + (sign < 0 ? 0 : 1), centre.clone().addScaledVector(side, sign * FENCE_OFFSET).setY(centre.y + 0.85), heading, [0.12, 1.7, 0.12]);
    }
  }
  counts.fencePosts = fenceCount;
  group.add(fence);

  // --- Relay cabinets. Grey boxes on a plinth, alternating sides.
  const hutCount = Math.floor(span / HUT_SPACING);
  const huts = new THREE.InstancedMesh(box, materials.concrete, hutCount);
  huts.castShadow = true;
  huts.receiveShadow = true;
  for (let i = 0; i < hutCount; i++) {
    const distance = fromMetres + i * HUT_SPACING;
    const { centre, side, heading } = frameAt(distance);
    const sign = i % 2 ? 1 : -1;
    place(huts, i, centre.clone().addScaledVector(side, sign * 7.5).setY(centre.y + 1.15), heading, [2.6, 2.3, 1.7]);
  }
  counts.relayHuts = hutCount;
  group.add(huts);

  // --- Kilometre posts. Small, but they are how a railway measures itself.
  const postCount = Math.floor(span / KM_POST_SPACING);
  const posts = new THREE.InstancedMesh(box, materials.concrete, postCount);
  posts.castShadow = false;
  for (let i = 0; i < postCount; i++) {
    const distance = fromMetres + i * KM_POST_SPACING;
    const { centre, side, heading } = frameAt(distance);
    place(posts, i, centre.clone().addScaledVector(side, -6).setY(centre.y + 0.55), heading, [0.16, 1.1, 0.5]);
  }
  counts.kilometrePosts = postCount;
  group.add(posts);

  // --- Colour-light signals: a mast, a head, and two lamps.
  const signalCount = Math.max(1, Math.floor(span / SIGNAL_SPACING));
  const masts = new THREE.InstancedMesh(box, materials.metal, signalCount);
  const heads = new THREE.InstancedMesh(box, materials.metal, signalCount);
  masts.castShadow = true;
  heads.castShadow = true;
  const lampGeometry = new THREE.SphereGeometry(0.2, 8, 6);
  owned.push(lampGeometry);
  const greens = new THREE.InstancedMesh(lampGeometry, materials.lampGreen, signalCount);
  const reds = new THREE.InstancedMesh(lampGeometry, materials.lampRed, signalCount);
  const signalPositions: number[] = [];

  for (let i = 0; i < signalCount; i++) {
    const distance = fromMetres + (i + 0.5) * SIGNAL_SPACING;
    signalPositions.push(distance);
    const { centre, side, heading } = frameAt(distance);
    const foot = centre.clone().addScaledVector(side, SIGNAL_OFFSET);
    place(masts, i, foot.clone().setY(foot.y + 2.3), heading, [0.22, 4.6, 0.22]);
    place(heads, i, foot.clone().setY(foot.y + 4.9), heading, [0.5, 1.5, 0.42]);
    // Lamps face back down the line, toward an approaching driver.
    const lampAt = foot.clone().addScaledVector(basis(distance), -0.28);
    place(greens, i, lampAt.clone().setY(lampAt.y + 4.55), heading, [1, 1, 1]);
    place(reds, i, lampAt.clone().setY(lampAt.y + 5.25), heading, [1, 1, 1]);
  }
  counts.signals = signalCount;
  group.add(masts, heads, greens, reds);

  // Both lamp meshes always draw; which one is visible per signal is handled by
  // scaling the unused one to nothing, which costs no draw call and no state.
  const hidden = new THREE.Object3D();
  hidden.scale.setScalar(0);
  hidden.updateMatrix();

  const setLamp = (mesh: THREE.InstancedMesh, index: number, on: boolean, at: THREE.Vector3, heading: number) => {
    if (on) place(mesh, index, at, heading, [1, 1, 1]);
    else mesh.setMatrixAt(index, hidden.matrix);
  };

  let lastState = -1;

  return {
    group,
    counts,
    update(distance: number) {
      // Only rewrite when the train has actually passed a signal.
      const passed = signalPositions.filter(position => position < distance).length;
      if (passed === lastState) return;
      lastState = passed;
      for (let i = 0; i < signalCount; i++) {
        const at = signalPositions[i];
        const { centre, side, heading } = frameAt(at);
        const lampAt = centre.clone().addScaledVector(side, SIGNAL_OFFSET).addScaledVector(basis(at), -0.28);
        // Red behind the train, green ahead of it: the block the train has
        // just left is occupied as far as the signalling is concerned.
        const cleared = at < distance;
        setLamp(greens, i, !cleared, lampAt.clone().setY(lampAt.y + 4.55), heading);
        setLamp(reds, i, cleared, lampAt.clone().setY(lampAt.y + 5.25), heading);
      }
      greens.instanceMatrix.needsUpdate = true;
      reds.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const geometry of owned) geometry.dispose();
      for (const mesh of [troughs, fence, huts, posts, masts, heads, greens, reds]) mesh.dispose();
    },
  };
}
