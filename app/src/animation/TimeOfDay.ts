// Four times of day for the corridor.
//
// One fixed midday sun gave every shot the same flat look, and shadows that
// never moved. These are four authored presets - dawn, day, dusk and night -
// each specifying sun direction and colour, sky ramp, fog, ambient balance and
// whether windows are lit.
//
// Deliberately presets rather than a continuous clock. A slider through a full
// day sounds better than it looks: most of the range is uninteresting, and the
// two worth having - low warm light, and night - are exactly the two a
// continuous sweep rushes through.
import * as THREE from 'three';

export type TimeKey = 'dawn' | 'day' | 'dusk' | 'night';

export type TimePreset = {
  key: TimeKey;
  label: string;
  /** Direction from the scene toward the sun; normalised on use. */
  sunDirection: [number, number, number];
  sunColour: string;
  sunIntensity: number;
  skyColour: string;
  groundColour: string;
  hemisphereIntensity: number;
  zenith: string;
  horizon: string;
  haze: string;
  fogNear: number;
  fogFar: number;
  /** 0 at noon, 1 at night: drives lit windows and signal lamp glow. */
  darkness: number;
};

export const TIME_PRESETS: Record<TimeKey, TimePreset> = {
  dawn: {
    key: 'dawn', label: 'Dawn',
    sunDirection: [-0.85, 0.16, 0.5], sunColour: '#ffd0a0', sunIntensity: 2.1,
    skyColour: '#ffe3c4', groundColour: '#4a5340', hemisphereIntensity: 1.5,
    zenith: '#6f92b8', horizon: '#f0cfa8', haze: '#ffd9a8',
    fogNear: 500, fogFar: 2600, darkness: 0.35,
  },
  day: {
    key: 'day', label: 'Midday',
    sunDirection: [-0.5, 0.8, 0.33], sunColour: '#fff1db', sunIntensity: 2.1,
    skyColour: '#c6d9ee', groundColour: '#555c48', hemisphereIntensity: 1.65,
    zenith: '#8fb3c9', horizon: '#dfe3d4', haze: '#f0e2c6',
    fogNear: 900, fogFar: 3400, darkness: 0,
  },
  dusk: {
    key: 'dusk', label: 'Dusk',
    sunDirection: [0.9, 0.12, -0.35], sunColour: '#ff9e63', sunIntensity: 1.9,
    skyColour: '#ffc99a', groundColour: '#3f4738', hemisphereIntensity: 1.3,
    zenith: '#4d5f88', horizon: '#e0a072', haze: '#ffb578',
    fogNear: 420, fogFar: 2200, darkness: 0.55,
  },
  night: {
    key: 'night', label: 'Night',
    sunDirection: [0.3, 0.62, -0.5], sunColour: '#9fb6d8', sunIntensity: 0.5,
    // Enough moonlight to read the consist by. A literally dark night is
    // accurate and useless.
    skyColour: '#2b3d5c', groundColour: '#1b2420', hemisphereIntensity: 0.95,
    zenith: '#0b1426', horizon: '#1d2c42', haze: '#2b3a52',
    fogNear: 260, fogFar: 1500, darkness: 1,
  },
};

export const TIME_ORDER: TimeKey[] = ['dawn', 'day', 'dusk', 'night'];

/** Distance from the sun to its target. Far enough to read as directional. */
const SUN_DISTANCE = 300;

export type TimeTargets = {
  sun: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  fog: THREE.Fog;
  renderer: THREE.WebGLRenderer;
  sky: { setColours(zenith: string, horizon: string, haze: string): void };
  /** Materials that light up after dark - windows, lamps, signal heads. */
  emissive: { material: THREE.MeshStandardMaterial; colour: string; peak: number }[];
};

export class TimeOfDay {
  private current: TimePreset = TIME_PRESETS.day;
  private targets: TimeTargets;

  constructor(targets: TimeTargets) {
    this.targets = targets;
  }

  get preset() { return this.current; }
  get sunOffset() {
    const [x, y, z] = this.current.sunDirection;
    return new THREE.Vector3(x, y, z).normalize().multiplyScalar(SUN_DISTANCE);
  }

  apply(key: TimeKey) {
    const preset = TIME_PRESETS[key];
    this.current = preset;
    const { sun, hemisphere, fog, renderer, sky, emissive } = this.targets;

    sun.color.set(preset.sunColour);
    sun.intensity = preset.sunIntensity;
    hemisphere.color.set(preset.skyColour);
    hemisphere.groundColor.set(preset.groundColour);
    hemisphere.intensity = preset.hemisphereIntensity;

    fog.color.set(preset.horizon);
    fog.near = preset.fogNear;
    fog.far = preset.fogFar;
    renderer.setClearColor(preset.horizon);
    sky.setColours(preset.zenith, preset.horizon, preset.haze);

    // Windows and lamps come up as the light goes down. Nothing is modelled as
    // an actual light source: emissive is far cheaper and reads the same at
    // this distance.
    for (const entry of emissive) {
      entry.material.emissive.set(entry.colour);
      entry.material.emissiveIntensity = entry.peak * preset.darkness;
    }
  }
}
