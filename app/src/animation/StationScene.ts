import * as THREE from 'three';
import { createBoard, createPostedSign, SIGN_STYLES } from './Signage';

// Original, deliberately approximate architecture. No borrowed landmark mesh,
// photograph or satellite texture is represented as a real station survey.
export function createStationStudy() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1), batches = new Map<string, THREE.Matrix4[]>();
  function box(size: [number, number, number], position: [number, number, number], color: string, roll = 0) {
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color)!.push(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll), new THREE.Vector3(...size)));
  }
  box([165, .8, 13], [-10, .05, -16], '#d0bfa1');
  box([165, .05, .4], [-10, .48, -9.6], '#e2b953');
  // A plinth down to below the pad. The building's boxes start at 0.4 m, and
  // the levelled ground sits at -0.3, which left a 0.7 m gap under the whole
  // facade and an open trench between the platform and the building.
  box([80, 0.8, 19], [0, 0, 0], '#c9b894');
  box([76, 7.8, 16], [0, 4.3, 0], '#dac7a5');
  box([80, .9, 19], [0, 8.5, 0], '#705e55');
  // Central entrance and clock tower give the study a recognisable silhouette.
  box([14, 12, 17], [0, 6.4, 0], '#e7d7b6');
  box([16, .6, 18], [0, 12.5, 0], '#a18d6d');
  box([9, 6, 9], [0, 15.5, 0], '#dec8a1');
  box([11, .8, 11], [0, 18.8, 0], '#6b6355');
  box([6, 5, .2], [0, 3, -8.6], '#304a4c');
  for (const x of [-32, -24, -16, 16, 24, 32]) {
    box([4.4, 4.4, .35], [x, 4.5, -8.15], '#f1e3c8');
    box([3.6, 3.6, .4], [x, 4.5, -8.4], '#406164');
    box([.18, 3.6, .45], [x, 4.5, -8.45], '#e5d3ab');
    box([3.6, .18, .45], [x, 4.5, -8.45], '#e5d3ab');
  }
  box([130, .35, 9], [-10, 6.3, -14], '#4c6969');
  for (let x = -70; x <= 50; x += 12) {
    box([.3, 6, .3], [x, 3.4, -18], '#405856');
    box([.3, 2.3, .25], [x - .75, 5.3, -18], '#405856', -.65);
    box([.3, 2.3, .25], [x + .75, 5.3, -18], '#405856', .65);
    box([11.8, .24, .25], [x + 6, 6, -18], '#405856');
  }
  for (const x of [-55, -30, 24, 44]) {
    box([5, .25, 1.2], [x, 1.2, -14], '#8a6a49');
    box([5, 1, .2], [x, 1.8, -14.6], '#8a6a49');
    for (const dx of [-1.7, 1.7]) box([.2, .8, 1], [x + dx, .8, -14], '#405856');
    box([.2, 4.5, .2], [x, 2.7, -10.5], '#405856');
  }
  // Platform lamps are their own material so they can be lit after dark.
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff0bf', roughness: .5 });
  const lampGeometry = new THREE.BoxGeometry(.65, .8, .65);
  const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, 4);
  [-55, -30, 24, 44].forEach((x, i) => {
    lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 5.1, -10.5));
  });
  lamps.instanceMatrix.needsUpdate = true;
  root.add(lamps);

  // Signage. Place names and plain wayfinding only - no operator branding.
  const signPosts = new THREE.MeshStandardMaterial({ color: '#405856', roughness: .7 });
  const boards: { dispose(): void }[] = [];
  const addBoard = (board: { mesh: THREE.Object3D; dispose(): void }, x: number, y: number, z: number, rotation: number) => {
    board.mesh.position.set(x, y, z);
    board.mesh.rotation.y = rotation;
    root.add(board.mesh);
    boards.push(board);
  };

  // The name, on the platform face, readable from a passing train.
  for (const x of [-46, 8, 52]) {
    addBoard(createBoard('PRETORIA', 5.2, 1.0, SIGN_STYLES.station), x, 3.1, -8.55, 0);
  }
  // And on a stand at each end of the platform, facing along it.
  for (const [x, facing] of [[-78, Math.PI / 2], [58, -Math.PI / 2]] as const) {
    addBoard(createPostedSign('PRETORIA', 4.4, 0.92, SIGN_STYLES.station, signPosts), x, 0.5, -14, facing);
  }
  // Platform numbers, facing the concourse.
  for (const [x, label] of [[-20, 'PLATFORM 1'], [30, 'PLATFORM 2']] as const) {
    addBoard(createBoard(label, 3.0, 0.72, SIGN_STYLES.platform), x, 6.05, -9.75, 0);
  }

  const owned: { dispose(): void }[] = [geometry, signPosts];
  for (const [color, matrices] of batches) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .85 });
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); root.add(mesh);
    // The shared geometry, each colour's material and every instance buffer -
    // none of which the others release.
    owned.push(material, mesh);
  }
  const dial = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshStandardMaterial({ color: '#fff3d3', side: THREE.DoubleSide }));
  dial.position.set(0, 15.7, -4.56); root.add(dial);
  owned.push(dial.geometry, dial.material as THREE.Material);
  const clock = new THREE.Group(); clock.position.copy(dial.position).z -= .05; root.add(clock);
  const hand = (length: number, width: number, angle: number) => { const group = new THREE.Group(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, .04), new THREE.MeshStandardMaterial({ color: '#304a4c' })); mesh.position.y = length / 2 - .1; group.add(mesh); owned.push(mesh.geometry, mesh.material as THREE.Material); group.rotation.z = angle; clock.add(group); return group; };
  hand(1, .13, -Math.PI / 3); hand(1.45, .08, Math.PI / 5);
  const second = hand(1.5, .035, 0);
  const focus = new THREE.Vector3(0, 5, -13);
  return {
    root, focus,
    /** Registered with TimeOfDay so the platform lights up at night. */
    lampMaterial,
    update(seconds: number) { second.rotation.z = -seconds * Math.PI / 30; },
    dispose() {
      for (const board of boards) board.dispose();
      for (const item of owned) item.dispose();
      lampGeometry.dispose();
      lampMaterial.dispose();
      lamps.dispose();
    },
  };
}
