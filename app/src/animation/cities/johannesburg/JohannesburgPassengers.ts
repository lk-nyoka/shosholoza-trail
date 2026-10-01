import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPassengers, type PassengerSpot } from '../../Passengers.ts';

/** Deliberate spots avoid columns (23m grid), benches (+5m), and platform edges. */
export function johannesburgPassengerSpots(): PassengerSpot[] {
  const spots: PassengerSpot[] = [];
  for (const z of [-18, -6, 6, 18]) {
    for (const x of [-105, -58, -11, 36]) spots.push({ position: new THREE.Vector3(x, 1.05, z + (z < 0 ? 1.6 : -1.6)), facing: z < 0 ? 0 : Math.PI, pose: 'standing' });
    for (const x of [-87, 5]) spots.push({ position: new THREE.Vector3(x, 1.615, z), facing: z < 0 ? 0 : Math.PI, pose: 'sitting' });
  }
  return spots;
}

export function createJohannesburgPassengers(source: GLTF) {
  // Reuse the skeleton-aware loader, idle/sitting clips, palette and disposal.
  const passengers = createPassengers(source, johannesburgPassengerSpots(), { seed: 220926 });
  let lightweight = false;
  return {
    ...passengers,
    setLightweight(value: boolean) {
      lightweight = value;
      passengers.group.children.forEach((person, i) => { person.visible = !value || i % 2 === 0; });
    },
    update(dt: number) { if (dt > 0) passengers.update(Math.min(dt, lightweight ? .05 : .1)); },
  };
}
