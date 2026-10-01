// Where the roads meet the railway.
//
// Roads and rail were drawn as if the other did not exist, so streets ran
// straight through the formation. Real crossings are found rather than placed:
// every road segment is tested against the rail centreline, and wherever they
// actually intersect a crossing is built there.
//
// South African crossings on an electrified main line carry a St Andrew's
// cross, twin red flashing lights and, on busier roads, half-booms. That is what
// is modelled - simplified, but in the right arrangement.
import * as THREE from 'three';

/** Roads narrower than this get lights only; wider ones get booms. */
const BOOM_WIDTH = 6.5;
/** How far along the route to look, so crossings outside the slice are ignored. */
export type CrossingSite = { position: THREE.Vector3; roadHeading: number; railHeading: number; width: number };

type Segment = { ax: number; az: number; bx: number; bz: number };

/**
 * Where two 2D segments cross, or null. Standard parametric test; the vertical
 * component is ignored because a crossing is a plan-view question.
 */
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

/**
 * Find every place a road crosses the line.
 *
 * @param rail   Rail centreline, already in scene space.
 * @param roads  Road centrelines with their widths.
 */
export function findCrossings(
  rail: THREE.Vector3[],
  roads: { points: THREE.Vector3[]; width: number }[],
): CrossingSite[] {
  const sites: CrossingSite[] = [];

  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const roadSegment = { ax: a.x, az: a.z, bx: b.x, bz: b.z };

      for (let j = 1; j < rail.length; j++) {
        const c = rail[j - 1], d = rail[j];
        const hit = intersect(roadSegment, { ax: c.x, az: c.z, bx: d.x, bz: d.z });
        if (!hit) continue;

        const position = c.clone().lerp(d, hit.u);
        // Two roads meeting the line a few metres apart is one crossing, not two.
        if (sites.some(site => site.position.distanceToSquared(position) < 900)) continue;

        sites.push({
          position,
          roadHeading: Math.atan2(-(b.z - a.z), b.x - a.x),
          railHeading: Math.atan2(-(d.z - c.z), d.x - c.x),
          width: road.width,
        });
      }
    }
  }
  return sites;
}

export type LevelCrossings = {
  group: THREE.Group;
  count: number;
  booms: number[];
  /** Lights flash and booms fall as the train closes on a crossing. */
  update(trainPosition: THREE.Vector3, time: number): void;
  dispose(): void;
};

export function createLevelCrossings(
  sites: CrossingSite[],
  materials: { deck: THREE.Material; post: THREE.Material; cross: THREE.Material; lamp: THREE.MeshStandardMaterial },
): LevelCrossings {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  const booms = sites.filter(site => site.width >= BOOM_WIDTH);
  const decks = new THREE.InstancedMesh(box, materials.deck, Math.max(1, sites.length));
  const posts = new THREE.InstancedMesh(box, materials.post, Math.max(1, sites.length * 2));
  const crosses = new THREE.InstancedMesh(box, materials.cross, Math.max(1, sites.length * 4));
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), materials.lamp, Math.max(1, sites.length * 4));
  const boomArms = new THREE.InstancedMesh(box, materials.cross, Math.max(1, booms.length * 2));
  for (const mesh of [posts, crosses, boomArms]) mesh.castShadow = true;
  decks.receiveShadow = true;

  const place = (mesh: THREE.InstancedMesh, index: number, at: THREE.Vector3, rotation: THREE.Euler, scale: [number, number, number]) => {
    dummy.position.copy(at);
    dummy.rotation.copy(rotation);
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  const boomState: { site: CrossingSite; pivot: THREE.Vector3; reach: THREE.Vector3; length: number }[] = [];

  sites.forEach((site, index) => {
    const { position, roadHeading, railHeading, width } = site;
    // The deck is the road carried across the formation, aligned to the road.
    place(decks, index, position.clone().setY(position.y + 0.09), new THREE.Euler(0, roadHeading, 0), [width + 3, 0.18, width]);

    // A post either side of the road, set back from the rail.
    const across = new THREE.Vector3(Math.cos(roadHeading), 0, -Math.sin(roadHeading));
    const along = new THREE.Vector3(-across.z, 0, across.x);
    for (const side of [-1, 1]) {
      const foot = position.clone().addScaledVector(along, side * (width / 2 + 1.6)).addScaledVector(across, side * 5.5);
      const postIndex = index * 2 + (side < 0 ? 0 : 1);
      place(posts, postIndex, foot.clone().setY(foot.y + 1.6), new THREE.Euler(0, railHeading, 0), [0.24, 3.2, 0.24]);
      // St Andrew's cross: two bars at 45 degrees.
      for (const [k, tilt] of [[0, Math.PI / 4], [1, -Math.PI / 4]] as const) {
        place(crosses, index * 4 + (side < 0 ? 0 : 2) + k, foot.clone().setY(foot.y + 3.3),
          new THREE.Euler(0, railHeading, tilt), [1.5, 0.16, 0.1]);
      }
      // Twin lamps below the cross.
      for (const k of [0, 1]) {
        place(lamps, index * 4 + (side < 0 ? 0 : 2) + k,
          foot.clone().addScaledVector(along, (k ? 0.45 : -0.45)).setY(foot.y + 2.6),
          new THREE.Euler(), [1, 1, 1]);
      }
      if (width >= BOOM_WIDTH) {
        // A half-boom on each approach, pivoting at the post and reaching across
        // its own half of the road. `reach` points from the post into the road.
        boomState.push({ site, pivot: foot.clone().setY(foot.y + 1.05), reach: along.clone().multiplyScalar(-side), length: width / 2 + 0.8 });
      }
    }
  });

  group.add(decks, posts, crosses, lamps);
  if (booms.length) group.add(boomArms);

  // Start dark rather than at the material's default, which would leave every
  // crossing lit until the train happened to change the flash state.
  materials.lamp.emissive.set('#ff2b2b');
  materials.lamp.emissiveIntensity = 0;
  let last = -1;

  /**
   * Each boom's lowering, 0 raised (vertical) to 1 lowered (across the road).
   * Eased toward its target rather than snapped, since a boom that teleports
   * between positions is worse than one that does not move at all.
   */
  const boomAngles = boomState.map(() => 0);
  const writeBooms = () => {
    boomState.forEach((boom, index) => {
      // Raised is straight up; lowered lies along `reach`.
      const lowered = boomAngles[index];
      const direction = new THREE.Vector3(0, 1, 0).lerp(boom.reach, lowered).normalize();
      const centre = boom.pivot.clone().addScaledVector(direction, boom.length / 2);
      dummy.position.copy(centre);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
      dummy.scale.set(boom.length, 0.14, 0.14);
      dummy.updateMatrix();
      boomArms.setMatrixAt(index, dummy.matrix);
    });
    boomArms.instanceMatrix.needsUpdate = true;
  };
  writeBooms();
  let lastTime = 0;

  return {
    group,
    count: sites.length,
    update(trainPosition: THREE.Vector3, time: number) {
      // A crossing wakes up when the train is within 400 m of it.
      const near = sites.some(site => site.position.distanceToSquared(trainPosition) < 400 * 400);
      // Alternating red, the way a real crossing flashes side to side.
      const intensity = near ? (Math.sin(time * 6) > 0 ? 3.2 : 0.6) : 0;
      if (intensity !== last) {
        last = intensity;
        materials.lamp.emissiveIntensity = intensity;
      }

      // Booms follow their own crossing, not the nearest one: a train at one
      // crossing must not close the gates at another a kilometre away.
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      let moved = false;
      boomState.forEach((boom, index) => {
        // Lights first, gates after: booms start down at 300 m, lights at 400.
        const closing = boom.site.position.distanceToSquared(trainPosition) < 300 * 300;
        const target = closing ? 1 : 0;
        const next = THREE.MathUtils.damp(boomAngles[index], target, 2.2, dt);
        if (Math.abs(next - boomAngles[index]) > 1e-4) { boomAngles[index] = next; moved = true; }
      });
      if (moved) writeBooms();
    },
    /** Boom lowering per boom, 0 raised to 1 lowered. For tests and debug. */
    get booms() { return [...boomAngles]; },
    dispose() {
      box.dispose();
      lamps.geometry.dispose();
      for (const mesh of [decks, posts, crosses, lamps, boomArms]) mesh.dispose();
    },
  };
}
