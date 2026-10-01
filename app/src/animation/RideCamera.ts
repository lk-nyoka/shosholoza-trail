// Chase camera for the 3D animation.
//
// The rig is adapted from pmndrs/racing-game (MIT, Copyright 2021 pmdrs,
// contributors), src/models/vehicle/Vehicle.tsx:81-113. Two ideas are taken
// from it directly:
//
//   1. The offset is expressed in the vehicle's own frame - forward, side, up -
//      rather than in world space, and the *offset* is what gets smoothed. The
//      camera then leans into curves and pulls back with speed for free.
//   2. A sway pass adds two sine waves whose amplitude scales with speed, so a
//      fast pass feels different from a slow one even on identical geometry.
//
// Damping comes from Sketchbook's spring simulator rather than racing-game's
// raw `lerp(a, b, delta)`, which is framerate-dependent. See ./spring.ts.
//
// Licences: public/licenses/racing-game-MIT.txt, public/licenses/sketchbook-MIT.txt
import * as THREE from 'three';
import { VectorSpringSimulator } from './spring';

export type CameraView = 'side' | 'follow' | 'wide';

/**
 * Per-view rig parameters, in metres, in the track frame.
 * `behind` is along the direction of travel, `side` is left/right of the rail,
 * `height` is above rail level.
 */
type Rig = {
  behind: number;
  side: number;
  height: number;
  /** Extra metres of pull-back per m/s of speed. racing-game uses speed/15 on a car. */
  speedPull: number;
  /** Metres of lateral swing per unit of curvature at full speed. */
  curveSwing: number;
  /** How far ahead of the camera target the look point sits. */
  lookAhead: number;
  /** Spring mass and damping. Higher mass = lazier, lower damping = looser. */
  mass: number;
  damping: number;
  /** Peak sway amplitude in radians at top speed. */
  sway: number;
};

// Offsets are measured from the locomotive, and `lookAhead` is relative to it
// too: 0 frames the locomotive, negative looks back down the consist, positive
// looks up the line ahead of the train.
export const RIGS: Record<CameraView, Rig> = {
  // Alongside: a trackside pass. Looks back slightly so the coaches and their
  // liveries run through frame rather than sitting behind the camera.
  side: { behind: 32, side: -6, height: 4.4, speedPull: 0.3, curveSwing: 3, lookAhead: -12, mass: 7, damping: 0.72, sway: 0.0016 },
  // Behind: the driving view. Tightest spring, most speed reaction, and the
  // only rig that looks up the line instead of at the train.
  follow: { behind: -78, side: 14, height: 21, speedPull: 1.7, curveSwing: 42, lookAhead: 46, mass: 5, damping: 0.68, sway: 0.0026 },
  // Wide: an establishing shot. Heavy and slow so the landscape reads.
  wide: { behind: -150, side: 150, height: 120, speedPull: 0.4, curveSwing: 12, lookAhead: -45, mass: 14, damping: 0.8, sway: 0.0006 },
};

/** Speed the sway and pull-back are normalised against, in m/s (~79 km/h). */
const TOP_SPEED = 22;

type Frame = { forward: THREE.Vector3; side: THREE.Vector3; origin: THREE.Vector3 };

export class RideCamera {
  private offsetSpring = new VectorSpringSimulator(RIGS.follow.mass, RIGS.follow.damping);
  private targetSpring = new VectorSpringSimulator(RIGS.follow.mass * 0.6, RIGS.follow.damping);
  private view: CameraView = 'side';
  private swayPhase = 0;
  private started = false;

  private camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  setView(view: CameraView) {
    this.view = view;
    const rig = RIGS[view];
    // Keep whatever momentum the springs carry; only the feel changes.
    this.offsetSpring.retune(rig.mass, rig.damping);
    this.targetSpring.retune(rig.mass * 0.6, rig.damping);
  }

  /** Where the rig wants to be, in world space, before damping. */
  private desired(frame: Frame, speed: number, curvature: number) {
    const rig = RIGS[this.view];
    const speedFraction = Math.min(1, speed / TOP_SPEED);
    // Pull back as speed rises, and swing wide on the outside of the curve -
    // both straight from racing-game's local offset vector.
    const behind = rig.behind - speed * rig.speedPull;
    const lateral = rig.side + curvature * rig.curveSwing * speedFraction;
    return new THREE.Vector3()
      .addScaledVector(frame.forward, behind)
      .addScaledVector(frame.side, lateral)
      .setY(rig.height);
  }

  /**
   * Advance one frame.
   *
   * @param frame  Track frame at the camera's anchor point.
   * @param speed  Train speed in m/s.
   * @param curvature Signed turn rate; positive bends one way, negative the other.
   * @param dt     Elapsed seconds.
   */
  update(frame: Frame, speed: number, curvature: number, dt: number, reducedMotion = false) {
    const rig = RIGS[this.view];
    const desiredOffset = this.desired(frame, speed, curvature);
    const desiredTarget = frame.origin.clone().addScaledVector(frame.forward, rig.lookAhead).setY(frame.origin.y + 3);

    if (!this.started || reducedMotion) {
      this.offsetSpring.reset(desiredOffset);
      this.targetSpring.reset(desiredTarget);
      this.started = true;
    } else {
      this.offsetSpring.target.copy(desiredOffset);
      this.targetSpring.target.copy(desiredTarget);
      this.offsetSpring.simulate(dt);
      this.targetSpring.simulate(dt);
    }

    const target = this.targetSpring.position;
    this.camera.position.copy(frame.origin).add(this.offsetSpring.position);
    this.camera.lookAt(target);
    // Sway is NOT applied here. OrbitControls.update() ends with its own
    // lookAt, which would throw the rotation away before anything rendered.
    // The caller applies it afterwards via applySway().
    return target;
  }

  /**
   * The speed-scaled sway, from racing-game's Vehicle.tsx. Must be called after
   * OrbitControls.update(), which discards any rotation set before it.
   */
  applySway(dt: number, speed: number, reducedMotion = false) {
    if (reducedMotion) return;
    const rig = RIGS[this.view];
    this.swayPhase += dt * (9 + 5 * (speed / TOP_SPEED));
    const amplitude = rig.sway * Math.min(1, speed / TOP_SPEED);
    if (amplitude <= 0) return;
    this.camera.rotateZ(Math.sin(this.swayPhase * 0.9) * amplitude);
    this.camera.rotateX(Math.sin(this.swayPhase * 1.37) * amplitude * 0.6);
  }

  /** The accumulated sway phase, for tests. */
  get phase() { return this.swayPhase; }

  /**
   * The pose the rig wants, without touching any spring state. Used by the
   * station cinematic to know where to fly back to.
   */
  preview(frame: Frame, speed: number, curvature: number) {
    const rig = RIGS[this.view];
    return {
      position: frame.origin.clone().add(this.desired(frame, speed, curvature)),
      target: frame.origin.clone().addScaledVector(frame.forward, rig.lookAhead).setY(frame.origin.y + 3),
    };
  }

  /**
   * Settle the springs on the current rig pose without touching the camera.
   * Used while a cinematic owns the frame, so handing control back lands on a
   * settled pose instead of unwinding whatever lag had built up.
   */
  reseat(frame: Frame, speed: number, curvature: number) {
    const rig = RIGS[this.view];
    this.offsetSpring.reset(this.desired(frame, speed, curvature));
    this.targetSpring.reset(frame.origin.clone().addScaledVector(frame.forward, rig.lookAhead).setY(frame.origin.y + 3));
    this.started = true;
  }

  /** Cut with no interpolation - for seeking and view switches. */
  snap(frame: Frame, speed: number, curvature: number) {
    this.offsetSpring.reset(this.desired(frame, speed, curvature));
    const rig = RIGS[this.view];
    this.targetSpring.reset(frame.origin.clone().addScaledVector(frame.forward, rig.lookAhead).setY(frame.origin.y + 3));
    this.started = true;
    this.camera.position.copy(frame.origin).add(this.offsetSpring.position);
    this.camera.lookAt(this.targetSpring.position);
    return this.targetSpring.position.clone();
  }
}
