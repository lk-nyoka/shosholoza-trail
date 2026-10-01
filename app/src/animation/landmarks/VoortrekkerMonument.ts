// The Voortrekker Monument, as an approximation.
//
// IMPORTANT: this is not a reconstruction and must never be presented as one.
// No 3D asset, survey, photogrammetry or camera path of the monument was
// supplied, so this is an interpretation built from primitives, standing in
// until a real asset arrives. It is labelled as approximate everywhere it
// appears on screen, exactly as Freedom Park and Fountains Valley are.
//
// What it stands for, and why these forms were chosen: from the rail line,
// some 1.7 km away, the monument is a skyline landmark. What reads at that
// distance is massing: a near-cubic pale granite block on a hilltop, its crown
// rising in a rounded, stepped arch on each face, a tall arched window centred
// on each face, a figure standing at each corner, a broad stepped terrace, and
// the low circular wall that rings the site (in life a laager of ox-wagons
// carved in granite). So those are what is built. Dimensions are rounded to
// read well, not measured; no figure is a likeness. The hill itself comes from
// the terrain; the footprint pad levels a floor for all of this at local y=0.
import * as THREE from 'three';
import type { LandmarkScene } from './FreedomPark.ts';

/** Stepped terrace: [half-width, height] of each step, bottom up. */
const STEPS: [number, number][] = [[37, 1.6], [33, 1.6], [29, 1.8]];
const PODIUM_TOP = STEPS.reduce((sum, [, height]) => sum + height, 0);
/** The main block: ~38 m square in plan, rising ~34 m off the terrace. */
const BLOCK_HALF = 19;
const BLOCK_HEIGHT = 34;
const BLOCK_TOP = PODIUM_TOP + BLOCK_HEIGHT;

/** The ring wall: ~92 m across, low, in repeating wagon-like segments. */
const RING_RADIUS = 46;
const RING_SEGMENTS = 60;
/** Segments left out to make the gateway, centred on the +z face. */
const GATEWAY_SEGMENTS = 2;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 1.6;

export function createVoortrekkerMonument(): LandmarkScene {
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const instanced: THREE.InstancedMesh[] = [];

  const material = (colour: string, roughness = 0.88) => {
    const created = new THREE.MeshStandardMaterial({ color: colour, roughness });
    disposables.push(created);
    return created;
  };
  const geometry = <T extends THREE.BufferGeometry>(created: T): T => {
    disposables.push(created);
    return created;
  };
  const mesh = (shape: THREE.BufferGeometry, surface: THREE.Material) => {
    const created = new THREE.Mesh(shape, surface);
    created.castShadow = true;
    created.receiveShadow = true;
    root.add(created);
    return created;
  };
  const instances = (shape: THREE.BufferGeometry, surface: THREE.Material, count: number) => {
    const created = new THREE.InstancedMesh(shape, surface, count);
    created.castShadow = true;
    created.receiveShadow = true;
    instanced.push(created);
    root.add(created);
    return created;
  };

  // Pale warm granite, with slightly darker tones for recesses and relief.
  const granite = material('#cbbfa8');
  const graniteShade = material('#b9ab92');
  const recess = material('#8f8270', 0.95);
  const paving = material('#bdb29c', 0.95);

  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  // A half-disc slab: flat edge on y=0, arching up to y=1, spanning x in
  // [-1, 1], one unit deep along z. Used for the crown arches and the window
  // heads. Partial cylinders leave the cut side open, which here sits flush on
  // the stone beneath it and is never seen.
  const arch = geometry(new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, Math.PI / 2, Math.PI));
  arch.rotateX(Math.PI / 2);

  const dummy = new THREE.Object3D();
  /** Place a dummy on face `face` (0..3), `out` metres from the centre, local +z facing outward. */
  const onFace = (face: number, out: number, y: number, lateral = 0) => {
    const angle = face * Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    dummy.position.set(sin * out + cos * lateral, y, cos * out - sin * lateral);
    dummy.rotation.set(0, angle, 0);
  };

  // --- Paved floor inside the ring, and the avenue in through the gateway.
  // polygonOffset keeps them clear of the levelled pad they lie on.
  const floorMaterial = paving.clone();
  floorMaterial.polygonOffset = true;
  floorMaterial.polygonOffsetFactor = -2;
  floorMaterial.polygonOffsetUnits = -2;
  disposables.push(floorMaterial);
  const floorGeometry = geometry(new THREE.CircleGeometry(RING_RADIUS - WALL_THICKNESS / 2, 48));
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  root.add(floor);

  const avenueGeometry = geometry(new THREE.PlaneGeometry(9, 40));
  avenueGeometry.rotateX(-Math.PI / 2);
  const avenue = new THREE.Mesh(avenueGeometry, floorMaterial);
  avenue.position.set(0, 0.05, RING_RADIUS + 12);
  avenue.receiveShadow = true;
  root.add(avenue);

  // --- The stepped terrace.
  let stepBase = 0;
  for (const [half, height] of STEPS) {
    const step = mesh(box, graniteShade);
    step.scale.set(half * 2, height, half * 2);
    step.position.y = stepBase + height / 2;
    stepBase += height;
  }

  // --- The block itself, and a low roof slab set back from its edges.
  const block = mesh(box, granite);
  block.scale.set(BLOCK_HALF * 2, BLOCK_HEIGHT, BLOCK_HALF * 2);
  block.position.y = PODIUM_TOP + BLOCK_HEIGHT / 2;

  const roof = mesh(box, graniteShade);
  roof.scale.set(BLOCK_HALF * 1.5, 1.4, BLOCK_HALF * 1.5);
  roof.position.y = BLOCK_TOP + 0.7;

  // --- The crown: on each face, a broad low arch with a narrower, taller one
  // stepped behind it, so the top reads rounded and stepped rather than flat.
  const crownOuter = instances(arch, granite, 4);
  const crownInner = instances(arch, graniteShade, 4);
  for (let face = 0; face < 4; face++) {
    onFace(face, BLOCK_HALF - 1.5, BLOCK_TOP);
    dummy.scale.set(BLOCK_HALF, 4.5, 3);
    dummy.updateMatrix();
    crownOuter.setMatrixAt(face, dummy.matrix);

    onFace(face, BLOCK_HALF - 4.5, BLOCK_TOP);
    dummy.scale.set(BLOCK_HALF * 0.64, 6.8, 3);
    dummy.updateMatrix();
    crownInner.setMatrixAt(face, dummy.matrix);
  }

  // --- A tall arched window recess centred on each face: a mid-tone surround,
  // and within it a darker panel with an arched head.
  const WINDOW_HALF = 4;
  const WINDOW_BOTTOM = PODIUM_TOP + 6;
  const WINDOW_HEIGHT = 20;
  const surrounds = instances(box, graniteShade, 4);
  const surroundHeads = instances(arch, graniteShade, 4);
  const panels = instances(box, recess, 4);
  const panelHeads = instances(arch, recess, 4);
  for (let face = 0; face < 4; face++) {
    onFace(face, BLOCK_HALF + 0.15, WINDOW_BOTTOM - 1.5 + (WINDOW_HEIGHT + 1.5) / 2);
    dummy.scale.set((WINDOW_HALF + 1.5) * 2, WINDOW_HEIGHT + 1.5, 0.3);
    dummy.updateMatrix();
    surrounds.setMatrixAt(face, dummy.matrix);

    onFace(face, BLOCK_HALF + 0.15, WINDOW_BOTTOM + WINDOW_HEIGHT);
    dummy.scale.set(WINDOW_HALF + 1.5, WINDOW_HALF + 1.5, 0.3);
    dummy.updateMatrix();
    surroundHeads.setMatrixAt(face, dummy.matrix);

    onFace(face, BLOCK_HALF + 0.35, WINDOW_BOTTOM + WINDOW_HEIGHT / 2);
    dummy.scale.set(WINDOW_HALF * 2, WINDOW_HEIGHT, 0.3);
    dummy.updateMatrix();
    panels.setMatrixAt(face, dummy.matrix);

    onFace(face, BLOCK_HALF + 0.35, WINDOW_BOTTOM + WINDOW_HEIGHT);
    dummy.scale.set(WINDOW_HALF, WINDOW_HALF, 0.3);
    dummy.updateMatrix();
    panelHeads.setMatrixAt(face, dummy.matrix);
  }

  // --- A figure at each outer corner of the terrace: a tall plinth and a
  // stylised standing silhouette (a tapered body and a head). No likeness is
  // attempted.
  const bodyGeometry = geometry(new THREE.CylinderGeometry(0.85, 1.4, 1, 10));
  const headGeometry = geometry(new THREE.SphereGeometry(1, 10, 8));
  const PLINTH_HEIGHT = 9;
  const FIGURE_HEIGHT = 5.4;
  const CORNER = BLOCK_HALF + 5.5;
  const plinths = instances(box, graniteShade, 4);
  const bodies = instances(bodyGeometry, granite, 4);
  const heads = instances(headGeometry, granite, 4);
  for (let corner = 0; corner < 4; corner++) {
    const x = corner & 1 ? CORNER : -CORNER;
    const z = corner & 2 ? CORNER : -CORNER;
    dummy.rotation.set(0, Math.atan2(x, z), 0);

    dummy.position.set(x, PODIUM_TOP + PLINTH_HEIGHT / 2, z);
    dummy.scale.set(4.2, PLINTH_HEIGHT, 4.2);
    dummy.updateMatrix();
    plinths.setMatrixAt(corner, dummy.matrix);

    dummy.position.set(x, PODIUM_TOP + PLINTH_HEIGHT + FIGURE_HEIGHT / 2, z);
    dummy.scale.set(1, FIGURE_HEIGHT, 1);
    dummy.updateMatrix();
    bodies.setMatrixAt(corner, dummy.matrix);

    dummy.position.set(x, PODIUM_TOP + PLINTH_HEIGHT + FIGURE_HEIGHT + 0.7, z);
    dummy.scale.setScalar(0.85);
    dummy.updateMatrix();
    heads.setMatrixAt(corner, dummy.matrix);
  }

  // --- The ring wall. Each segment stands for one wagon of the laager: a low
  // wall block, a rounded hood along its top, and a wheel at each end of its
  // outer and inner faces. All instanced; a gap on the +z side is the gateway.
  const segmentLength = (2 * Math.PI * RING_RADIUS) / RING_SEGMENTS;
  const hoodGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, Math.PI / 2, Math.PI));
  hoodGeometry.rotateX(Math.PI / 2);
  hoodGeometry.rotateY(Math.PI / 2); // Hood now runs along x, the wall's tangent.
  const wheelGeometry = geometry(new THREE.CylinderGeometry(1, 1, 0.3, 10));
  wheelGeometry.rotateX(Math.PI / 2); // Axle along z, the wall's normal.

  const wallCount = RING_SEGMENTS - GATEWAY_SEGMENTS;
  const walls = instances(box, granite, wallCount);
  const hoods = instances(hoodGeometry, graniteShade, wallCount);
  const wheels = instances(wheelGeometry, graniteShade, wallCount * 4);
  const local = new THREE.Vector3();
  let wall = 0;
  for (let i = 0; i < RING_SEGMENTS; i++) {
    // Segment 0 is centred on +z; skip the gateway around it.
    const offset = (i + RING_SEGMENTS / 2) % RING_SEGMENTS - RING_SEGMENTS / 2;
    if (Math.abs(offset + 0.5) < GATEWAY_SEGMENTS / 2) continue;
    const angle = (i + 0.5) * (2 * Math.PI / RING_SEGMENTS);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (x: number, y: number, z: number) => {
      // Local x is the tangent, local z the outward radial.
      local.set(x, y, z);
      dummy.position.set(sin * (RING_RADIUS + local.z) + cos * local.x, local.y, cos * (RING_RADIUS + local.z) - sin * local.x);
      dummy.rotation.set(0, angle, 0);
    };

    place(0, WALL_HEIGHT / 2, 0);
    dummy.scale.set(segmentLength - 0.35, WALL_HEIGHT, WALL_THICKNESS);
    dummy.updateMatrix();
    walls.setMatrixAt(wall, dummy.matrix);

    place(0, WALL_HEIGHT, 0);
    dummy.scale.set(segmentLength * 0.72, 1.1, WALL_THICKNESS * 0.42);
    dummy.updateMatrix();
    hoods.setMatrixAt(wall, dummy.matrix);

    let wheel = wall * 4;
    for (const along of [-1, 1]) {
      for (const side of [-1, 1]) {
        place(along * segmentLength * 0.3, 0.95, side * (WALL_THICKNESS / 2 + 0.1));
        dummy.scale.setScalar(0.85);
        dummy.updateMatrix();
        wheels.setMatrixAt(wheel++, dummy.matrix);
      }
    }
    wall++;
  }

  for (const created of instanced) {
    created.instanceMatrix.needsUpdate = true;
    created.computeBoundingBox();
    created.computeBoundingSphere();
  }

  return {
    root,
    update() {
      // Deliberately still. Granite on a hilltop has nothing to animate, and
      // any invented effect would be out of place at this site.
    },
    dispose() {
      for (const item of disposables) item.dispose();
      for (const created of instanced) created.dispose();
    },
  };
}
