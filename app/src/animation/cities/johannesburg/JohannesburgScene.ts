import * as THREE from 'three';
import { stationMotion } from './StationMotion.ts';
import { createStreetLife } from './StreetLife.ts';
import { createCityArchitecture } from './CityArchitecture.ts';
import { createStationDetails } from './StationDetails.ts';

/** Metres, Y up, X along the authored station tracks. Not surveyed architecture. */
export const johannesburgMetadata = {
  name: 'Johannesburg · Park Station arrival study',
  anchor: { lat: -26.1976708, lon: 28.0423048 },
  notice: 'Approximate station and skyline · authored layout, not a surveyed reconstruction',
  source: 'Local OSM station node 326084268; local johannesburg.webp skyline reference',
};

export function arrivalPosition(time: number) {
  return stationMotion(THREE.MathUtils.clamp(time, 0, 24)).x;
}

export function createJohannesburgScene(railFrame?: (along: number, lateral: number) => { position: THREE.Vector3; yaw: number }) {
  const root = new THREE.Group(); root.name = 'johannesburg-arrival-study';
  const unit = new THREE.BoxGeometry(1, 1, 1), glazing = new THREE.PlaneGeometry(1, 1);
  const batches = new Map<string, THREE.Matrix4[]>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geometry: THREE.BufferGeometry[] = [unit, glazing];
  const matrix = new THREE.Matrix4();
  function box(size: number[], position: number[], color: string, emissive = false, rotation = new THREE.Quaternion()) {
    const key = `${color}:${emissive}`;
    if (!batches.has(key)) batches.set(key, []);
    // In the connected world, platform edges and secondary tracks follow the
    // same alignment as the train. Split long extrusions into rigid sections.
    if (railFrame && Math.abs(position[2]) <= 40 && size[2] < 80 && Math.abs(rotation.z) < .001) {
      const count = Math.max(1, Math.ceil(size[0] / 8));
      for (let i = 0; i < count; i++) {
        const x = position[0] - size[0] / 2 + size[0] / count * (i + .5);
        const pose = railFrame(x, position[2]); pose.position.y += position[1];
        const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw).multiply(rotation);
        batches.get(key)!.push(matrix.compose(pose.position, orientation, new THREE.Vector3(size[0] / count + (count > 1 ? .02 : 0), size[1], size[2])).clone());
      }
    } else batches.get(key)!.push(matrix.compose(new THREE.Vector3(...position), rotation, new THREE.Vector3(...size)).clone());
  }
  // A finite station diorama; no hidden satellite or DEM requests.
  box([1250, 2, 850], [0, -1.1, 150], '#655e53');
  box([1150, .12, 140], [0, -.04, 0], '#736e65');
  const trackCentres = railFrame ? [-24, -12, 12, 24] : [-24, -12, 0, 12, 24];
  for (const z of trackCentres) {
    box([1100, .12, 3.4], [0, .06, z], '#92897b');
    for (let x = -540; x <= 540; x += 1.8) box([.24, .12, 2.4], [x, .15, z], '#514944');
    for (const side of [-1, 1]) box([1100, .14, .07], [0, .28, z + side * .5335], '#c2c6c4');
  }
  for (const z of [-18, -6, 6, 18]) {
    box([320, 1.05, 8.5], [0, .525, z], '#b6aa95');
    for (const sign of [-1, 1]) box([317, .025, .26], [0, 1.064, z + sign * 4], '#eec25e');
    // Shallow folded canopy: readable thickness, open sides, repeated supports.
    box([292, .24, 7.6], [0, 5.35, z], '#75949a');
    box([292, .12, .35], [0, 5.54, z], '#d6d2bc');
    for (let x = -138; x <= 138; x += 23) {
      box([.24, 4.3, .24], [x, 3.2, z], '#435f67');
      box([.28, .28, 6.8], [x, 5.1, z], '#435f67');
      box([2.8, .13, .7], [x + 5, 1.55, z], '#8c5f42');
      for (const dx of [4, 6]) box([.12, .45, .5], [x + dx, 1.29, z], '#39464b');
      box([1.5, .08, .5], [x, 5.17, z + 2.1], '#ffe6b3', true);
    }
  }
  // Station lettering is a generated sign texture, never a photographic scene panel.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#183c47'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#e8be64'; ctx.fillRect(0, 0, 1024, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff2d9'; ctx.font = 'bold 76px sans-serif'; ctx.fillText('JOHANNESBURG', 512, 110);
    ctx.font = '40px sans-serif'; ctx.fillText('PARK STATION', 512, 185);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const signGeometry = new THREE.PlaneGeometry(8, 2), signMaterial = new THREE.MeshBasicMaterial({ map: texture });
    geometry.push(signGeometry); materials.push(signMaterial);
    for (const x of [-100, -20, 65]) for (const z of [-6, 6]) {
      for (const side of [-1, 1]) {
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        const pose = railFrame?.(x + side * .01, z);
        sign.position.copy(pose?.position ?? new THREE.Vector3(x + side * .01, 0, z)); sign.position.y += 4;
        sign.rotation.y = side * Math.PI / 2 + (pose?.yaw ?? 0); root.add(sign);
      }
    }
  }
  // Concourse spans the platform ends, with stairs kept outside the train envelope.
  box([26, .7, 75], [185, 8, 0], '#b8b5a8');
  box([27, .4, 77], [185, 12.8, 0], '#547782');
  for (const z of [-34, 34]) {
    box([26, 3.4, .16], [185, 10.5, z], '#477480');
    for (const x of [173, 197]) box([.65, 12, .65], [x, 6, z], '#bdbaa9');
  }
  for (const z of [-18, 18]) {
    for (let step = 0; step < 39; step++) {
      const h = 1.05 + (step + 1) * (8.35 - 1.05) / 39, x = 155 + step * .45;
      box([.45, h, 2.2], [x, h / 2, z], '#a9a698');
      if (step % 4 === 0) for (const sign of [-1, 1]) box([.06, 1.05, .06], [x, h + .525, z + sign * 1.05], '#435f67');
    }
    for (const sign of [-1, 1]) {
      const a = new THREE.Vector3(155, 1.05 + 7.3 / 39 + 1.05, z + sign * 1.05), b = new THREE.Vector3(172.1, 9.4, z + sign * 1.05), d = b.clone().sub(a);
      box([.07, d.length(), .07], a.clone().add(b).multiplyScalar(.5).toArray(), '#435f67', false, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    }
  }
  // Catenary is static infrastructure; no smoke or steam on the electric rake.
  for (let x = -480; x <= 480; x += 48) {
    for (const z of [-31, 31]) box([.22, 7.4, .22], [x, 3.7, z], '#646c69');
    box([.2, .2, 62], [x, 7.3, 0], '#646c69');
  }
  for (const z of trackCentres) box([1080, .035, .035], [0, 6.45, z], '#55544d');
  const architecture = createCityArchitecture(); root.add(architecture.root);
  const stationDetails = createStationDetails(); root.add(stationDetails.root);
  for (const [key, transforms] of batches) {
    const [color, glow] = key.split(':');
    const isGlazing = color === '#e7c78b' || color === '#344b59';
    const material = new THREE.MeshStandardMaterial({ color, roughness: .8, emissive: glow === 'true' ? color : '#000000', emissiveIntensity: .65, side: isGlazing ? THREE.DoubleSide : THREE.FrontSide });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(isGlazing ? glazing : unit, material, transforms.length);
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh);
  }
  const trainRoot = new THREE.Group(); trainRoot.name = 'arrival-train'; root.add(trainRoot);
  const streetLife = createStreetLife(); root.add(streetLife.root);
  // Low-cost moving platform passengers, visibly dimensional, not photographic sprites.
  const people: THREE.Group[] = [];
  const bodyGeo = new THREE.CylinderGeometry(.18, .23, .85, 6), headGeo = new THREE.SphereGeometry(.16, 6, 4);
  geometry.push(bodyGeo, headGeo);
  const coat = new THREE.MeshStandardMaterial({ color: '#bf7c49' }), skin = new THREE.MeshStandardMaterial({ color: '#694b36' }); materials.push(coat, skin);
  for (let i = 0; i < 18; i++) {
    const person = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, coat); body.position.y = 1; person.add(body);
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.65; person.add(head);
    for (const sign of [-1, 1]) { const leg = new THREE.Mesh(unit, coat); leg.scale.set(.13, .55, .14); leg.position.set(sign * .12, .28, 0); person.add(leg); }
    person.position.set(-130 + i * 15, 1.06, i % 2 ? 6 : -6); people.push(person); root.add(person);
  }
  let disposed = false;
  return {
    root, trainRoot,
    setFallbackPassengers(visible: boolean) { people.forEach(person => { person.visible = visible; }); },
    setNight(night: boolean) {
      streetLife.setNight(night); architecture.setNight(night); stationDetails.setNight(night);
      materials.forEach(m => { if (m instanceof THREE.MeshStandardMaterial && m.emissive.getHex() !== 0) m.emissiveIntensity = night ? 2 : .15; });
    },
    update(time: number, worldTime = time) {
      if (disposed) return;
      trainRoot.position.x = arrivalPosition(time);
      streetLife.update(worldTime); stationDetails.update(worldTime);
      people.forEach((p, i) => { p.position.x = -130 + i * 15 + Math.sin(worldTime * .15 + i) * 3; p.rotation.y = Math.cos(worldTime * .15 + i) >= 0 ? Math.PI / 2 : -Math.PI / 2; const stride = Math.sin(worldTime * 2 + i) * Math.abs(Math.cos(worldTime * .15 + i)) * .2; p.children[2].rotation.x = stride; p.children[3].rotation.x = -stride; });
    },
    dispose() {
      if (disposed) return; disposed = true;
      streetLife.dispose(); architecture.dispose(); stationDetails.dispose();
      root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.removeFromParent();
      // The caller owns models attached to trainRoot and disposes those separately.
    },
  };
}
