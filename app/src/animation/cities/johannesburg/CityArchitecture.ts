import * as THREE from 'three';

/** An authored architectural study, not surveyed or named landmark buildings.
 * Local johannesburg.webp informs the mix of slender dark office slabs, masonry
 * podiums, recessed crowns and horizontal window bands. Metres, Y up.
 * Footprints retain the existing 95 x 105 metre street grid; no network assets.
 */
export function createCityArchitecture() {
  const root = new THREE.Group(); root.name = 'johannesburg-city-architecture';
  root.userData.notice = 'Reference-informed approximate urban architecture; not surveyed landmarks';
  const solid = new THREE.BoxGeometry(1, 1, 1), pane = new THREE.PlaneGeometry(1, 1);
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; matrices: THREE.Matrix4[] }>();
  const litMaterials: THREE.MeshStandardMaterial[] = [];
  const bodies = ['#64727a', '#978d78', '#797c77', '#475864'];
  const trim = '#b5ad98', roof = '#626c70', dark = '#283e4c';
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  function add(size: [number, number, number], position: [number, number, number], color: string, yaw = 0, window = false, glow = false) {
    const key = `${color}:${window}:${glow}`;
    let batch = batches.get(key);
    if (!batch) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: window ? .3 : .83,
        metalness: window ? .2 : 0, emissive: glow ? color : '#000000', emissiveIntensity: .08 });
      if (glow) litMaterials.push(material);
      batch = { geometry: window ? pane : solid, material, matrices: [] }; batches.set(key, batch);
    }
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    batch.matrices.push(matrix.compose(new THREE.Vector3(...position), rotation, new THREE.Vector3(...size)).clone());
  }
  // All facade panes face outwards (including the backs), without double-sided
  // materials. Lighting varies by office and floor rather than a uniform glow.
  function facade(x: number, z: number, width: number, depth: number, bottom: number, top: number, seed: number, ribbon = false) {
    for (let y = bottom + 2.1, floor = 0; y < top - 1.1; y += 3.7, floor++) {
      for (let face = 0; face < 4; face++) {
        const length = face % 2 ? depth : width, pitch = ribbon ? 3.7 : 4.8;
        const count = Math.max(1, Math.floor((length - 3) / pitch));
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * pitch;
          const lit = (seed * 31 + floor * 13 + i * 7 + face * 19) % 17 < 4;
          const color = lit ? ((floor + i) % 3 ? '#edcf99' : '#c4d4df') : dark;
          const px = face % 2 ? x + (face === 1 ? 1 : -1) * (width / 2 + .025) : x + offset;
          const pz = face % 2 ? z + offset : z + (face === 0 ? 1 : -1) * (depth / 2 + .025);
          add([ribbon ? 3.25 : 2, ribbon ? 1.3 : 1.8, 1], [px, y, pz], color, face * Math.PI / 2, true, lit);
        }
      }
    }
  }
  function volume(x: number, z: number, w: number, d: number, base: number, height: number, color: string, seed: number, ribbon = false) {
    add([w, height, d], [x, base + height / 2, z], color);
    facade(x, z, w, d, base, base + height, seed, ribbon);
    // A recessed roof surface enclosed by four thin parapets, not a floating cap.
    add([w - .8, .25, d - .8], [x, base + height + .1, z], roof);
    for (const side of [-1, 1]) {
      add([w, .8, .32], [x, base + height + .4, z + side * (d / 2 - .16)], color);
      add([.32, .8, d], [x + side * (w / 2 - .16), base + height + .4, z], color);
    }
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
    const n = row * 10 + col, x = -450 + col * 95, z = 135 + row * 105;
    const w = 37 + n % 4 * 7, d = 36 + n % 3 * 8, kind = (col + row * 3) % 5;
    const podium = kind === 3 ? 15 : 7.4;
    volume(x, z, w, d, 0, podium, bodies[(n + 1) % 4], n);
    // Street-level shop bays and recessed entries on both street-facing ends.
    for (const sign of [-1, 1]) {
      for (let bay = -w / 2 + 5; bay < w / 2 - 3; bay += 6) {
        add([4, 2.8, 1], [x + bay, 1.65, z + sign * (d / 2 + .04)], dark, sign < 0 ? Math.PI : 0, true);
        add([4.8, .18, 1.3], [x + bay, 3.25, z + sign * (d / 2 + .5)], n % 2 ? '#967149' : '#506e68');
      }
      add([2, 2.6, 1], [x, 1.4, z + sign * (d / 2 + .055)], '#c4d4df', sign < 0 ? Math.PI : 0, true, true);
    }
    const h = kind === 3 ? 14 + n % 3 * 7 : 35 + (n * 37 + 11) % 70;
    const tw = w - (kind === 0 ? 12 : 6), td = d - (kind === 1 ? 16 : 6);
    const color = bodies[n % 4];
    volume(x, z, tw, td, podium, h, color, n + 70, kind === 1 || kind === 4);
    if (kind === 0) {
      // Stepped roof profile, sampled from the reference's varied skyline rhythm.
      for (let step = 0; step < 3; step++) {
        const sw = tw - 5 * (step + 1), sd = td - 4 * (step + 1);
        volume(x, z, sw, sd, podium + h + step * 3.7, 3.7, color, n + step);
      }
    } else if (kind === 2) {
      // Tall vertical piers make a narrow office slab visibly distinct from bands.
      for (let offset = -tw / 2 + 1; offset <= tw / 2 - 1; offset += 5.5) for (const side of [-1, 1]) {
        add([.45, h, .45], [x + offset, podium + h / 2, z + side * (td / 2 + .16)], trim);
      }
      add([tw * .45, 5, td * .5], [x, podium + h + 2.5, z], roof);
    } else if (kind === 4) {
      for (let y = podium + 3.7; y < podium + h; y += 3.7) {
        add([tw + .5, .22, td + .5], [x, y, z], trim);
      }
    }
    // Small HVAC boxes stay on the roof and share one material and draw call.
    const roofY = podium + h + (kind === 0 ? 11.1 : kind === 2 ? 5 : 0);
    for (let plant = 0; plant < 2; plant++) add([3, 1.1, 2], [x + plant * 4 - 2, roofY + 1.35, z], roof);
  }
  for (const [key, batch] of batches) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    mesh.name = `urban-${key}`;
    batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = batch.geometry === solid; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); root.add(mesh);
  }
  let disposed = false;
  return {
    root,
    setNight(night: boolean) { litMaterials.forEach(m => { m.emissiveIntensity = night ? 1.8 : .08; }); },
    dispose() {
      if (disposed) return; disposed = true;
      root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      solid.dispose(); pane.dispose(); batches.forEach(b => b.material.dispose()); root.removeFromParent();
    },
  };
}
