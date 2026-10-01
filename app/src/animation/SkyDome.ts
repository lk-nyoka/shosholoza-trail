// Highveld sky for the 3D animation.
//
// The scene previously used a flat clear colour, so every frame ended in a
// uniform band across the top and the fog had nothing to blend into. This is a
// gradient dome plus a slow cloud drift - the only thing in the scene that
// moves when the train is parked and the wind is still.
//
// No reference project covered this; it is authored. Kept in its own module and
// driven entirely by the constants below so it is easy to retune after review.
import * as THREE from 'three';

/** Late afternoon over Pretoria: warm near the horizon, deeper overhead. */
export const SKY = {
  zenith: new THREE.Color('#8fb3c9'),
  horizon: new THREE.Color('#dfe3d4'),
  haze: new THREE.Color('#f0e2c6'),
  /** Where the haze band sits, 0 at the horizon, 1 overhead. */
  hazeHeight: 0.09,
  radius: 5200,
};

const CLOUDS = 26;
const CLOUD_HEIGHT = 620;
const CLOUD_SPREAD = 4200;
/** Metres per second. Slow enough to read as weather, not as a conveyor. */
const CLOUD_DRIFT = 2.4;

export class SkyDome {
  readonly group = new THREE.Group();
  /**
   * Metres added to the cloud deck. Zero suits the Highveld; where terrain
   * rises far above rail level (the Nuweveld stands ~1 km over Beaufort West)
   * a deck at 620 m sits below the ridgeline and reads as pale slabs on the
   * ground.
   */
  cloudLift = 0;
  private uniforms!: { zenith: { value: THREE.Color }; horizon: { value: THREE.Color }; haze: { value: THREE.Color } };
  private cloudMaterial!: THREE.MeshBasicMaterial;
  private clouds: THREE.InstancedMesh;
  private rest: { x: number; y: number; z: number; scale: number; phase: number }[] = [];
  private dummy = new THREE.Object3D();
  private drift = 0;

  constructor() {
    const geometry = new THREE.SphereGeometry(SKY.radius, 24, 16);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: SKY.zenith },
        horizon: { value: SKY.horizon },
        haze: { value: SKY.haze },
        hazeHeight: { value: SKY.hazeHeight },
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          // Normalised height up the dome, 0 at the horizon.
          vHeight = clamp(normalize(world.xyz).y, 0.0, 1.0);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze;
        uniform float hazeHeight;
        varying float vHeight;
        void main() {
          // Two ramps: a tight warm band just above the horizon, then a long
          // fade to the zenith. One ramp alone reads as a cheap gradient.
          vec3 low = mix(haze, horizon, smoothstep(0.0, hazeHeight, vHeight));
          vec3 sky = mix(low, zenith, smoothstep(hazeHeight, 0.62, vHeight));
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    this.uniforms = material.uniforms as typeof this.uniforms;
    const dome = new THREE.Mesh(geometry, material);
    dome.frustumCulled = false;
    this.group.add(dome);

    // Clouds are flat, unlit and horizontal - seen from below at this scale a
    // billboard would give itself away as the camera orbits.
    const cloudGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      color: '#fdfbf4', transparent: true, opacity: 0.42, depthWrite: false,
    });
    this.clouds = new THREE.InstancedMesh(cloudGeometry, this.cloudMaterial, CLOUDS);
    this.clouds.frustumCulled = false;
    for (let i = 0; i < CLOUDS; i++) {
      // Deterministic scatter so a screenshot is reproducible.
      const a = (i * 2.399963) % (Math.PI * 2), r = ((i * 137) % 100) / 100;
      this.rest.push({
        x: Math.cos(a) * r * CLOUD_SPREAD,
        y: CLOUD_HEIGHT + (i % 5) * 45,
        z: Math.sin(a) * r * CLOUD_SPREAD,
        scale: 260 + (i % 7) * 95,
        phase: a,
      });
    }
    this.group.add(this.clouds);
    this.write(0);
  }

  private write(drift: number) {
    for (let i = 0; i < CLOUDS; i++) {
      const rest = this.rest[i];
      // Wrap rather than recycle: the span is wide enough that a cloud
      // reappearing on the far side is never in frame at the moment it moves.
      const x = ((rest.x + drift + CLOUD_SPREAD) % (CLOUD_SPREAD * 2)) - CLOUD_SPREAD;
      this.dummy.position.set(x, rest.y + this.cloudLift, rest.z);
      this.dummy.scale.set(rest.scale, 1, rest.scale * 0.55);
      this.dummy.rotation.set(0, rest.phase, 0);
      this.dummy.updateMatrix();
      this.clouds.setMatrixAt(i, this.dummy.matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /** Retint the dome for a different time of day. */
  setColours(zenith: string, horizon: string, haze: string) {
    this.uniforms.zenith.value.set(zenith);
    this.uniforms.horizon.value.set(horizon);
    this.uniforms.haze.value.set(haze);
    // Cloud underside picks up the horizon, so they do not stay white at night.
    this.cloudMaterial.color.set(horizon).lerp(new THREE.Color('#ffffff'), 0.45);
  }

  /**
   * @param centre Where the viewer is, so the dome and clouds stay around them.
   */
  update(centre: THREE.Vector3, dt: number) {
    this.group.position.set(centre.x, 0, centre.z);
    this.drift += dt * CLOUD_DRIFT;
    this.write(this.drift);
  }

  dispose() {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
  }
}
