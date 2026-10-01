// Streets and traffic beside the line.
//
// With buildings but no roads the corridor reads as an abandoned town. Roads
// give it a street pattern; a handful of cars give it the only motion in the
// scene that is not the train, the wind or the clouds.
//
// Road surfaces are flat quads laid segment by segment, merged into one
// geometry: 431 ways cost one draw call. Traffic is a single InstancedMesh
// whose cars drive the longest ways and wrap at the end.
//
// Data: OpenStreetMap via scripts/fetch-osm-roads.mjs. ODbL 1.0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type RoadRecord = {
  highway: string;
  width: number;
  name: string | null;
  /** Carried over something. Drawn by Bridges.ts, never at ground level. */
  bridge?: boolean;
  tunnel?: boolean;
  layer?: number;
  lengthMetres: number;
  points: [number, number][];
};

/** A way that is not on the ground: a bridge deck, or a tunnel we do not draw. */
export const isGradeSeparated = (road: RoadRecord) => Boolean(road.bridge || road.tunnel);

export type RoadData = { count: number; roads: RoadRecord[] };

/** Road surface sits just above the ground plane to avoid z-fighting. */
const SURFACE_Y = 0.06;
const CAR_COUNT = 22;
/** Metres per second. Suburban Pretoria, not the N1. */
const CAR_SPEED = 11;
const CAR_COLOURS = ['#c9cdd2', '#8d99a6', '#b4533f', '#3f4a5a', '#d8d2c2'];

export type RoadNetwork = {
  surface: THREE.Mesh | null;
  traffic: THREE.InstancedMesh | null;
  update(time: number): void;
  dispose(): void;
};

/** A route a car can drive: world-space points and cumulative distances. */
type Lane = { points: THREE.Vector3[]; cumulative: number[]; total: number };

export function createRoads(
  data: RoadData,
  project: (lon: number, lat: number) => THREE.Vector3,
  surfaceMaterial: THREE.Material,
  carMaterial: THREE.Material,
): RoadNetwork {
  const quads: THREE.BufferGeometry[] = [];
  const lanes: Lane[] = [];

  for (const road of data.roads) {
    // Bridges draw their own raised deck; tunnels are not drawn at all. Laying
    // either at ground level would put a road straight through the formation.
    if (isGradeSeparated(road)) continue;
    const world = road.points.map(([lon, lat]) => project(lon, lat));
    if (world.length < 2) continue;

    // Surface: one flat quad per segment, oriented along it.
    for (let i = 1; i < world.length; i++) {
      const a = world[i - 1], b = world[i];
      const delta = b.clone().sub(a);
      // Length measured flat: a road that climbs should not get a longer quad.
      const length = Math.hypot(delta.x, delta.z);
      if (length < 0.5) continue;
      const quad = new THREE.PlaneGeometry(length, road.width);
      quad.rotateX(-Math.PI / 2);
      quad.rotateY(Math.atan2(-delta.z, delta.x));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      quad.translate(mid.x, mid.y + SURFACE_Y, mid.z);
      quads.push(quad);
    }

    // Only the longer ways are worth driving; a 40 m service road would have a
    // car wrapping every four seconds.
    if (road.lengthMetres > 400) {
      const cumulative = [0];
      for (let i = 1; i < world.length; i++) cumulative.push(cumulative[i - 1] + world[i].distanceTo(world[i - 1]));
      lanes.push({ points: world, cumulative, total: cumulative[cumulative.length - 1] });
    }
  }

  let surface: THREE.Mesh | null = null;
  if (quads.length) {
    const merged = mergeGeometries(quads, false);
    for (const quad of quads) quad.dispose();
    if (merged) {
      surface = new THREE.Mesh(merged, surfaceMaterial);
      surface.receiveShadow = true;
    }
  }

  let traffic: THREE.InstancedMesh | null = null;
  const dummy = new THREE.Object3D();
  const assignments: { lane: Lane; offset: number; speed: number; colour: THREE.Color }[] = [];

  if (lanes.length) {
    const carGeometry = new THREE.BoxGeometry(4.3, 1.5, 1.85);
    traffic = new THREE.InstancedMesh(carGeometry, carMaterial, CAR_COUNT);
    traffic.castShadow = true;
    traffic.frustumCulled = false;
    for (let i = 0; i < CAR_COUNT; i++) {
      const lane = lanes[i % lanes.length];
      assignments.push({
        lane,
        // Spread along the lane deterministically, and alternate direction so
        // traffic runs both ways.
        offset: (i * 0.618033) % 1,
        speed: (i % 2 ? 1 : -1) * CAR_SPEED * (0.8 + ((i * 37) % 40) / 100),
        colour: new THREE.Color(CAR_COLOURS[i % CAR_COLOURS.length]),
      });
      traffic.setColorAt(i, assignments[i].colour);
    }
    if (traffic.instanceColor) traffic.instanceColor.needsUpdate = true;
  }

  /** Position and heading at a distance along a lane. */
  const sample = (lane: Lane, metres: number) => {
    const target = ((metres % lane.total) + lane.total) % lane.total;
    let low = 0, high = lane.cumulative.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (lane.cumulative[mid] < target) low = mid; else high = mid;
    }
    const span = lane.cumulative[high] - lane.cumulative[low] || 1;
    const t = (target - lane.cumulative[low]) / span;
    const a = lane.points[low], b = lane.points[high];
    const position = a.clone().lerp(b, t);
    const delta = b.clone().sub(a);
    return { position, heading: Math.atan2(-delta.z, delta.x) };
  };

  return {
    surface,
    traffic,
    update(time: number) {
      if (!traffic) return;
      for (let i = 0; i < assignments.length; i++) {
        const car = assignments[i];
        const { position, heading } = sample(car.lane, car.offset * car.lane.total + time * car.speed);
        dummy.position.set(position.x, position.y + 0.75, position.z);
        // Cars driving the other way face the other way.
        dummy.rotation.set(0, car.speed < 0 ? heading + Math.PI : heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        traffic.setMatrixAt(i, dummy.matrix);
      }
      traffic.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      surface?.geometry.dispose();
      traffic?.geometry.dispose();
      traffic?.dispose();
    },
  };
}
