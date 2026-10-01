// Street lights along the main roads.
//
// Night is the scene's strongest look, but with only the station and the halts
// lit the town between them went black: the roads were there, just invisible.
// A line of lamp heads along each arterial is what a city at night looks like
// from a train window, and it traces the street pattern for free.
//
// Only trunk, primary, secondary and tertiary ways are lit. Residential and
// service roads outnumber them three to one and their real lighting is too dim
// to register from the line; lighting them would triple the cost for noise.
// Bridges and tunnels are skipped: a bridge deck is drawn by Bridges.ts at its
// own height, and a tunnel has no street to stand beside.
//
// Placement is by distance along each way, a lamp every SPACING metres,
// alternating sides of the carriageway, so the same posts appear every run.
// Every lamp is one transform shared by three InstancedMeshes (pole, arm,
// head): the geometries are baked in the post's local frame, where +X points
// across the road, so any number of lamps costs three draw calls.
//
// The heads are not light sources. Real point lights at this count would be
// unaffordable; an emissive head the caller brightens at dusk reads the same.
import * as THREE from 'three';
import { isGradeSeparated, type RoadData, type RoadRecord } from './Roads.ts';

export type StreetLights = {
  group: THREE.Group;
  count: number;
  /** Lamp heads; emissiveIntensity starts at 0 and the caller raises it at night. */
  lampMaterial: THREE.MeshStandardMaterial;
  /** The pools of light on the road below each lamp; driven the same way. */
  poolMaterial: THREE.MeshStandardMaterial;
  dispose(): void;
};

/** Lit classes, most important first: when the budget runs out, the first ones win. */
// Motorways first: Ben Schoeman Highway is the most visible road in the slice
// and is lit in life. They also take first claim on the light budget.
const LIT_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const DEFAULT_SPACING = 38;
const DEFAULT_MAX_LIGHTS = 900;
/** Kerb clearance beyond the half-width: the post stands on the verge, not the road. */
const SETBACK = 1.2;
const POLE_HEIGHT = 8;
/** How far the arm reaches back over the carriageway. */
const ARM_LENGTH = 1.6;
const HEAD_LENGTH = 0.7;

type Placement = {
  position: THREE.Vector3; heading: number; lateral: number;
  /** Where the light pool sits: the highest ground under its footprint. */
  poolY: number;
};

/** Lamp positions along one way, in world space, first lamp half a spacing in. */
function placeAlong(
  road: RoadRecord,
  project: (lon: number, lat: number) => THREE.Vector3,
  spacing: number,
  groundAt?: (x: number, z: number) => number,
): Placement[] {
  const world = road.points.map(([lon, lat]) => project(lon, lat));
  if (world.length < 2) return [];
  const setback = road.width / 2 + SETBACK;
  const placements: Placement[] = [];

  // Distances are measured flat, as the road surface is laid: a climbing road
  // should not gain extra lamps from its gradient.
  let travelled = 0;
  let next = spacing / 2;
  let index = 0;
  for (let i = 1; i < world.length; i++) {
    const a = world[i - 1], b = world[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    // Unit left-hand normal of this segment, in the ground plane.
    const nx = -dz / length, nz = dx / length;
    while (next <= travelled + length) {
      const t = (next - travelled) / length;
      const side = index % 2 === 0 ? 1 : -1;
      const ground = a.clone().lerp(b, t);
      const position = new THREE.Vector3(ground.x + nx * side * setback, ground.y, ground.z + nz * side * setback);
      // Stand on the ground at the post itself. Interpolating between the road's
      // vertex heights left posts floating or sunk by a metre or more wherever
      // the ground between vertices was not a straight line.
      if (groundAt) position.y = groundAt(position.x, position.z);
      // Local +X must point back toward the centreline: rotation.y = atan2(-z, x).
      const heading = Math.atan2(nz * side, -nx * side);
      // The pool lies under the head, out over the road. Seat it on the highest
      // ground under its footprint: an additive decal a little proud of a slope
      // reads fine, one cut off by the slope does not.
      const reach = ARM_LENGTH + HEAD_LENGTH / 2;
      const cx = position.x - nx * side * reach, cz = position.z - nz * side * reach;
      let poolY = position.y;
      if (groundAt) {
        poolY = groundAt(cx, cz);
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2;
          poolY = Math.max(poolY, groundAt(cx + Math.cos(angle) * POOL_RADIUS * 0.7, cz + Math.sin(angle) * POOL_RADIUS * 0.7));
        }
      }
      placements.push({ position, heading, lateral: side * setback, poolY });
      index++;
      next += spacing;
    }
    travelled += length;
  }
  return placements;
}

/** Radius of the lit patch on the road, metres. */
const POOL_RADIUS = 9;

/**
 * A soft radial falloff, bright at the centre and black at the edge, for the
 * light pools. Null where there is no DOM (the tests run in Node).
 */
function glowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(120,120,120,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,1)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createStreetLights(
  data: RoadData,
  project: (lon: number, lat: number) => THREE.Vector3,
  poleMaterial: THREE.Material,
  options: { spacing?: number; maxLights?: number; groundAt?: (x: number, z: number) => number } = {},
): StreetLights {
  const spacing = Math.max(1, options.spacing ?? DEFAULT_SPACING);
  const maxLights = Math.max(0, Math.floor(options.maxLights ?? DEFAULT_MAX_LIGHTS));

  // Higher classes first; within a class, data order (the file is longest first).
  const qualifying = data.roads
    .filter(road => LIT_CLASSES.includes(road.highway) && !isGradeSeparated(road))
    .map((road, order) => ({ road, order, rank: LIT_CLASSES.indexOf(road.highway) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order);

  const placements: Placement[] = [];
  for (const { road } of qualifying) {
    if (placements.length >= maxLights) break;
    for (const placement of placeAlong(road, project, spacing, options.groundAt)) {
      if (placements.length >= maxLights) break;
      placements.push(placement);
    }
  }

  // Geometries in the post's local frame: base at the origin, +X toward the road.
  const poleGeometry = new THREE.CylinderGeometry(0.07, 0.11, POLE_HEIGHT, 6);
  poleGeometry.translate(0, POLE_HEIGHT / 2, 0);
  const armGeometry = new THREE.BoxGeometry(ARM_LENGTH, 0.08, 0.08);
  armGeometry.translate(ARM_LENGTH / 2, POLE_HEIGHT - 0.12, 0);
  const headGeometry = new THREE.BoxGeometry(HEAD_LENGTH, 0.14, 0.32);
  headGeometry.translate(ARM_LENGTH + HEAD_LENGTH / 2 - 0.1, POLE_HEIGHT - 0.22, 0);

  const lampMaterial = new THREE.MeshStandardMaterial({
    // Warm white between high-pressure sodium and the LED retrofits replacing it.
    color: '#fff1d8', emissive: '#ffbf6e', emissiveIntensity: 0, roughness: 0.45,
  });

  // A lamp head is sub-pixel from any distance the train is seen at; what
  // actually reads as street lighting at night is the pool of light on the road.
  // Faked with a radial glow decal, additive, black by day - no real lights,
  // which at 900 lamps would be unaffordable.
  const poolGeometry = new THREE.PlaneGeometry(POOL_RADIUS * 2, POOL_RADIUS * 2);
  poolGeometry.rotateX(-Math.PI / 2);
  // Under the head, which hangs out over the road on the arm.
  poolGeometry.translate(ARM_LENGTH + HEAD_LENGTH / 2, 0.14, 0);
  const poolTexture = glowTexture();
  const poolMaterial = new THREE.MeshStandardMaterial({
    color: '#000000', emissive: '#ffb45e', emissiveIntensity: 0,
    emissiveMap: poolTexture ?? null,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    // No fog. Fog mixes the fragment toward the horizon colour across the whole
    // plane - the radial texture only masks emission - and additive blending
    // then paints that as a pale hard-edged square at every distant lamp.
    fog: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });

  const group = new THREE.Group();
  group.name = 'street-lights';
  const dummy = new THREE.Object3D();
  const instance = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, yOf: (placement: Placement) => number = placement => placement.position.y) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    mesh.count = placements.length;
    mesh.name = name;
    placements.forEach((placement, index) => {
      dummy.position.copy(placement.position);
      dummy.position.y = yOf(placement);
      dummy.rotation.set(0, placement.heading, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Instances span kilometres; the default bounds are the geometry's alone.
    if (placements.length) mesh.computeBoundingSphere();
    // Thin enough that their shadows would be sub-pixel: not worth the shadow pass.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };

  const meshes = [
    instance(poleGeometry, poleMaterial, 'street-light-poles'),
    instance(armGeometry, poleMaterial, 'street-light-arms'),
    instance(headGeometry, lampMaterial, 'street-light-heads'),
    instance(poolGeometry, poolMaterial, 'street-light-pools', placement => placement.poolY),
  ];

  return {
    group,
    count: placements.length,
    lampMaterial,
    poolMaterial,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      poleGeometry.dispose();
      armGeometry.dispose();
      headGeometry.dispose();
      lampMaterial.dispose();
      poolGeometry.dispose();
      poolMaterial.dispose();
      poolTexture?.dispose();
    },
  };
}
