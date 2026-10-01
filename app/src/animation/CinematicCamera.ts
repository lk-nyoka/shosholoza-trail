// Keyframe playback for landmark cinematics.
//
// The plan's rule is that supplied camera animation is the specification and
// must not be replaced by an interpretation. No supplied path exists for any
// landmark yet, so this player is written to consume the generic format the
// plan describes, ready for a real export to be dropped in.
//
// One documented deviation: the plan's format carries `quaternion` per
// keyframe. Hand-authoring quaternions is unreadable, so a keyframe may give
// `target` instead and the orientation is derived by looking at it. A keyframe
// that carries `quaternion` is used verbatim and never re-derived, so a real
// exported path keeps its exact orientation. See docs/deviations.md.
import * as THREE from 'three';

export type Keyframe = {
  time: number;
  position: [number, number, number];
  /** Either a look-at point, or an explicit orientation. */
  target?: [number, number, number];
  quaternion?: [number, number, number, number];
  fov?: number;
};

export type CameraAnimation = {
  duration: number;
  loop?: boolean;
  keyframes: Keyframe[];
};

export type CinematicPose = { position: THREE.Vector3; target: THREE.Vector3; quaternion: THREE.Quaternion; fov: number };

/** One keyframe resolved into world space, with orientation settled. */
type Resolved = { time: number; position: THREE.Vector3; target: THREE.Vector3; quaternion: THREE.Quaternion; fov: number };

export class CinematicCamera {
  readonly duration: number;
  private frames: Resolved[];
  private loop: boolean;
  private elapsed = 0;
  private running = false;
  private paused = false;

  /**
   * @param animation Keyframes in the landmark's local space.
   * @param toWorld   Transform from that local space into the scene.
   * @param fallbackFov Used for keyframes that do not specify one.
   */
  constructor(animation: CameraAnimation, toWorld: THREE.Object3D, fallbackFov: number) {
    this.duration = animation.duration;
    this.loop = animation.loop ?? false;
    const scratch = new THREE.Matrix4();
    const sorted = [...animation.keyframes].sort((a, b) => a.time - b.time);
    this.frames = sorted.map(frame => {
      const position = toWorld.localToWorld(new THREE.Vector3(...frame.position));
      const target = frame.target
        ? toWorld.localToWorld(new THREE.Vector3(...frame.target))
        : position.clone();
      let quaternion: THREE.Quaternion;
      if (frame.quaternion) {
        // Supplied orientation wins; rotate it into world space but never
        // recompute it from a look-at.
        quaternion = new THREE.Quaternion(...frame.quaternion);
        quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(toWorld.matrixWorld));
      } else {
        scratch.lookAt(position, target, THREE.Object3D.DEFAULT_UP);
        quaternion = new THREE.Quaternion().setFromRotationMatrix(scratch);
      }
      return { time: frame.time, position, target, quaternion, fov: frame.fov ?? fallbackFov };
    });
    if (!this.frames.length) throw new Error('Cinematic needs at least one keyframe');
  }

  start() { this.elapsed = 0; this.running = true; this.paused = false; }
  pause(value: boolean) { this.paused = value; }
  stop() { this.running = false; }
  get active() { return this.running; }
  get progress() { return Math.min(1, this.elapsed / this.duration); }

  /** The pose at the current time, or null once a non-looping take has ended. */
  update(dt: number): CinematicPose | null {
    if (!this.running) return null;
    if (!this.paused) this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      if (this.loop) this.elapsed %= this.duration;
      else { this.elapsed = this.duration; this.running = false; return this.sample(this.duration); }
    }
    return this.sample(this.elapsed);
  }

  sample(time: number): CinematicPose {
    const frames = this.frames;
    if (time <= frames[0].time) return this.pose(frames[0]);
    const last = frames[frames.length - 1];
    if (time >= last.time) return this.pose(last);

    let index = 0;
    while (index + 1 < frames.length && frames[index + 1].time <= time) index++;
    const a = frames[index], b = frames[index + 1];
    const span = b.time - a.time || 1;
    // Smoothstep between keyframes: linear playback reads as a mechanical
    // stop-start at every keyframe, which is exactly the "generic animation"
    // problem this whole effort exists to avoid.
    const raw = (time - a.time) / span;
    const t = raw * raw * (3 - 2 * raw);

    return {
      position: a.position.clone().lerp(b.position, t),
      target: a.target.clone().lerp(b.target, t),
      quaternion: a.quaternion.clone().slerp(b.quaternion, t),
      fov: THREE.MathUtils.lerp(a.fov, b.fov, t),
    };
  }

  private pose(frame: Resolved): CinematicPose {
    return { position: frame.position.clone(), target: frame.target.clone(), quaternion: frame.quaternion.clone(), fov: frame.fov };
  }
}

/**
 * Blends one pose into another. Its only job is to join two already-defined
 * cameras without inventing movement of its own.
 */
export class CameraTransition {
  private elapsed = 0;
  private from: CinematicPose | null = null;
  private to: (() => CinematicPose) | null = null;

  durationSeconds: number;

  constructor(durationSeconds: number) {
    this.durationSeconds = durationSeconds;
  }

  begin(from: CinematicPose, to: () => CinematicPose) {
    this.from = from;
    this.to = to;
    this.elapsed = 0;
  }

  get active() { return this.from !== null; }

  update(dt: number): CinematicPose | null {
    if (!this.from || !this.to) return null;
    this.elapsed += dt;
    const raw = Math.min(1, this.elapsed / this.durationSeconds);
    const t = raw * raw * (3 - 2 * raw);
    const destination = this.to();
    const pose: CinematicPose = {
      position: this.from.position.clone().lerp(destination.position, t),
      target: this.from.target.clone().lerp(destination.target, t),
      quaternion: this.from.quaternion.clone().slerp(destination.quaternion, t),
      fov: THREE.MathUtils.lerp(this.from.fov, destination.fov, t),
    };
    if (raw >= 1) { this.from = null; this.to = null; }
    return pose;
  }

  cancel() { this.from = null; this.to = null; }
}
