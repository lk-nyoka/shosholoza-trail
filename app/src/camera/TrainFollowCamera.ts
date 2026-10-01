// Adapted from EarthDrive, src/main.js (MIT, Vaibhav Rau, 2026).
// See public/licenses/earth-drive-MIT.txt and docs/camera-reference.md.
export type FollowPose = { center: [number, number]; bearing: number; pitch: number; zoom: number };
export const FOLLOW_DEFAULTS = { returnDelayMs: 1500, dampingAt60Hz: .08, elevationRadians: .32, zoom: 17.7 };
export const shortestAngle = (angle: number) => Math.atan2(Math.sin(angle * Math.PI / 180), Math.cos(angle * Math.PI / 180)) * 180 / Math.PI;

export class TrainFollowCamera {
  pose: FollowPose | null = null;
  private lastTime = 0;
  private lastInteraction = -Infinity;
  private orbitBearing = 0;
  private orbitPitch = 0;
  private dragging = false;

  reset(pose: FollowPose, now: number) {
    this.pose = { ...pose, center: [...pose.center] };
    this.lastTime = now;
    this.lastInteraction = -Infinity;
    this.orbitBearing = 0; this.orbitPitch = 0; this.dragging = false;
  }

  drag(active: boolean, now: number) { this.dragging = active; this.lastInteraction = now; }

  orbit(deltaBearing: number, deltaPitch: number, now: number) {
    this.orbitBearing = shortestAngle(this.orbitBearing + deltaBearing);
    this.orbitPitch = Math.max(-40, Math.min(12, this.orbitPitch + deltaPitch));
    this.lastInteraction = now;
  }

  update(target: FollowPose, now: number, reducedMotion = false): FollowPose {
    if (!this.pose) this.reset(target, now);
    // Equivalent to the source's .08 per-frame decay at 60 Hz, adapted to
    // elapsed time so 30/60/120 Hz screens converge in the same wall time.
    const dt = Math.min(.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const weight = reducedMotion ? 1 : 1 - Math.pow(1 - FOLLOW_DEFAULTS.dampingAt60Hz, dt * 60);
    if (!this.dragging && now - this.lastInteraction > FOLLOW_DEFAULTS.returnDelayMs) {
      this.orbitBearing *= 1 - weight; this.orbitPitch *= 1 - weight;
    }
    const pose = this.pose!;
    pose.center = [pose.center[0] + (target.center[0] - pose.center[0]) * weight, pose.center[1] + (target.center[1] - pose.center[1]) * weight];
    pose.bearing += shortestAngle(target.bearing + this.orbitBearing - pose.bearing) * weight;
    pose.pitch += (Math.max(30, Math.min(84, target.pitch + this.orbitPitch)) - pose.pitch) * weight;
    pose.zoom += (target.zoom - pose.zoom) * weight;
    return { ...pose, center: [...pose.center] };
  }
}
