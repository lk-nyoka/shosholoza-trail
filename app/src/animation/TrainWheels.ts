// Turning wheels for the consist.
//
// A train sliding along with static wheels is the oldest tell in the book, but
// the obvious fix does not work here. Each vehicle's GLB is fitted to real
// dimensions by a shell with scale (1.27, 3.2, 1.5) - wildly non-uniform,
// because the low-poly source is not proportioned like a Cape-gauge coach.
// Rotating a wheel inside that shell shears it into a wobbling ellipse.
//
// So the wheels are rehomed: the GLB's wheel nodes are hidden, their positions
// recorded, and a single InstancedMesh draws every wheel on the whole train in
// world space at uniform scale. 18 vehicles' worth of wheels cost one draw call
// and one matrix write each per frame.
//
// Rotation is tied to distance travelled, not to time: theta = -s / r. Wheels
// that spin at a rate unrelated to ground speed look worse than wheels that do
// not spin at all, and this also means scrubbing the timeline backwards rolls
// them backwards.
import * as THREE from 'three';

/** Cape gauge is 1 067 mm; wheels on this stock run about 900 mm diameter. */
export const WHEEL_RADIUS = 0.45;
const WHEEL_WIDTH = 0.14;
/** Half the gauge, near enough, so the wheels sit on the railheads. */
const HALF_GAUGE = 0.5335;

export type WheelSlot = {
  /** Which vehicle it belongs to. */
  vehicle: number;
  /** Metres forward of that vehicle's centre. */
  along: number;
};

export type VehiclePose = { position: THREE.Vector3; angle: number; pitch?: number };

export class TrainWheels {
  readonly mesh: THREE.InstancedMesh;
  private slots: WheelSlot[];
  private dummy = new THREE.Object3D();
  private spin = new THREE.Quaternion();
  private rollAxis = new THREE.Vector3(0, 0, 1);
  private axis = new THREE.Vector3(0, 1, 0);
  private lateral = new THREE.Vector3();
  private pitchTurn = new THREE.Quaternion();

  constructor(slots: WheelSlot[], material: THREE.Material) {
    this.slots = slots;
    // A cylinder's axis is +Y, so it is laid on its side once per frame by the
    // same quaternion that orients the vehicle.
    const geometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14);
    geometry.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, material, slots.length * 2);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /**
   * @param poses    One per vehicle, in the same order as the slots reference.
   * @param distance Metres travelled, which sets the roll angle.
   */
  update(poses: VehiclePose[], distance: number) {
    const roll = -distance / WHEEL_RADIUS;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const pose = poses[slot.vehicle];
      if (!pose) continue;

      const pitch = pose.pitch ?? 0;
      const forwardX = Math.cos(pose.angle) * Math.cos(pitch), forwardZ = -Math.sin(pose.angle) * Math.cos(pitch);
      this.lateral.set(Math.sin(pose.angle), 0, Math.cos(pose.angle));

      for (let side = -1; side <= 1; side += 2) {
        this.dummy.position.set(
          pose.position.x + forwardX * slot.along + this.lateral.x * side * HALF_GAUGE,
          // The vehicle origin is 0.3 m above the railhead, so the axle sits a
          // wheel radius above the rail rather than a radius above sea level.
          pose.position.y - 0.3 + WHEEL_RADIUS + Math.sin(pitch) * slot.along,
          pose.position.z + forwardZ * slot.along + this.lateral.z * side * HALF_GAUGE,
        );
        // Yaw with the vehicle, then roll about the lateral axis. Order matters:
        // rolling first and yawing second would tilt the wheel out of the rail.
        this.dummy.quaternion.setFromAxisAngle(this.axis, pose.angle);
        this.dummy.quaternion.multiply(this.pitchTurn.setFromAxisAngle(this.rollAxis, pitch));
        this.spin.setFromAxisAngle(this.rollAxis, roll);
        this.dummy.quaternion.multiply(this.spin);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), this.dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/**
 * Pull the wheel nodes out of a loaded vehicle: hide them, and report where
 * they sat along the body so real wheels can be drawn there instead.
 *
 * @param lengthScale The shell's along-vehicle scale, since node offsets are in
 *                    the GLB's own units.
 * @param centreX     The body centre the asset was shifted onto.
 */
export function harvestWheelSlots(asset: THREE.Object3D, vehicle: number, lengthScale: number, centreX: number): WheelSlot[] {
  const slots: WheelSlot[] = [];
  const doomed: THREE.Object3D[] = [];
  asset.traverse(object => {
    if (!/wheel/i.test(object.name)) return;
    doomed.push(object);
    // The asset is shifted so the body centre sits at the origin, so the node's
    // own offset has to be measured from that same centre.
    slots.push({ vehicle, along: (object.position.x - centreX) * lengthScale });
  });
  // Hidden rather than removed: the GLB is shared source data and the node tree
  // is easier to reason about intact if this ever needs revisiting.
  for (const object of doomed) object.visible = false;
  return slots;
}
