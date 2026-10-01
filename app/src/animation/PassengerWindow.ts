// Adapted from the user-supplied train-tourism WindowCamera.ts.
// Our vehicles face +X (the reference uses +Z). Return a pose rather than
// writing the camera so RailScene's cinematic director retains ownership.
import { MathUtils, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
export class PassengerWindow {
  side: -1 | 1 = -1;
  yaw = 0;
  pitch = 0;
  look(dx: number, dy: number) {
    this.yaw = MathUtils.clamp(this.yaw - dx * 2.4, -.85, .85);
    this.pitch = MathUtils.clamp(this.pitch - dy * 1.8, -.4, .55);
  }
  setSide(side: -1 | 1) { this.side = side; this.yaw = this.pitch = 0; }
  pose(car: Object3D) {
    // Just outside the 3.04 m exterior shell: supplied coaches have no interior.
    // Position stays attached to the vehicle, never spring-lagging into its wall.
    const position = new Vector3(3.2, 2.8, this.side * 1.64).applyQuaternion(car.quaternion).add(car.position);
    const direction = new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), this.side * Math.cos(this.yaw) * Math.cos(this.pitch)).applyQuaternion(car.quaternion);
    const target = position.clone().addScaledVector(direction, 60);
    const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, target, Object3D.DEFAULT_UP));
    return { position, target, quaternion, fov: 62 };
  }
}
