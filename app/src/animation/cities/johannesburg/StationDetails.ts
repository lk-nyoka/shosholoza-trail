import * as THREE from 'three';

/** Authored station furniture and access, not a survey of Park Station. Metres, Y-up. */
export function createStationDetails() {
  const root = new THREE.Group(); root.name = 'johannesburg-station-details';
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const geometries = new Set<THREE.BufferGeometry>([unit]);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const batches = new Map<string, THREE.Matrix4[]>();
  const lights: THREE.MeshStandardMaterial[] = [];
  const identity = new THREE.Quaternion();
  function box(size: number[], at: number[], color: string, rotation = identity) {
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color)!.push(new THREE.Matrix4().compose(new THREE.Vector3(...at), rotation, new THREE.Vector3(...size)));
  }
  function bar(a: THREE.Vector3, b: THREE.Vector3, thickness = .055) {
    const d = b.clone().sub(a);
    box([thickness, d.length(), thickness], a.clone().add(b).multiplyScalar(.5).toArray(), '#39545a',
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  }
  // Inner platforms previously stopped without access to the existing raised concourse.
  function stairs(startX: number, endX: number, z: number, bottom: number, top: number, ascending: boolean) {
    const count = Math.ceil((top - bottom) / .19), tread = (endX - startX) / count;
    const heightAt = (i: number) => bottom + (top - bottom) * (ascending ? (i + 1) / count : (count - i) / count);
    for (let i = 0; i < count; i++) {
      const h = heightAt(i), x = startX + (i + .5) * tread;
      box([tread + .002, h - bottom + .16, 2.2], [x, bottom + (h - bottom - .16) / 2, z], '#b7b1a2');
      box([.045, .015, 2.15], [x + (ascending ? -.5 : .5) * tread, h + .008, z], '#e1c176');
      if (i % 4 === 0 || i === count - 1) for (const side of [-1, 1]) {
        box([.055, 1.05, .055], [x, h + .525, z + side * 1.05], '#39545a');
      }
    }
    for (const side of [-1, 1]) bar(
      new THREE.Vector3(startX + tread / 2, heightAt(0) + 1.05, z + side * 1.05),
      new THREE.Vector3(endX - tread / 2, heightAt(count - 1) + 1.05, z + side * 1.05));
  }
  for (const z of [-6, 6]) stairs(155, 172.55, z, 1.05, 8.35, true);
  // Exit through the open east end of the concourse. Stays outside the outer rail at z=24.
  // It deliberately avoids the existing continuous glass wall at z=34.
  stairs(198, 217.8, 28, .24, 8.35, false);
  box([5.2, .24, 48], [219.5, .12, 51], '#ad9e87');
  box([82, .24, 15], [181, .12, 67.5], '#ad9e87');
  box([4, .24, 3.8], [218, .12, 28], '#ad9e87');
  // Protect raised platform ends except the two-metre staircase openings.
  for (const z of [-18, -6, 6, 18]) {
    for (const endX of [-159.6, 159.6]) for (const side of [-1, 1]) {
      for (const dz of [1.5, 2.7, 3.9]) box([.07, 1.1, .07], [endX, 1.6, z + side * dz], '#39545a');
      for (const y of [1.65, 2.1]) box([.07, .06, 2.4], [endX, y, z + side * 2.7], '#39545a');
    }
    // Ribbed warning surfaces sit inside the existing yellow platform edge, away from wheels.
    for (const side of [-1, 1]) for (let x = -149; x <= 149; x += 1.2) {
      box([.09, .013, .4], [x, 1.073, z + side * 3.6], '#dac49b');
    }
    for (const x of [-105, -40, 85]) {
      box([.55, .82, .55], [x, 1.46, z + 1.35], '#46656a');
      box([.59, .07, .59], [x, 1.905, z + 1.35], '#263f43');
      box([.34, .12, .015], [x, 1.74, z + 1.637], '#111e22');
    }
  }
  // Concourse guardrails at its open ends, preserving the platform and exit stair mouths.
  for (const x of [172.15, 197.85]) {
    for (let z = -36; z <= 36; z += 2) {
      const openings = x < 180 ? [-18, -6, 6, 18] : [28];
      if (openings.some(c => Math.abs(z - c) < 1.6)) continue;
      box([.06, 1.05, .06], [x, 8.875, z], '#39545a');
      if (!openings.some(c => Math.abs(z + 1 - c) < 2)) {
        box([.065, .065, 2], [x, 9.4, z + 1], '#39545a');
        box([.05, .05, 2], [x, 8.85, z + 1], '#39545a');
      }
    }
  }
  // Actual generated wayfinding lettering, not photographic panels or claimed live services.
  function sign(label: string, detail: string, at: number[], width: number, rotation = 0) {
    box([width + .15, 1.55, .15], at, '#183d47');
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#183d47'; ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = '#edc774'; ctx.fillRect(0, 0, 768, 10);
    ctx.fillStyle = '#fff2da'; ctx.textAlign = 'center'; ctx.font = 'bold 62px sans-serif'; ctx.fillText(label, 384, 108);
    ctx.font = '32px sans-serif'; ctx.fillText(detail, 384, 179);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.add(mat);
    const geo = new THREE.PlaneGeometry(width, 1.4); geometries.add(geo);
    const panel = new THREE.Mesh(geo, mat); panel.position.set(at[0], at[1], at[2] + .081); panel.rotation.y = rotation; root.add(panel);
  }
  sign('CITY EXIT  →', 'Forecourt · via east stairs', [184.5, 10.5, 34.18], 9);
  sign('PARK STATION', 'Johannesburg · arrival study', [183, 3.4, 68], 10);
  for (const x of [178.5, 187.5]) box([.12, 3, .12], [x, 1.74, 68], '#39545a');
  for (const [index, z] of [-18, -6, 6, 18].entries()) {
    sign(`PLATFORM ${index + 1}`, 'Exit via concourse →', [35, 4.05, z], 4);
    box([.06, .55, .06], [33.5, 5, z], '#39545a'); box([.06, .55, .06], [36.5, 5, z], '#39545a');
  }
  // A pair of three-dimensional clocks adds a readable, deterministic moving detail.
  const clockGeometry = new THREE.CylinderGeometry(.62, .62, .13, 24); clockGeometry.rotateX(Math.PI / 2); geometries.add(clockGeometry);
  const clockFace = new THREE.MeshStandardMaterial({ color: '#fff0cf', emissive: '#ffe4aa', emissiveIntensity: .12 });
  const handMat = new THREE.MeshStandardMaterial({ color: '#20363b' }); materials.add(clockFace); materials.add(handMat); lights.push(clockFace);
  const hands: { minute: THREE.Group; hour: THREE.Group }[] = [];
  for (const z of [-6, 6]) {
    const clock = new THREE.Group(); clock.position.set(18, 4.1, z);
    const face = new THREE.Mesh(clockGeometry, clockFace); clock.add(face);
    const minute = new THREE.Group(), hour = new THREE.Group();
    for (const [pivot, length, width] of [[minute, .49, .045], [hour, .32, .07]] as const) {
      const hand = new THREE.Mesh(unit, handMat); hand.scale.set(width, length, .025); hand.position.set(0, length / 2 - .03, .092); pivot.add(hand); clock.add(pivot);
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      box([.035, .09, .025], [18 + Math.sin(angle) * .51, 4.1 + Math.cos(angle) * .51, z + .082], '#20363b',
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle));
    }
    root.add(clock); hands.push({ minute, hour });
    box([.045, .65, .045], [18, 5.03, z], '#39545a');
  }
  for (const [color, transforms] of batches) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: .82 }); materials.add(mat);
    const mesh = new THREE.InstancedMesh(unit, mat, transforms.length); mesh.name = `station-details-${color}`;
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh);
  }
  let disposed = false;
  return {
    root,
    update(time: number) {
      if (disposed || !Number.isFinite(time)) return;
      // Model clock begins at 10:10; elapsed scene seconds remain seconds, no fake live departures.
      const minutes = 10 + Math.max(0, time) / 60;
      for (const { minute, hour } of hands) { minute.rotation.z = -minutes * Math.PI / 30; hour.rotation.z = -(10 + minutes / 60) * Math.PI / 6; }
    },
    setNight(night: boolean) { if (!disposed) lights.forEach(m => { m.emissiveIntensity = night ? .8 : .12; }); },
    dispose() {
      if (disposed) return; disposed = true;
      root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.removeFromParent();
    },
  };
}
