// Turns a route position into a sequence of places.
//
// The journey loop the plan describes:
//
//   follow the train -> attraction detected -> camera leaves the train
//   -> cinematic plays -> camera returns -> journey continues
//
// Landmarks are data. Adding another one means a JSON file and a scene builder,
// not a change in here: nothing in this file knows what Freedom Park is.
//
// Triggering is by *segment crossing* along the route, not by proximity radius.
// A radius fires repeatedly while the train sits inside it and misses entirely
// if a frame steps over it, which at 22 m/s and a dropped frame is not
// hypothetical.
import * as THREE from 'three';
import { CameraTransition, CinematicCamera, type CameraAnimation, type CinematicPose } from './CinematicCamera.ts';
import type { LandmarkScene } from './landmarks/FreedomPark.ts';

export type LandmarkDefinition = {
  id: string;
  name: string;
  place?: string;
  location: { lat: number; lon: number };
  alongMetres: number;
  /** Route position, in metres, at which the cinematic fires. */
  triggerDistance: number;
  /** Past this route position the landmark rearms, so a rewind can replay it. */
  releaseDistance: number;
  scene: string;
  /** Radii of the levelled pad the terrain makes for this landmark, in metres. */
  footprint?: { inner: number; outer: number };
  provenance: { geometry: string; cameraAnimation: string; note: string };
  tourism: { eyebrow: string; title: string; body: string; credit: string };
  cameraAnimation: CameraAnimation;
};

export type JourneyMode = 'follow' | 'approach' | 'cinematic' | 'return';

export type DirectorState = {
  mode: JourneyMode;
  landmark: LandmarkDefinition | null;
  /** Null while following, meaning the follow camera owns the frame. */
  pose: CinematicPose | null;
  progress: number;
};

type Entry = {
  definition: LandmarkDefinition;
  scene: LandmarkScene;
  cinematic: CinematicCamera;
  /** False once fired, until the train passes releaseDistance or rewinds. */
  armed: boolean;
};

const APPROACH_SECONDS = 2.2;
const RETURN_SECONDS = 2.6;

export class JourneyDirector {
  private entries: Entry[] = [];
  private mode: JourneyMode = 'follow';
  private active: Entry | null = null;
  private transition = new CameraTransition(APPROACH_SECONDS);
  private lastDistance = 0;
  private changed: (state: DirectorState) => void;

  constructor(onChange: (state: DirectorState) => void) {
    this.changed = onChange;
  }

  /** @param toWorld Already positioned in the scene; keyframes are local to it. */
  register(definition: LandmarkDefinition, scene: LandmarkScene, toWorld: THREE.Object3D, fov: number) {
    scene.root.updateMatrixWorld(true);
    this.entries.push({
      definition,
      scene,
      cinematic: new CinematicCamera(definition.cameraAnimation, toWorld, fov),
      armed: true,
    });
    this.entries.sort((a, b) => a.definition.triggerDistance - b.definition.triggerDistance);
  }

  get state(): DirectorState {
    return {
      mode: this.mode,
      landmark: this.active?.definition ?? null,
      pose: null,
      progress: this.active ? this.active.cinematic.progress : 0,
    };
  }

  private paused = false;
  private heldPose: CinematicPose | null = null;

  get busy() { return this.mode !== 'follow'; }

  /** Play a landmark on demand, ignoring the trigger. For the dev panel. */
  playById(id: string, followPose: CinematicPose) {
    const entry = this.entries.find(candidate => candidate.definition.id === id);
    if (entry) this.enter(entry, followPose);
  }

  private enter(entry: Entry, followPose: CinematicPose) {
    this.paused = false; this.heldPose = followPose;
    this.active = entry;
    entry.armed = false;
    this.mode = 'approach';
    this.transition.durationSeconds = APPROACH_SECONDS;
    this.transition.begin(followPose, () => entry.cinematic.sample(0));
    this.announce();
  }

  /** Abandon the current cinematic and go straight back to the train. */
  release(followPose: CinematicPose, followTarget: () => CinematicPose) {
    if (this.mode === 'follow') return;
    this.active?.cinematic.stop();
    this.paused = false; this.heldPose = followPose;
    this.mode = 'return';
    this.transition.durationSeconds = RETURN_SECONDS;
    this.transition.begin(followPose, followTarget);
    this.announce();
  }

  /** A scrub is an immediate camera-owner reset, not a second return animation. */
  cancel() {
    this.active?.cinematic.stop(); this.transition.cancel(); this.active = null;
    this.paused = false; this.heldPose = null;
    this.mode = 'follow'; this.announce();
  }
  pause(value: boolean) { this.paused = value; this.active?.cinematic.pause(value); }

  /**
   * @param distance   Route position in metres.
   * @param followPose What the follow camera wants this frame.
   */
  update(distance: number, dt: number, followPose: CinematicPose, sceneTime: number): DirectorState {
    if (this.paused && this.busy) {
      this.lastDistance = distance;
      return { ...this.state, pose: this.heldPose };
    }
    for (const entry of this.entries) {
      entry.scene.update(sceneTime);
      // Rearm behind the train, and on any rewind past the trigger, so the
      // timeline scrubber can replay a landmark as many times as needed.
      if (!entry.armed && (distance > entry.definition.releaseDistance || distance < entry.definition.triggerDistance)) {
        entry.armed = true;
      }
    }

    if (this.mode === 'follow') {
      const crossed = this.entries.find(entry =>
        entry.armed
        && this.lastDistance < entry.definition.triggerDistance
        && distance >= entry.definition.triggerDistance);
      this.lastDistance = distance;
      if (crossed) this.enter(crossed, followPose);
      else return { mode: 'follow', landmark: null, pose: null, progress: 0 };
    }
    this.lastDistance = distance;

    if (this.mode === 'approach') {
      const pose = this.transition.update(dt);
      this.heldPose = pose;
      if (this.transition.active) return { mode: 'approach', landmark: this.active!.definition, pose, progress: 0 };
      this.mode = 'cinematic';
      this.active!.cinematic.start();
      this.announce();
      return { mode: 'cinematic', landmark: this.active!.definition, pose, progress: 0 };
    }

    if (this.mode === 'cinematic') {
      const pose = this.active!.cinematic.update(dt);
      this.heldPose = pose;
      if (this.active!.cinematic.active) {
        return { mode: 'cinematic', landmark: this.active!.definition, pose, progress: this.active!.cinematic.progress };
      }
      // The take has run out. The caller starts the return by calling release().
      return { mode: 'cinematic', landmark: this.active!.definition, pose, progress: 1, };
    }

    // Returning.
    const pose = this.transition.update(dt);
    this.heldPose = pose;
    if (this.transition.active) return { mode: 'return', landmark: this.active?.definition ?? null, pose, progress: 1 };
    this.mode = 'follow';
    this.active = null;
    this.announce();
    return { mode: 'follow', landmark: null, pose: null, progress: 0 };
  }

  /** True when the current take has played out and wants handing back. */
  get finished() {
    return this.mode === 'cinematic' && this.active !== null && !this.active.cinematic.active;
  }

  seek(distance: number) { this.lastDistance = distance; }

  private announce() { this.changed(this.state); }

  dispose() {
    for (const entry of this.entries) entry.scene.dispose();
    this.entries = [];
    this.transition.cancel();
  }
}
