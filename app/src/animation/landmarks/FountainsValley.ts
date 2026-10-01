// Fountains Valley, as an approximation.
//
// IMPORTANT: this is not a reconstruction and must never be presented as one.
// No 3D asset, survey, photogrammetry or camera path of Fountains Valley was
// supplied, so this is an interpretation built from primitives, standing in
// until a real asset arrives. It is labelled as approximate everywhere it
// appears on screen, exactly as Freedom Park is.
//
// What it stands for, and why these forms were chosen: from the rail line the
// place reads as a shallow green valley between low ridges, with water at the
// bottom of it - the springs where the Apies River rises - and big shade trees
// over lawns. So: a valley floor that lifts into ridges on either side, a pond
// at the springs, a meandering ribbon of stream leaving it, and clumps of
// trees. Positions, sizes and the stream's course are invented to read well,
// not measured. Nothing here is to scale with the real park's layout.
import * as THREE from 'three';
import type { LandmarkScene } from './FreedomPark.ts';

/** Half-extents of the valley floor, in metres of local space. */
const HALF_LENGTH = 160;
const HALF_WIDTH = 130;
/** Flat bottom of the valley; the ground lifts toward the ridges beyond it. */
const FLOOR_HALF_WIDTH = 45;
const TREES = 84;

const POND = { x: -108, z: 4, rx: 22, rz: 14 };
const STREAM_START = POND.x + POND.rx - 3;
const STREAM_END = HALF_LENGTH;
const STREAM_SEGMENTS = 110;
const WATER_Y = 0.14;

/** The stream's centreline: a lazy meander rather than a straight channel. */
function streamZ(x: number): number {
  return 4 + Math.sin((x - STREAM_START) * 0.024) * 16 + Math.sin(x * 0.061 + 1.1) * 5;
}

/** Ground height: flat along the valley bottom, rising into low ridges. */
function groundHeight(x: number, z: number): number {
  const beyond = Math.max(0, Math.abs(z) - FLOOR_HALF_WIDTH);
  // Ridges undulate along their length so they don't read as two ramps.
  const ridge = beyond * beyond * 0.0036 * (1 + Math.sin(x * 0.021 + (z > 0 ? 0.8 : 2.3)) * 0.22);
  // Bring the ridges back down to the floor before the plane ends. Rising to
  // the very edge left a 26 m wall standing in the air where the landmark meets
  // the real terrain around it.
  const edge = (1 - THREE.MathUtils.smoothstep(Math.abs(z), HALF_WIDTH * 0.74, HALF_WIDTH))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(x), HALF_LENGTH * 0.82, HALF_LENGTH));
  return ridge * edge;
}

/** Deterministic scatter, so the scene is identical on every build. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createFountainsValley(): LandmarkScene {
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  const material = (colour: string, roughness = 0.9) => {
    const created = new THREE.MeshStandardMaterial({ color: colour, roughness });
    disposables.push(created);
    return created;
  };

  // --- The valley: one displaced plane. Lawn green on the floor, drying to
  // olive and grey-green up the ridges, via vertex colours.
  const groundGeometry = new THREE.PlaneGeometry(HALF_LENGTH * 2, HALF_WIDTH * 2, 32, 26);
  groundGeometry.rotateX(-Math.PI / 2);
  disposables.push(groundGeometry);
  const positions = groundGeometry.getAttribute('position') as THREE.BufferAttribute;
  const colours = new Float32Array(positions.count * 3);
  const lawn = new THREE.Color('#6f9a4a');
  const slope = new THREE.Color('#7f8452');
  const crest = new THREE.Color('#8d8a5e');
  const blend = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const y = groundHeight(x, z);
    positions.setY(i, y);
    const t = Math.min(1, y / 30);
    blend.copy(lawn).lerp(slope, Math.min(1, t * 2));
    if (t > 0.5) blend.lerp(crest, (t - 0.5) * 2);
    colours[i * 3] = blend.r;
    colours[i * 3 + 1] = blend.g;
    colours[i * 3 + 2] = blend.b;
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  groundGeometry.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  disposables.push(groundMaterial);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  root.add(ground);

  // --- Water. Slightly emissive so it reads from a moving train in any light;
  // polygonOffset keeps it clear of the ground it lies on.
  const water = new THREE.MeshStandardMaterial({
    color: '#3d7fa6',
    emissive: new THREE.Color('#1f6690'),
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(water);

  // The pond at the springs.
  const pondGeometry = new THREE.CircleGeometry(1, 40);
  pondGeometry.rotateX(-Math.PI / 2);
  disposables.push(pondGeometry);
  const pond = new THREE.Mesh(pondGeometry, water);
  pond.position.set(POND.x, WATER_Y, POND.z);
  pond.scale.set(POND.rx, 1, POND.rz);
  pond.receiveShadow = true;
  root.add(pond);

  // A slow ripple ring on the pond, standing for water welling up.
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.3, depthWrite: false });
  disposables.push(rippleMaterial);
  const rippleGeometry = new THREE.RingGeometry(0.9, 1, 40);
  rippleGeometry.rotateX(-Math.PI / 2);
  disposables.push(rippleGeometry);
  const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
  ripple.position.set(POND.x - 6, WATER_Y + 0.04, POND.z - 2);
  root.add(ripple);

  // The stream: a flat ribbon along the meander, widening as it goes.
  const streamPositions = new Float32Array((STREAM_SEGMENTS + 1) * 2 * 3);
  const streamIndices: number[] = [];
  for (let i = 0; i <= STREAM_SEGMENTS; i++) {
    const t = i / STREAM_SEGMENTS;
    const x = STREAM_START + t * (STREAM_END - STREAM_START);
    const z = streamZ(x);
    const dz = streamZ(x + 0.5) - streamZ(x - 0.5);
    const length = Math.hypot(1, dz);
    // Normal to the centreline, in the ground plane.
    const nx = -dz / length;
    const nz = 1 / length;
    const half = 1.6 + t * 2.6 + Math.sin(t * 19) * 0.35;
    streamPositions.set([x + nx * half, WATER_Y, z + nz * half, x - nx * half, WATER_Y, z - nz * half], i * 6);
    if (i < STREAM_SEGMENTS) {
      const a = i * 2;
      streamIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const streamGeometry = new THREE.BufferGeometry();
  streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
  streamGeometry.setIndex(streamIndices);
  streamGeometry.computeVertexNormals();
  disposables.push(streamGeometry);
  const stream = new THREE.Mesh(streamGeometry, water);
  stream.receiveShadow = true;
  root.add(stream);

  // --- Stones around the springs.
  const rand = seeded(2591);
  const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
  disposables.push(stoneGeometry);
  const STONES = 12;
  const stones = new THREE.InstancedMesh(stoneGeometry, material('#8f8a7a', 0.85), STONES);
  stones.castShadow = true;
  stones.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < STONES; i++) {
    const angle = (i / STONES) * Math.PI * 2 + rand() * 0.3;
    dummy.position.set(POND.x + Math.cos(angle) * (POND.rx + 1.5), 0.2, POND.z + Math.sin(angle) * (POND.rz + 1.5));
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.scale.set(1 + rand() * 1.2, 0.5 + rand() * 0.6, 1 + rand() * 1.2);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  root.add(stones);

  // --- Shade trees, in clumps. Each tree is a trunk and two overlapping
  // canopy masses; all three are instanced. Greens only - these stand for the
  // valley's big old shade trees, not the city's jacarandas.
  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.55, 1, 6);
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  disposables.push(trunkGeometry, canopyGeometry);
  const trunks = new THREE.InstancedMesh(trunkGeometry, material('#5a4632'), TREES);
  // White, because setColorAt() multiplies into the base colour: a green base
  // under green tints rendered the canopies almost black.
  const canopyMaterial = material('#ffffff', 0.95);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, TREES);
  const crowns = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, TREES);
  for (const mesh of [trunks, canopies, crowns]) { mesh.castShadow = true; mesh.receiveShadow = true; }

  const clumps = [
    { x: -130, z: -30, spread: 16, n: 9 },
    { x: -80, z: 34, spread: 18, n: 10 },
    { x: -40, z: -34, spread: 16, n: 10 },
    { x: 0, z: 40, spread: 20, n: 11 },
    { x: 40, z: -28, spread: 18, n: 10 },
    { x: 86, z: 36, spread: 18, n: 10 },
    { x: 120, z: -36, spread: 16, n: 9 },
    { x: -150, z: 30, spread: 12, n: 6 },
    { x: 150, z: 10, spread: 10, n: 5 },
  ];
  const greens = ['#3f6b34', '#4d7a3a', '#35602f', '#5a8440', '#466f36'].map((c) => new THREE.Color(c));
  let placed = 0;
  for (const clump of clumps) {
    for (let k = 0; k < clump.n && placed < TREES; k++) {
      // Rejection-sample away from the water.
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * clump.spread;
        x = THREE.MathUtils.clamp(clump.x + Math.cos(a) * r, -HALF_LENGTH + 4, HALF_LENGTH - 4);
        z = clump.z + Math.sin(a) * r;
        const clearOfStream = x < STREAM_START || Math.abs(z - streamZ(x)) > 9;
        const clearOfPond = ((x - POND.x) / (POND.rx + 6)) ** 2 + ((z - POND.z) / (POND.rz + 6)) ** 2 > 1;
        if (clearOfStream && clearOfPond) break;
      }
      const y = groundHeight(x, z);
      const size = 0.75 + rand() * 0.55;
      const trunkHeight = 4.5 * size;
      const canopyRadius = 5.2 * size;

      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.position.set(x, y + trunkHeight / 2, z);
      dummy.scale.set(size, trunkHeight, size);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);

      // Broad, flattened main canopy.
      dummy.position.set(x, y + trunkHeight + canopyRadius * 0.55, z);
      dummy.scale.set(canopyRadius, canopyRadius * 0.72, canopyRadius);
      dummy.updateMatrix();
      canopies.setMatrixAt(placed, dummy.matrix);

      // A smaller offset crown, so silhouettes are lumpy rather than round.
      const offset = rand() * Math.PI * 2;
      dummy.position.set(
        x + Math.cos(offset) * canopyRadius * 0.45,
        y + trunkHeight + canopyRadius * 1.0,
        z + Math.sin(offset) * canopyRadius * 0.45,
      );
      dummy.scale.setScalar(canopyRadius * 0.62);
      dummy.updateMatrix();
      crowns.setMatrixAt(placed, dummy.matrix);

      const tint = greens[Math.floor(rand() * greens.length)];
      canopies.setColorAt(placed, tint);
      crowns.setColorAt(placed, blend.copy(tint).multiplyScalar(1.12));
      placed++;
    }
  }
  for (const mesh of [trunks, canopies, crowns]) {
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    root.add(mesh);
  }

  return {
    root,
    update(time: number) {
      // Shimmer on two unrelated frequencies so it never pulses evenly.
      water.emissiveIntensity = 0.35 + Math.sin(time * 1.7) * 0.08 + Math.sin(time * 4.3 + 0.6) * 0.04;
      water.opacity = 0.9 + Math.sin(time * 2.9) * 0.03;
      // The ripple widens and fades on a four-second cycle.
      const cycle = (time % 4) / 4;
      const radius = 1.5 + cycle * 9;
      ripple.scale.set(radius, 1, radius * 0.7);
      rippleMaterial.opacity = 0.32 * (1 - cycle);
    },
    dispose() {
      for (const item of disposables) item.dispose();
      stones.dispose();
      trunks.dispose();
      canopies.dispose();
      crowns.dispose();
    },
  };
}
