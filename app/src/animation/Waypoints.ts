// Named places the train passes.
//
// The journey ran through real places and said nothing about any of them. These
// are what OpenStreetMap records beside this stretch of line, with OSM's own
// names: Pretoria station, the NZASM works, //Hapo at Freedom Park, Fountains
// Valley. Nothing is invented - a place with no name in OSM is not here.
//
// Each one gets a board beside the line and announces itself as the train
// passes. Passing is detected by segment crossing along the route, not by a
// proximity radius: a radius fires repeatedly while the train sits inside it,
// and misses entirely when a frame steps over it.
import * as THREE from 'three';
import { createPostedSign, SIGN_STYLES } from './Signage.ts';

export type Place = {
  name: string;
  kind: string;
  lon: number;
  lat: number;
  alongMetres: number;
  offsetMetres: number;
  /** -1 or 1: which side of the line it lies on. */
  side: number;
};

export type PlaceData = { count: number; places: Place[] };

/** How far before a place the announcement appears. */
const ANNOUNCE_LEAD = 260;
/** And how far past it before the announcement clears. */
const ANNOUNCE_TRAIL = 220;
/** Boards sit clear of the formation and the catenary masts. */
const BOARD_OFFSET = 13;

export type Waypoints = {
  group: THREE.Group;
  places: Place[];
  /** The place currently being passed, or null. */
  update(distance: number): Place | null;
  dispose(): void;
};

export function createWaypoints(
  data: PlaceData,
  route: { project(distance: number): THREE.Vector3; basis(distance: number): THREE.Vector3 },
  postMaterial: THREE.Material,
  onPass: (place: Place | null) => void,
  /** Ground level. Boards stand 13 m out, beyond the formation, not on it. */
  groundAt: (x: number, z: number) => number = () => 0,
): Waypoints {
  const group = new THREE.Group();
  const boards: { dispose(): void }[] = [];
  // Stations already have their own signage on the platform; a second board
  // beside the line would be clutter.
  const signed = data.places.filter(place => place.kind !== 'Station');

  for (const place of signed) {
    const centre = route.project(place.alongMetres);
    const forward = route.basis(place.alongMetres);
    const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const at = centre.clone().addScaledVector(side, place.side * BOARD_OFFSET);
    // project() gives graded rail level; the board is past the formation, so it
    // stands on the real ground there or its posts float or sink.
    at.y = groundAt(at.x, at.z);

    const board = createPostedSign(place.name.toUpperCase(), 4.6, 0.78, SIGN_STYLES.warning, postMaterial, 1.6);
    board.mesh.position.copy(at);
    // Face back down the line, so it is readable as the train arrives.
    // atan2 already aims the board's face along the direction of travel; the
    // half turn aims it back at the arriving train, on either side of the line.
    board.mesh.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;
    group.add(board.mesh);
    boards.push(board);
  }

  let current: Place | null = null;

  return {
    group,
    places: data.places,
    update(distance: number) {
      // The nearest place whose announcement window contains the train. Sorted
      // input means the first match is the one just reached.
      let next: Place | null = null;
      for (const place of data.places) {
        if (distance >= place.alongMetres - ANNOUNCE_LEAD && distance <= place.alongMetres + ANNOUNCE_TRAIL) {
          // Prefer whichever is closest, so overlapping windows do not flicker
          // between two places a few metres apart.
          const gap = Math.abs(distance - place.alongMetres), best = next ? Math.abs(distance - next.alongMetres) : Infinity;
          // On a tie prefer anything over a station: NZASM shares Pretoria
          // station's position exactly, and was never announced.
          if (!next || gap < best || (gap === best && next.kind === 'Station' && place.kind !== 'Station')) next = place;
        }
      }
      if (next !== current) {
        current = next;
        onPass(current);
      }
      return current;
    },
    dispose() {
      for (const board of boards) board.dispose();
    },
  };
}
