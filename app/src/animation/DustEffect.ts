// Ballast dust thrown up at the wheel/rail contact.
//
// Adapted from pmndrs/racing-game (MIT, Copyright 2021 pmdrs, contributors),
// src/effects/Dust.tsx. The technique is a single InstancedMesh used as a ring
// buffer: each emission writes one matrix at a rolling index, and on frames
// that do not emit every instance shrinks a little. No shader, no texture, no
// particle library - one draw call for the whole effect.
//
// Preserved from the reference: the 0.02 s emission interval, the shrink rate
// of 0.005 per frame, randFloatSpread positional scatter, the additive-free
// transparent basic material with depthWrite off, and intensity driven by speed.
//
// Changed: the reference emits from two rear wheels of a car and scales
// intensity by sliding/braking. A train on rails never slides, so intensity
// comes from speed alone, and emission follows the locomotive's leading and
// trailing bogies.
//
// Licence: public/licenses/racing-game-MIT.txt
import * as THREE from 'three';

const COUNT = 220;
const EMIT_INTERVAL = 0.02;
const SHRINK_PER_FRAME = 0.005;

export class DustEffect {
  readonly mesh: THREE.InstancedMesh;
  private index = 0;
  private sinceEmit = 0;
  private intensity = 0;
  private dummy = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  private scratch = new THREE.Vector3();
  private quaternion = new THREE.Quaternion();

  private topSpeed: number;

  constructor(topSpeed: number, colour = '#cbbda2') {
    this.topSpeed = topSpeed;
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.16, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geometry, material, COUNT);
    this.mesh.frustumCulled = false;
    // Park every instance at zero scale so nothing shows before the first emit.
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < COUNT; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param emitters World positions of the wheel/rail contacts to puff from.
   * @param speed    Train speed in m/s.
   */
  update(emitters: THREE.Vector3[], speed: number, dt: number) {
    // Ease intensity rather than tracking speed exactly, so starting and
    // stopping raise and settle the dust instead of switching it.
    this.intensity = THREE.MathUtils.lerp(this.intensity, Math.min(1, speed / this.topSpeed), Math.min(1, dt * 8));
    this.sinceEmit += dt;

    if (this.sinceEmit >= EMIT_INTERVAL && this.intensity > 0.02) {
      this.sinceEmit = 0;
      for (const emitter of emitters) {
        this.dummy.position.set(
          emitter.x + THREE.MathUtils.randFloatSpread(1.6),
          emitter.y + 0.15,
          emitter.z + THREE.MathUtils.randFloatSpread(1.6),
        );
        this.dummy.scale.setScalar(Math.random() * this.intensity * 2.6);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(this.index, this.dummy.matrix);
        this.index = (this.index + 1) % COUNT;
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    // Shrink and drift the existing puffs. The reference shrinks by a fixed
    // amount per frame; scaling by dt keeps the lifetime the same at any
    // framerate, which matters because the camera springs are already.
    const shrink = SHRINK_PER_FRAME * (dt * 60);
    for (let i = 0; i < COUNT; i++) {
      this.mesh.getMatrixAt(i, this.matrix);
      this.matrix.decompose(this.dummy.position, this.quaternion, this.scratch);
      if (this.scratch.x <= 0) continue;
      this.dummy.position.y += dt * 1.4;
      this.dummy.scale.setScalar(Math.max(0, this.scratch.x - shrink));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    // Frees the instanceMatrix buffer, which the two above do not.
    this.mesh.dispose();
  }
}
