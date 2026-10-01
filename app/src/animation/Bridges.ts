// Road bridges over the line.
//
// The level-crossing pass treated every road that met the rail the same way,
// so Ben Schoeman Highway - the N1/N14, six lanes - crossed the Pretoria main
// line at grade with flashing lights. OSM tags that way `bridge=yes`, along
// with eleven others in this slice. Those now span the line instead.
//
// A bridge way in OSM is usually just the span; its approaches are separate
// ways at ground level. So the deck is not held flat at clearance height, which
// would leave a step at each end. It rises from the ground at the abutments to
// full clearance over the rail on a smooth curve, which is what the approach
// embankments of a real overbridge do.
import * as THREE from 'three';

/**
 * Clearance over rail level. The contact wire sits at 5.2 m; structure gauge
 * for 3 kV DC in South Africa puts the soffit well above that.
 */
export const CLEARANCE = 7.4;
/** Deck thickness, soffit to road surface. */
const DECK_DEPTH = 1.3;
/** How far along the road the deck takes to climb to full height. */
const RAMP = 70;

export type BridgeRoad = {
  points: THREE.Vector3[];
  width: number;
  name: string | null;
};

export type BridgeSite = {
  road: BridgeRoad;
  /** Metres along the road where it crosses the rail centreline. */
  crossingAlong: number;
  railLevel: number;
  railHeading: number;
};

type Segment = { ax: number; az: number; bx: number; bz: number };

function intersect(p: Segment, q: Segment) {
  const rx = p.bx - p.ax, rz = p.bz - p.az;
  const sx = q.bx - q.ax, sz = q.bz - q.az;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((q.ax - p.ax) * sz - (q.az - p.az) * sx) / denominator;
  const u = ((q.ax - p.ax) * rz - (q.az - p.az) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Which bridge ways actually span the railway, and where. */
export function findBridgeSites(rail: THREE.Vector3[], roads: BridgeRoad[]): BridgeSite[] {
  const sites: BridgeSite[] = [];
  for (const road of roads) {
    let along = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const segmentLength = Math.hypot(b.x - a.x, b.z - a.z);
      for (let j = 1; j < rail.length; j++) {
        const c = rail[j - 1], d = rail[j];
        const hit = intersect({ ax: a.x, az: a.z, bx: b.x, bz: b.z }, { ax: c.x, az: c.z, bx: d.x, bz: d.z });
        if (!hit) continue;
        sites.push({
          road,
          crossingAlong: along + segmentLength * hit.t,
          railLevel: THREE.MathUtils.lerp(c.y, d.y, hit.u),
          railHeading: Math.atan2(-(d.z - c.z), d.x - c.x),
        });
        // One site per road: a bridge way that wiggles across the line twice is
        // still one structure.
        j = rail.length;
        i = road.points.length;
      }
      along += segmentLength;
    }
  }
  return sites;
}

/**
 * Deck height at a distance along the bridge road. Full clearance over the
 * rail, easing down to the ground at each end.
 */
export function deckLevel(site: BridgeSite, along: number, groundLevel: number) {
  const distance = Math.abs(along - site.crossingAlong);
  const top = site.railLevel + CLEARANCE + DECK_DEPTH;
  const t = THREE.MathUtils.smoothstep(distance, 0, RAMP);
  // Never dip below the ground the road is actually on.
  return Math.max(groundLevel + 0.1, THREE.MathUtils.lerp(top, groundLevel + 0.1, t));
}

export type BridgeSet = {
  group: THREE.Group;
  count: number;
  dispose(): void;
};

export function createBridges(
  sites: BridgeSite[],
  groundAt: (x: number, z: number) => number,
  materials: { deck: THREE.Material; structure: THREE.Material; parapet: THREE.Material },
): BridgeSet {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];

  for (const site of sites) {
    const { road } = site;
    const deck: number[] = [];
    const side: number[] = [];

    // Walk the road, lifting each point to deck level.
    let along = 0;
    const lifted: THREE.Vector3[] = [];
    for (let i = 0; i < road.points.length; i++) {
      if (i > 0) along += Math.hypot(road.points[i].x - road.points[i - 1].x, road.points[i].z - road.points[i - 1].z);
      const p = road.points[i];
      lifted.push(new THREE.Vector3(p.x, deckLevel(site, along, groundAt(p.x, p.z)), p.z));
    }

    const half = road.width / 2 + 0.6;
    for (let i = 1; i < lifted.length; i++) {
      const a = lifted[i - 1], b = lifted[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length * half, nz = dx / length * half;

      // Road surface on top of the deck.
      deck.push(
        a.x + nx, a.y, a.z + nz, a.x - nx, a.y, a.z - nz, b.x + nx, b.y, b.z + nz,
        b.x + nx, b.y, b.z + nz, a.x - nx, a.y, a.z - nz, b.x - nx, b.y, b.z - nz,
      );
      // Fascia down each side, one deck depth, so the span reads as a slab and
      // not as a sheet of paper.
      for (const sign of [1, -1]) {
        const ax = a.x + nx * sign, az = a.z + nz * sign, bx = b.x + nx * sign, bz = b.z + nz * sign;
        side.push(
          ax, a.y, az, bx, b.y, bz, ax, a.y - DECK_DEPTH, az,
          ax, a.y - DECK_DEPTH, az, bx, b.y, bz, bx, b.y - DECK_DEPTH, bz,
        );
      }
    }

    for (const [data, material] of [[deck, materials.deck], [side, materials.structure]] as const) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
      geometry.computeVertexNormals();
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Fascia faces point both ways depending on side; draw both.
      if (material === materials.structure) (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      group.add(mesh);
    }

    // Piers either side of the track, clear of the formation and the masts.
    const crossingPoint = pointAlong(lifted, site.crossingAlong);
    if (crossingPoint) {
      const railSide = new THREE.Vector3(Math.cos(site.railHeading), 0, -Math.sin(site.railHeading));
      const across = new THREE.Vector3(-railSide.z, 0, railSide.x);
      const pierGeometry = new THREE.BoxGeometry(1.4, 1, road.width + 1.2);
      geometries.push(pierGeometry);
      for (const sign of [-1, 1]) {
        const foot = crossingPoint.clone().addScaledVector(across, sign * 9.5);
        const ground = groundAt(foot.x, foot.z);
        const top = crossingPoint.y - DECK_DEPTH;
        const height = Math.max(0.5, top - ground);
        const pier = new THREE.Mesh(pierGeometry, materials.structure);
        pier.position.set(foot.x, ground + height / 2, foot.z);
        pier.scale.y = height;
        // The pier box is built with its long axis on local Z, sized to span the
        // deck's width. rotation.y maps local Z onto the rail-forward direction,
        // which is across the road - so it needs the extra quarter turn.
        pier.rotation.y = site.railHeading + Math.PI / 2;
        pier.castShadow = true;
        pier.receiveShadow = true;
        group.add(pier);
      }
    }
  }

  return {
    group,
    count: sites.length,
    dispose() { for (const geometry of geometries) geometry.dispose(); },
  };
}

/** The point at a distance along a polyline. */
function pointAlong(points: THREE.Vector3[], distance: number) {
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    if (travelled + segment >= distance) {
      return points[i - 1].clone().lerp(points[i], (distance - travelled) / (segment || 1));
    }
    travelled += segment;
  }
  return points[points.length - 1]?.clone() ?? null;
}
