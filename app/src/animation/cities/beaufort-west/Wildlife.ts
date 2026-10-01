// Illustrative Karoo wildlife: springbok, Cape mountain zebra and ostrich.
//
// Indicative ecological agents, not telemetry - the plan is explicit that the
// page must not imply the animals are at the rendered coordinates, and the
// chapter shows that notice whenever they are on screen. Each species is one
// InstancedMesh of a few merged boxes: at the distances they are seen from,
// a silhouette with the right proportions reads, and detail would not.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Part = { size: [number, number, number]; at: [number, number, number]; tilt?: number; colour: string };

/** Body plans in metres, +x forward, feet at y = 0. */
const SPECIES: Record<'springbok' | 'zebra' | 'ostrich', { parts: Part[]; speed: number }> = {
  springbok: {
    speed: 1.2,
    parts: [
      { size: [1.2, 0.5, 0.42], at: [0, 0.95, 0], colour: '#b8834e' },
      { size: [1.1, 0.16, 0.4], at: [0, 0.72, 0], colour: '#f1ece2' },
      { size: [0.18, 0.5, 0.16], at: [0.58, 1.3, 0], tilt: -0.5, colour: '#b8834e' },
      { size: [0.34, 0.2, 0.16], at: [0.78, 1.52, 0], colour: '#efe7d8' },
      { size: [0.05, 0.3, 0.05], at: [0.72, 1.76, 0.05], colour: '#2c2620' },
      { size: [0.05, 0.3, 0.05], at: [0.72, 1.76, -0.05], colour: '#2c2620' },
      ...legs(0.45, 0.14, 0.72, '#c8a57a'),
    ],
  },
  zebra: {
    speed: 0.9,
    parts: [
      { size: [1.9, 0.8, 0.62], at: [0, 1.3, 0], colour: '#e7e2d6' },
      { size: [1.9, 0.12, 0.64], at: [0, 1.45, 0], colour: '#242222' },
      { size: [1.9, 0.12, 0.64], at: [0, 1.15, 0], colour: '#242222' },
      { size: [0.3, 0.8, 0.26], at: [0.95, 1.7, 0], tilt: -0.6, colour: '#e7e2d6' },
      { size: [0.6, 0.28, 0.24], at: [1.25, 1.95, 0], tilt: 0.5, colour: '#2f2d2b' },
      { size: [0.5, 0.1, 0.08], at: [0.9, 2.0, 0], tilt: -0.6, colour: '#242222' },
      ...legs(0.75, 0.22, 1.0, '#3a3735'),
    ],
  },
  ostrich: {
    speed: 1.6,
    parts: [
      { size: [1.1, 0.75, 0.8], at: [0, 1.35, 0], colour: '#2a2624' },
      { size: [0.5, 0.35, 0.82], at: [-0.55, 1.45, 0], colour: '#ece6da' },
      { size: [0.1, 0.9, 0.1], at: [0.45, 2.1, 0], colour: '#c9a79a' },
      { size: [0.26, 0.14, 0.12], at: [0.55, 2.58, 0], colour: '#c9a79a' },
      { size: [0.12, 1.0, 0.12], at: [0.05, 0.5, 0.2], colour: '#c9a79a' },
      { size: [0.12, 1.0, 0.12], at: [0.05, 0.5, -0.2], colour: '#c9a79a' },
    ],
  },
};

function legs(along: number, across: number, height: number, colour: string): Part[] {
  const out: Part[] = [];
  for (const x of [-along, along]) for (const z of [-across, across]) out.push({ size: [0.09, height, 0.09], at: [x, height / 2, z], colour });
  return out;
}

function bodyGeometry(parts: Part[]) {
  const pieces = parts.map(part => {
    const g = new THREE.BoxGeometry(...part.size);
    if (part.tilt) g.rotateZ(part.tilt);
    g.translate(...part.at);
    // Colour per vertex, so one instanced material carries the whole animal.
    const colour = new THREE.Color(part.colour);
    const count = g.attributes.position.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return g;
  });
  const merged = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return merged;
}

export type Herd = { species: keyof typeof SPECIES; centre: THREE.Vector3; count: number; spread: number };

type Animal = { species: keyof typeof SPECIES; index: number; home: THREE.Vector3; phase: number; radius: number; speed: number };

export function createWildlife(herds: Herd[], groundAt: (x: number, z: number) => number, seed = 1979) {
  let s = seed;
  const random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const group = new THREE.Group();
  group.name = 'illustrative-wildlife';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const animals: Animal[] = [];
  const counts = new Map<keyof typeof SPECIES, number>();
  for (const herd of herds) {
    for (let i = 0; i < herd.count; i++) {
      const index = counts.get(herd.species) ?? 0;
      counts.set(herd.species, index + 1);
      const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * herd.spread;
      animals.push({
        species: herd.species, index,
        home: herd.centre.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r)),
        phase: random() * 100, radius: 4 + random() * 10, speed: 0.6 + random() * 0.8,
      });
    }
  }
  const meshes = new Map<keyof typeof SPECIES, THREE.InstancedMesh>();
  for (const [species, count] of counts) {
    const mesh = new THREE.InstancedMesh(bodyGeometry(SPECIES[species].parts), material, count);
    mesh.castShadow = true;
    mesh.name = species;
    // Herds cover kilometres; per-instance bounds are not worth computing.
    mesh.frustumCulled = false;
    meshes.set(species, mesh);
    group.add(mesh);
  }

  const dummy = new THREE.Object3D();
  const at = new THREE.Vector3(), ahead = new THREE.Vector3();
  /** Graze: a slow wandering loop around each animal's spot, with pauses. */
  function update(time: number) {
    for (const animal of animals) {
      const pace = SPECIES[animal.species].speed * animal.speed * 0.05;
      const t = time * pace + animal.phase;
      // Standing still about half the time, as grazers do.
      const walk = t + 0.35 * Math.sin(t * 1.7);
      const place = (u: number, out: THREE.Vector3) => out.set(
        animal.home.x + Math.cos(u) * animal.radius + Math.sin(u * 2.3) * animal.radius * 0.3,
        0,
        animal.home.z + Math.sin(u) * animal.radius * 0.7,
      );
      place(walk, at); place(walk + 0.05, ahead);
      at.y = groundAt(at.x, at.z);
      dummy.position.copy(at);
      dummy.rotation.set(0, Math.atan2(-(ahead.z - at.z), ahead.x - at.x), 0);
      // Head down to graze when nearly still.
      const moving = Math.abs(Math.cos(t * 1.7));
      dummy.rotation.z = moving < 0.3 ? -0.12 : 0;
      dummy.position.y += Math.abs(Math.sin(walk * 40)) * 0.04 * moving;
      dummy.updateMatrix();
      meshes.get(animal.species)!.setMatrixAt(animal.index, dummy.matrix);
    }
    for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    count: animals.length,
    update,
    dispose() {
      for (const mesh of meshes.values()) { mesh.geometry.dispose(); mesh.dispose(); }
      material.dispose();
    },
  };
}
