import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStreetLights } from '../app/src/animation/StreetLights.ts';
import type { RoadData, RoadRecord } from '../app/src/animation/Roads.ts';

const GROUND = 50;

// Coordinates are metres directly (lon -> x, lat -> z), on raised ground: any
// part placed at an absolute height instead of relative to the ground shows up.
const project = (lon: number, lat: number) => new THREE.Vector3(lon, GROUND, lat);

const road = (highway: string, extra: Partial<RoadRecord> = {}, z = 0, length = 380): RoadRecord => ({
  highway, width: 10, name: null, lengthMetres: length,
  points: [[0, z], [length / 2, z], [length, z]],
  ...extra,
});

const data = (...roads: RoadRecord[]): RoadData => ({ count: roads.length, roads });

const positions = (mesh: THREE.InstancedMesh) => {
  const matrix = new THREE.Matrix4();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    out.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  return out;
};

const meshNamed = (group: THREE.Group, name: string) => group.getObjectByName(name) as THREE.InstancedMesh;

test('only lit classes on the ground get lights', () => {
  const pole = new THREE.MeshStandardMaterial();
  for (const unlit of [road('residential'), road('service'), road('primary', { bridge: true }), road('secondary', { tunnel: true })]) {
    const lights = createStreetLights(data(unlit), project, pole);
    assert.equal(lights.count, 0, `${unlit.highway} bridge=${unlit.bridge} tunnel=${unlit.tunnel}`);
    lights.dispose();
  }
  const lit = createStreetLights(data(road('primary')), project, pole);
  assert.ok(lit.count > 0);
  lit.dispose();
});

test('a straight 380 m primary road gets about ten lights', () => {
  const lights = createStreetLights(data(road('primary')), project, new THREE.MeshStandardMaterial());
  assert.ok(Math.abs(lights.count - 10) <= 1, `got ${lights.count}`);
  lights.dispose();
});

test('lights alternate sides and stand clear of the carriageway', () => {
  const lights = createStreetLights(data(road('primary')), project, new THREE.MeshStandardMaterial());
  const poles = positions(meshNamed(lights.group, 'street-light-poles'));
  assert.ok(poles.length >= 2);
  for (let i = 0; i < poles.length; i++) {
    // Road runs along x at z = 0: lateral offset is z. Width 10 -> 5 + 1.2.
    assert.ok(Math.abs(Math.abs(poles[i].z) - 6.2) < 1e-6, `pole ${i} at z=${poles[i].z}`);
    if (i > 0) assert.notEqual(Math.sign(poles[i].z), Math.sign(poles[i - 1].z));
  }
  lights.dispose();
});

test('heads sit about 8 m above the ground they stand on, reaching over the road', () => {
  const lights = createStreetLights(data(road('primary')), project, new THREE.MeshStandardMaterial());
  const heads = meshNamed(lights.group, 'street-light-heads');
  heads.geometry.computeBoundingBox();
  const local = heads.geometry.boundingBox!.getCenter(new THREE.Vector3());
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < heads.count; i++) {
    heads.getMatrixAt(i, matrix);
    const base = new THREE.Vector3().setFromMatrixPosition(matrix);
    const head = local.clone().applyMatrix4(matrix);
    assert.ok(Math.abs(head.y - (GROUND + 8)) < 0.5, `head ${i} at y=${head.y}`);
    // The arm points toward the centreline, so the head is nearer the road than the post.
    assert.ok(Math.abs(head.z) < Math.abs(base.z), `head ${i} leans away from the road`);
  }
  lights.dispose();
});

test('maxLights is respected and higher classes win', () => {
  const pole = new THREE.MeshStandardMaterial();
  // Tertiary listed first, primary at z = 500: the cap must go to the primary.
  const roads = data(road('tertiary', {}, 0), road('primary', {}, 500));
  const capped = createStreetLights(roads, project, pole, { maxLights: 6 });
  assert.equal(capped.count, 6);
  for (const p of positions(meshNamed(capped.group, 'street-light-poles'))) {
    assert.ok(Math.abs(p.z - 500) < 10, `capped light on the tertiary at z=${p.z}`);
  }
  capped.dispose();

  const trunkFirst = createStreetLights(data(road('secondary', {}, 0), road('trunk', {}, 500)), project, pole, { maxLights: 12 });
  const zs = positions(meshNamed(trunkFirst.group, 'street-light-poles')).map(p => p.z);
  assert.equal(zs.filter(z => z > 250).length, 10, 'the whole trunk is lit before the secondary');
  assert.equal(zs.filter(z => z < 250).length, 2);
  trunkFirst.dispose();
});

test('count matches instances; four meshes; lamps and pools start dark; dispose leaves the pole material', () => {
  const pole = new THREE.MeshStandardMaterial();
  let poleDisposed = false;
  pole.addEventListener('dispose', () => { poleDisposed = true; });
  const lights = createStreetLights(data(road('primary'), road('secondary', {}, 300)), project, pole);
  const meshes = lights.group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
  assert.equal(meshes.length, 4, 'poles, arms, heads and light pools');
  for (const mesh of meshes) {
    assert.equal(mesh.count, lights.count);
    assert.equal(mesh.castShadow, false);
  }
  assert.equal(lights.lampMaterial.emissiveIntensity, 0);
  assert.equal(lights.poolMaterial.emissiveIntensity, 0, 'pools must be dark by day');
  assert.equal(lights.poolMaterial.blending, THREE.AdditiveBlending, 'pools add light, they do not paint over the road');
  assert.notEqual(lights.lampMaterial.emissive.getHex(), 0);
  let lampDisposed = false;
  lights.lampMaterial.addEventListener('dispose', () => { lampDisposed = true; });
  assert.doesNotThrow(() => lights.dispose());
  assert.equal(poleDisposed, false);
  assert.equal(lampDisposed, true);
});

test('an empty road set builds cleanly', () => {
  const lights = createStreetLights(data(), project, new THREE.MeshStandardMaterial());
  assert.equal(lights.count, 0);
  assert.doesNotThrow(() => lights.dispose());
});

test('light pools take no fog, or distant ones paint pale squares in daylight', () => {
  const lights = createStreetLights({ count: 0, roads: [] }, (lon: number, lat: number) => new THREE.Vector3(lon, 0, lat), new THREE.MeshBasicMaterial());
  assert.equal(lights.poolMaterial.fog, false);
  lights.dispose();
});

test('posts stand on the ground at the post, and pools on the highest ground beneath them', () => {
  // Road vertices report y=0, but the real ground slopes across the road:
  // 0.1 m of rise per metre in z. Interpolating the road's heights would put
  // every post at 0.
  const slope = (_x: number, z: number) => z * 0.1;
  const road = { highway: 'primary', width: 10, name: 'Slope Road', lengthMetres: 380, points: [[0, 0], [380, 0]] as [number, number][] };
  const lights = createStreetLights({ count: 1, roads: [road] }, (lon: number, lat: number) => new THREE.Vector3(lon, 0, lat),
    new THREE.MeshBasicMaterial(), { groundAt: slope });
  const [poles, , , pools] = lights.group.children as THREE.InstancedMesh[];
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
  for (let i = 0; i < lights.count; i++) {
    poles.getMatrixAt(i, matrix); at.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(at.y - slope(at.x, at.z)) < 1e-6, `post ${i} at ${at.y}, ground ${slope(at.x, at.z)}`);
    pools.getMatrixAt(i, matrix); const pool = new THREE.Vector3().setFromMatrixPosition(matrix);
    // The pool must not sit below the ground anywhere under its centre.
    assert.ok(pool.y >= at.y - 2, 'pool height is taken from the ground under the road, near the post');
  }
  lights.dispose();
});
