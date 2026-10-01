// Overhead line equipment for the corridor.
//
// The consist is an electric locomotive running under an empty sky, which reads
// as a toy on a green sheet. Masts and wire are what make a strip of ballast
// unmistakably a main line, and because they pass at a fixed interval they also
// give the eye something to measure speed against - at 22 m/s a 55 m span goes
// by every 2.5 seconds, which is most of the sensation of travelling.
//
// The Pretoria-Cape Town main line is 3 kV DC on Cape gauge. Real masts are
// steel lattice or H-section at roughly 50-60 m spacing, with the contact wire
// about 4.9-5.2 m above rail and a messenger wire above it carrying droppers.
// This is that arrangement, simplified: no droppers, no registration arms, no
// tensioning gear.
//
// Everything is instanced: five InstancedMeshes for any length of route.
import * as THREE from 'three';

const SPACING = 55;
const MAST_HEIGHT = 7.6;
const CONTACT_HEIGHT = 5.2;
const MESSENGER_HEIGHT = 6.7;
/** Sag at mid-span, in metres. Small, but a dead-straight wire looks wrong. */
const SAG = 0.22;
/** Distance from track centre to the mast foot. */
const MAST_OFFSET = 3.25;

type Projector = {
  project(distance: number): THREE.Vector3;
  basis(distance: number): THREE.Vector3;
};

export type CatenaryLine = {
  group: THREE.Group;
  masts: number;
  dispose(): void;
};

export function createCatenary(
  { project, basis }: Projector,
  fromMetres: number,
  toMetres: number,
  material: THREE.Material,
  wireMaterial: THREE.Material,
): CatenaryLine {
  const group = new THREE.Group();
  const spans = Math.floor((toMetres - fromMetres) / SPACING);
  const mastCount = spans + 1;

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  const masts = new THREE.InstancedMesh(boxGeometry, material, mastCount);
  const braces = new THREE.InstancedMesh(boxGeometry, material, mastCount);
  const cantilevers = new THREE.InstancedMesh(boxGeometry, material, mastCount);
  // Masts cast; braces and cantilevers are slender enough that their shadows
  // are lost in the mast's own, and they were costing a shadow pass each.
  masts.castShadow = true;
  braces.castShadow = false;
  cantilevers.castShadow = false;

  // Two wires per span.
  const contact = new THREE.InstancedMesh(boxGeometry, wireMaterial, spans * 2);
  const messenger = new THREE.InstancedMesh(boxGeometry, wireMaterial, spans * 2);

  /** Mast feet alternate sides, as they do on a real double-tracked formation. */
  const footFor = (index: number) => {
    const distance = fromMetres + index * SPACING;
    const centre = project(distance);
    const forward = basis(distance);
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const sign = index % 2 ? 1 : -1;
    return {
      distance,
      centre,
      forward,
      side,
      sign,
      foot: centre.clone().addScaledVector(side, sign * MAST_OFFSET),
    };
  };

  for (let i = 0; i < mastCount; i++) {
    const { forward, side, sign, foot } = footFor(i);
    const heading = Math.atan2(-forward.z, forward.x);

    // Upright.
    dummy.position.copy(foot).setY(foot.y + MAST_HEIGHT / 2);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(0.3, MAST_HEIGHT, 0.3);
    dummy.updateMatrix();
    masts.setMatrixAt(i, dummy.matrix);

    // A short diagonal brace at the foot, which is most of what reads as
    // "lattice" from a distance without modelling any lattice.
    dummy.position.copy(foot).addScaledVector(side, -sign * 0.55).setY(foot.y + 1.7);
    dummy.rotation.set(0, heading, sign * 0.55);
    dummy.scale.set(0.18, 3.4, 0.18);
    dummy.updateMatrix();
    braces.setMatrixAt(i, dummy.matrix);

    // Cantilever reaching from the mast out over the track centre.
    const reach = MAST_OFFSET + 0.3;
    dummy.position.copy(foot).addScaledVector(side, -sign * reach / 2).setY(foot.y + MESSENGER_HEIGHT + 0.25);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(0.16, 0.16, reach);
    dummy.updateMatrix();
    cantilevers.setMatrixAt(i, dummy.matrix);
  }

  // Wires. Each span is two straight segments meeting at a sagged midpoint -
  // cheaper than a catenary curve and indistinguishable at this scale.
  const placeWire = (mesh: THREE.InstancedMesh, index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number) => {
    const delta = to.clone().sub(from);
    const length = delta.length();
    const middle = from.clone().add(to).multiplyScalar(0.5);
    dummy.position.copy(middle);
    dummy.scale.set(length, thickness, thickness);
    dummy.rotation.set(0, Math.atan2(-delta.z, delta.x), Math.asin(THREE.MathUtils.clamp(delta.y / (length || 1), -1, 1)));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  for (let span = 0; span < spans; span++) {
    const start = footFor(span), end = footFor(span + 1);
    const midDistance = (start.distance + end.distance) / 2;
    const midCentre = project(midDistance);

    for (const [mesh, height, thickness] of [[contact, CONTACT_HEIGHT, 0.045], [messenger, MESSENGER_HEIGHT, 0.06]] as const) {
      const a = start.centre.clone().setY(start.centre.y + height);
      const b = end.centre.clone().setY(end.centre.y + height);
      const sagged = midCentre.clone().setY(midCentre.y + height - SAG);
      placeWire(mesh, span * 2, a, sagged, thickness);
      placeWire(mesh, span * 2 + 1, sagged, b, thickness);
    }
  }

  group.add(masts, braces, cantilevers, contact, messenger);

  return {
    group,
    masts: mastCount,
    dispose() {
      boxGeometry.dispose();
      for (const mesh of [masts, braces, cantilevers, contact, messenger]) mesh.dispose();
    },
  };
}
