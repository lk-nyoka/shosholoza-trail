import * as THREE from 'three';

/** Authored streets occupy the gaps between the study's blocks, not real OSM streets. */
export function createStreetLife() {
  const root = new THREE.Group(); root.name = 'johannesburg-street-life';
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const unit = new THREE.BoxGeometry(1, 1, 1); geometries.add(unit);
  const batches = new Map<string, THREE.Matrix4[]>();
  const emissive: THREE.MeshStandardMaterial[] = [];
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  function material(color: string, glow = false) {
    const key = `${color}:${glow}`, existing = materialCache.get(key); if (existing) return existing;
    const m = new THREE.MeshStandardMaterial({ color, roughness: .85, emissive: glow ? color : '#000000', emissiveIntensity: .15 });
    materials.add(m); materialCache.set(key, m); if (glow) emissive.push(m); return m;
  }
  function box(size: [number, number, number], position: [number, number, number], color: string) {
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color)!.push(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion(), new THREE.Vector3(...size)));
  }
  // Connected streets and pavements, with crossings at intersections.
  for (const z of [90, 195, 300, 405, 510]) {
    box([976, .08, 18], [-22.5, .02, z], '#3b454b');
    for (const side of [-1, 1]) box([976, .18, 3], [-22.5, .09, z + side * 10.5], '#b5ac97');
    for (let x = -498; x < 452; x += 12) box([5, .025, .13], [x, .08, z], '#d1be8a');
  }
  for (let col = 0; col <= 10; col++) {
    const x = -497.5 + col * 95;
    box([16, .085, 438], [x, .0175, 300], '#3b454b');
    for (const side of [-1, 1]) box([2, .18, 423], [x + side * 9, .09, 300], '#b5ac97');
    for (let z = 110; z < 505; z += 12) {
      if ([195, 300, 405].some(crossing => Math.abs(crossing - z) < 14)) continue;
      box([.13, .025, 5], [x, .085, z], '#d1be8a');
    }
    for (const z of [90, 195, 300, 405, 510]) for (let stripe = -5; stripe <= 5; stripe += 2) {
      box([1.1, .025, 3], [x + stripe, .1, z + 11], '#dbd8c9');
    }
  }
  // Station forecourt stays north of the track envelope.
  box([320, .24, 30], [0, .12, 60], '#ad9e87');
  for (const x of [-140, -70, 0, 70, 140]) {
    box([10, .65, 9], [x, .325, 60], '#6d7861');
    box([7, .7, .65], [x, .6, 53], '#84694d');
  }
  const trunkGeo = new THREE.CylinderGeometry(.22, .38, 4.4, 6), crownGeo = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(trunkGeo); geometries.add(crownGeo);
  const trunkMat = material('#695343'), crownMat = material('#66745a');
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 45), crowns = new THREE.InstancedMesh(crownGeo, crownMat, 45 * 4);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  for (let i = 0; i < 45; i++) {
    const x = i < 5 ? -140 + i * 70 : -465 + (i - 5) % 10 * 95;
    const z = i < 5 ? 60 : 111 + Math.floor((i - 5) / 10) * 105;
    trunks.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 2.35, z), rotation, new THREE.Vector3(1, 1, 1)));
    for (let j = 0; j < 4; j++) {
      const a = j * Math.PI * .5 + i;
      crowns.setMatrixAt(i * 4 + j, matrix.compose(new THREE.Vector3(x + Math.cos(a) * 1.45, 5 + j % 2 * .7, z + Math.sin(a) * 1.45), rotation, new THREE.Vector3(2.1, 1.8, 2)));
    }
  }
  trunks.castShadow = crowns.castShadow = true; trunks.computeBoundingSphere(); crowns.computeBoundingSphere(); root.add(trunks, crowns);
  const lampGlow = material('#ffe0a0', true), lamps = new THREE.InstancedMesh(unit, lampGlow, 40);
  for (let i = 0; i < 40; i++) {
    const x = -450 + i % 10 * 95, z = 78 + Math.floor(i / 10) * 105;
    box([.15, 6, .15], [x, 3, z], '#4e5b61'); box([2, .15, .15], [x + .9, 5.9, z], '#4e5b61');
    lamps.setMatrixAt(i, matrix.compose(new THREE.Vector3(x + 1.6, 5.78, z), rotation, new THREE.Vector3(.75, .12, .5)));
  }
  lamps.computeBoundingSphere(); root.add(lamps);
  for (const [color, transforms] of batches) {
    const mesh = new THREE.InstancedMesh(unit, material(color), transforms.length);
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh);
  }
  function streetLoop(reverse: boolean) {
    // South African left-hand traffic: clockwise uses the outside lane and
    // counter-clockwise the inside lane. Both derive from the SAME road centres.
    const lane = reverse ? -4 : 4;
    const l = -497.5 - lane, r = 452.5 + lane, t = 90 - lane, b = 510 + lane, radius = 7 + lane;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const v = (x: number, z: number) => new THREE.Vector3(x, .06, z);
    const line = (a: THREE.Vector3, b: THREE.Vector3) => curve.add(new THREE.LineCurve3(a, b));
    const bend = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3) => curve.add(new THREE.QuadraticBezierCurve3(a, c, b));
    line(v(l + radius, t), v(r - radius, t)); bend(v(r - radius, t), v(r, t), v(r, t + radius));
    line(v(r, t + radius), v(r, b - radius)); bend(v(r, b - radius), v(r, b), v(r - radius, b));
    line(v(r - radius, b), v(l + radius, b)); bend(v(l + radius, b), v(l, b), v(l, b - radius));
    line(v(l, b - radius), v(l, t + radius)); bend(v(l, t + radius), v(l, t), v(l + radius, t));
    return curve;
  }
  const paths = [streetLoop(false), streetLoop(true)];
  const cars: THREE.Group[] = [];
  const glass = material('#2e4955'), tyre = material('#24292b'), lights = material('#ffdfa5', true);
  for (let i = 0; i < 14; i++) {
    const car = new THREE.Group(), isTaxi = i % 4 === 0;
    const paint = material(isTaxi ? '#e8e4d5' : ['#ad714e', '#748891', '#c8b787'][i % 3]);
    const part = (size: number[], at: number[], mat: THREE.Material) => { const mesh = new THREE.Mesh(unit, mat); mesh.scale.set(...size as [number, number, number]); mesh.position.set(...at as [number, number, number]); mesh.castShadow = true; car.add(mesh); };
    part([isTaxi ? 5.2 : 4.2, .9, 1.8], [0, .85, 0], paint);
    part([isTaxi ? 3.9 : 2.3, .85, 1.65], [-.3, 1.65, 0], glass);
    if (isTaxi) part([4, .13, 1.75], [-.3, 2.12, 0], paint);
    for (const x of [-1.4, 1.4]) for (const z of [-.88, .88]) part([.65, .65, .22], [x, .325, z], tyre);
    for (const z of [-.6, .6]) part([.05, .2, .3], [isTaxi ? 2.62 : 2.12, .85, z], lights);
    cars.push(car);
  }
  // Batch vehicle parts by material: fourteen cars must not cost 126 draw calls.
  const parts = new Map<THREE.Material, { car: THREE.Group; local: THREE.Matrix4 }[]>();
  for (const car of cars) for (const child of car.children) {
    const mesh = child as THREE.Mesh; mesh.updateMatrix(); const mat = mesh.material as THREE.Material;
    if (!parts.has(mat)) parts.set(mat, []); parts.get(mat)!.push({ car, local: mesh.matrix.clone() });
  }
  const movingBatches = [...parts].map(([mat, entries], index) => {
    const mesh = new THREE.InstancedMesh(unit, mat, entries.length); mesh.castShadow = true; mesh.frustumCulled = false; root.add(mesh);
    mesh.name = `street-vehicles-${index}`;
    return { mesh, entries };
  });
  let disposed = false;
  return {
    root,
    update(time: number) {
      cars.forEach((car, i) => {
        const reverse = i % 2 === 1, u = ((i / cars.length + time * (reverse ? -.0025 : .0025)) % 1 + 1) % 1;
        const path = paths[reverse ? 1 : 0], direction = path.getTangentAt(u);
        car.position.copy(path.getPointAt(u)); car.rotation.y = Math.atan2(-direction.z, direction.x) + (reverse ? Math.PI : 0);
        car.updateMatrix();
      });
      for (const { mesh, entries } of movingBatches) {
        entries.forEach(({ car, local }, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(car.matrix, local)));
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    setNight(night: boolean) { emissive.forEach(m => { m.emissiveIntensity = night ? 2.5 : .15; }); },
    dispose() { if (disposed) return; disposed = true; root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.removeFromParent(); },
  };
}
