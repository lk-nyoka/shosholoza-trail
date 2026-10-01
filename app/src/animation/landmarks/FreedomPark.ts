// Freedom Park, as an approximation.
//
// IMPORTANT: this is not a reconstruction and must never be presented as one.
// No 3D asset, photogrammetry or splat of Freedom Park was supplied, so this is
// an interpretation built from primitives, standing in until a real asset
// arrives. It is labelled as approximate everywhere it appears on screen, and
// the deviation is recorded in docs/deviations.md.
//
// What it stands for, and why these three forms were chosen: seen from the rail
// line 465 m away and 40 m below, Freedom Park reads as a silhouette on Salvokop
// - the hill itself, the long curve of Sikhumbuto's wall along its crest, and
// the reed field rising above it. Those are the three shapes worth building.
// Interior detail would never be visible from the corridor.
import * as THREE from 'three';

/** Vertical reeds of Sikhumbuto. The defining element of the skyline. */
const REEDS = 148;
const REED_ARC = Math.PI * 0.82;
const REED_RADIUS = 38;

export type LandmarkScene = {
  root: THREE.Group;
  update(time: number): void;
  dispose(): void;
};

export function createFreedomPark(): LandmarkScene {
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  const material = (colour: string, roughness = 0.9, emissive?: string) => {
    const created = new THREE.MeshStandardMaterial({ color: colour, roughness });
    if (emissive) { created.emissive = new THREE.Color(emissive); created.emissiveIntensity = 1.4; }
    disposables.push(created);
    return created;
  };

  const rock = material('#8a7a63');
  const stone = material('#cfc3ad', 0.85);
  const reedMaterial = material('#d8cfbc', 0.7);
  const grass = material('#7d8a5c');

  // --- Salvokop, compressed. The real hill rises ~60 m over its surroundings;
  // kept close to that so the landmark sits above the line, as it does.
  // A 190 m radius over 62 m of rise read as a pancake. Salvokop is steep.
  const hill = new THREE.Mesh(new THREE.ConeGeometry(118, 74, 26, 1), grass);
  hill.position.y = 37;
  hill.scale.set(1, 1, 0.82);
  hill.receiveShadow = true;
  hill.castShadow = true;
  disposables.push(hill.geometry);
  root.add(hill);

  // A flatter crest, so the wall and reeds sit on a terrace rather than a point.
  const crest = new THREE.Mesh(new THREE.CylinderGeometry(54, 68, 12, 26), grass);
  crest.position.y = 72;
  crest.scale.set(1, 1, 0.84);
  crest.receiveShadow = true;
  crest.castShadow = true;
  disposables.push(crest.geometry);
  root.add(crest);

  // --- Sikhumbuto: the long curved wall carrying the names. Built from
  // instanced segments along an arc rather than a scaled torus - a torus
  // rotated then non-uniformly scaled squashes into an unreadable blob.
  const WALL_SEGMENTS = 44;
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(wallGeometry);
  const wall = new THREE.InstancedMesh(wallGeometry, stone, WALL_SEGMENTS);
  wall.castShadow = true;
  wall.receiveShadow = true;
  const wallDummy = new THREE.Object3D();
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const t = i / (WALL_SEGMENTS - 1);
    const angle = -Math.PI * 0.46 + t * Math.PI * 0.92;
    const radius = 64;
    // Taller at the centre of the arc, tapering to the ends.
    const height = 5 + Math.sin(t * Math.PI) * 7;
    wallDummy.position.set(Math.sin(angle) * radius, 76 + height / 2, Math.cos(angle) * radius * 0.94 - 6);
    wallDummy.rotation.set(0, angle, 0);
    wallDummy.scale.set(10.5, height, 2.4);
    wallDummy.updateMatrix();
    wall.setMatrixAt(i, wallDummy.matrix);
  }
  root.add(wall);

  // --- The reed field. One instanced mesh; the heights step up toward the
  // centre of the arc so the group reads as a swell rather than a fence.
  const reedGeometry = new THREE.CylinderGeometry(0.42, 0.52, 1, 5);
  disposables.push(reedGeometry);
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, REEDS);
  reeds.castShadow = true;
  const rest: { x: number; z: number; height: number; phase: number }[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < REEDS; i++) {
    const t = i / (REEDS - 1);
    const angle = -REED_ARC / 2 + t * REED_ARC;
    // Two rows, slightly offset, so the field has depth from the side.
    const row = i % 2;
    const radius = REED_RADIUS + row * 5.5;
    const swell = Math.sin(t * Math.PI);
    rest.push({
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius * 0.92 + 4,
      height: 16 + swell * 16 + (i % 5) * 1.2,
      phase: (i * 2.399963) % (Math.PI * 2),
    });
  }
  const writeReeds = (time: number) => {
    for (let i = 0; i < REEDS; i++) {
      const reed = rest[i];
      // The reeds are steel in life, but a slight offset sway keeps the field
      // from reading as a static comb in every frame.
      const lean = Math.sin(time * 0.7 + reed.phase) * 0.012;
      dummy.position.set(reed.x, 78 + reed.height / 2, reed.z);
      dummy.rotation.set(lean, 0, lean * 0.6);
      dummy.scale.set(1, reed.height, 1);
      dummy.updateMatrix();
      reeds.setMatrixAt(i, dummy.matrix);
    }
    reeds.instanceMatrix.needsUpdate = true;
  };
  writeReeds(0);
  root.add(reeds);

  // --- Isivivane: the circle of boulders, one from each province.
  const boulderGeometry = new THREE.DodecahedronGeometry(1, 0);
  disposables.push(boulderGeometry);
  const boulders = new THREE.InstancedMesh(boulderGeometry, rock, 9);
  boulders.castShadow = true;
  boulders.receiveShadow = true;
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 22, 79, Math.sin(angle) * 22 - 46);
    dummy.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    dummy.scale.setScalar(2.6 + (i % 3) * 0.7);
    dummy.updateMatrix();
    boulders.setMatrixAt(i, dummy.matrix);
  }
  root.add(boulders);

  // --- The eternal flame, as a warm point rather than a particle system.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.5, 8), material('#f2a03c', 0.4, '#ff7a18'));
  flame.position.set(0, 82, -16);
  disposables.push(flame.geometry);
  root.add(flame);
  const flameLight = new THREE.PointLight('#ff9a3c', 60, 90, 2);
  flameLight.position.copy(flame.position);
  root.add(flameLight);

  return {
    root,
    update(time: number) {
      writeReeds(time);
      // Flicker on two frequencies so it never pulses evenly.
      const flicker = 0.82 + Math.sin(time * 7.3) * 0.1 + Math.sin(time * 13.1) * 0.06;
      flameLight.intensity = 60 * flicker;
      flame.scale.set(1, 0.9 + flicker * 0.2, 1);
    },
    dispose() {
      for (const item of disposables) item.dispose();
      reeds.dispose();
      boulders.dispose();
    },
  };
}
