// Framerate-independent spring damping.
//
// Ported from Sketchbook (MIT, Copyright (c) 2020 swift502):
//   src/ts/core/FunctionLibrary.ts          -> spring()
//   src/ts/physics/spring_simulation/SimulatorBase.ts      -> generateFrames()
//   src/ts/physics/spring_simulation/SpringSimulator.ts
//   src/ts/physics/spring_simulation/VectorSpringSimulator.ts
// See public/licenses/sketchbook-MIT.txt and docs/camera-reference.md.
//
// The spring itself is ordinary. What matters is the accumulator around it: a
// bare `position += (target - position) * k` behaves differently at 30, 60 and
// 144 Hz, so a camera tuned on one machine feels wrong on another. This runs the
// spring at a fixed internal rate however many times the elapsed time calls for,
// keeps the last two frames, and interpolates between them by the remainder.
import * as THREE from 'three';

const FPS = 60;

type Frame = { position: number; velocity: number };

/** One integration step. Sketchbook's spring(), unchanged. */
function step(source: number, destination: number, velocity: number, mass: number, damping: number): Frame {
  let acceleration = destination - source;
  acceleration /= mass;
  velocity += acceleration;
  velocity *= damping;
  return { position: source + velocity, velocity };
}

abstract class SimulatorBase {
  protected frameTime = 1 / FPS;
  protected offset = 0;

  mass: number;
  damping: number;

  // Written out rather than using constructor parameter properties: the test
  // runner strips types only, and cannot desugar those.
  constructor(mass: number, damping: number) {
    this.mass = mass;
    this.damping = damping;
  }

  protected advance(timeStep: number, next: (last: Frame) => Frame, cache: Frame[]) {
    const total = this.offset + timeStep;
    const frames = Math.floor(total / this.frameTime);
    this.offset = total % this.frameTime;
    for (let i = 0; i < frames; i++) cache.push(next(cache[cache.length - 1]));
    if (cache.length > 2) cache.splice(0, cache.length - 2);
    return this.offset / this.frameTime;
  }
}

/** Scalar spring. Read `position` after each simulate(). */
export class SpringSimulator extends SimulatorBase {
  position: number;
  velocity = 0;
  target = 0;
  private cache: Frame[];

  constructor(mass: number, damping: number, start = 0) {
    super(mass, damping);
    this.position = start;
    this.target = start;
    this.cache = [{ position: start, velocity: 0 }, { position: start, velocity: 0 }];
  }

  simulate(timeStep: number) {
    const blend = this.advance(timeStep, last => step(last.position, this.target, last.velocity, this.mass, this.damping), this.cache);
    this.position = THREE.MathUtils.lerp(this.cache[0].position, this.cache[1].position, blend);
    this.velocity = THREE.MathUtils.lerp(this.cache[0].velocity, this.cache[1].velocity, blend);
  }

  /** Jump straight to a value, discarding momentum. For camera cuts. */
  reset(value: number) {
    this.position = value;
    this.target = value;
    this.velocity = 0;
    this.offset = 0;
    this.cache = [{ position: value, velocity: 0 }, { position: value, velocity: 0 }];
  }
}

/** Three independent springs, one per axis. Sketchbook's VectorSpringSimulator. */
export class VectorSpringSimulator {
  readonly position = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  private axes: [SpringSimulator, SpringSimulator, SpringSimulator];

  constructor(mass: number, damping: number) {
    this.axes = [new SpringSimulator(mass, damping), new SpringSimulator(mass, damping), new SpringSimulator(mass, damping)];
  }

  simulate(timeStep: number) {
    const components: ['x', 'y', 'z'] = ['x', 'y', 'z'];
    components.forEach((axis, i) => {
      this.axes[i].target = this.target[axis];
      this.axes[i].simulate(timeStep);
      this.position[axis] = this.axes[i].position;
    });
    return this.position;
  }

  reset(value: THREE.Vector3) {
    this.position.copy(value);
    this.target.copy(value);
    this.axes[0].reset(value.x);
    this.axes[1].reset(value.y);
    this.axes[2].reset(value.z);
  }

  /** Change the feel without losing momentum - for switching camera rigs. */
  retune(mass: number, damping: number) {
    for (const axis of this.axes) { axis.mass = mass; axis.damping = damping; }
  }
}
