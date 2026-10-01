import * as THREE from 'three';

/** Local engineering approximation, not a surveyed cutting profile. */
export class RailFormation {
  readonly inner = 12;
  readonly outer = 55;
  private buckets = new Map<string, [THREE.Vector3, THREE.Vector3][]>();
  constructor(project: (s: number) => THREE.Vector3, from: number, to: number) {
    for (let s = from; s < to; s += 8) {
      const a = project(s), b = project(Math.min(to, s + 8));
      // Index expanded segments, so height queries only visit nearby rail.
      for (let x = Math.floor((Math.min(a.x, b.x) - this.outer) / 100); x <= Math.floor((Math.max(a.x, b.x) + this.outer) / 100); x++) {
        for (let z = Math.floor((Math.min(a.z, b.z) - this.outer) / 100); z <= Math.floor((Math.max(a.z, b.z) + this.outer) / 100); z++) {
          const key = `${x}:${z}`, entries = this.buckets.get(key) ?? [];
          entries.push([a, b]); this.buckets.set(key, entries);
        }
      }
    }
  }
  sample(x: number, z: number) {
    let distance = Infinity, height = 0;
    for (const [a, b] of this.buckets.get(`${Math.floor(x / 100)}:${Math.floor(z / 100)}`) ?? []) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
      if (d < distance) { distance = d; height = THREE.MathUtils.lerp(a.y, b.y, t); }
    }
    return { distance, height };
  }
  heightAt(x: number, z: number, original: number) {
    const rail = this.sample(x, z);
    if (rail.distance >= this.outer) return original;
    // Only excavate. Existing bridge spans must not become filled embankments.
    const floor = Math.min(original, rail.height - .2);
    return THREE.MathUtils.lerp(floor, original, THREE.MathUtils.smoothstep(rail.distance, this.inner, this.outer));
  }
}
