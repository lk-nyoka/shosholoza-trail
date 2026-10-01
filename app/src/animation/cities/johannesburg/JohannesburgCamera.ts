import * as THREE from 'three';
import { arrivalPosition } from './JohannesburgScene.ts';

type Pose = { position: [number, number, number]; target: [number, number, number] };
const lerp = (a: Pose, b: Pose, u: number): Pose => ({
  position: a.position.map((n, i) => THREE.MathUtils.lerp(n, b.position[i], u)) as Pose['position'],
  target: a.target.map((n, i) => THREE.MathUtils.lerp(n, b.target[i], u)) as Pose['target'],
});
/** Move into the open rail gap before rising, so the camera never flies through a canopy. */
export function johannesburgCamera(time: number): Pose {
  if (time <= 12) { const x = arrivalPosition(time); return { position: [x + 65, 4.2, -4.8], target: [x - 15, 2.3, 0] }; }
  const x = arrivalPosition(12), platform: Pose = { position: [x + 65, 4.2, -4.8], target: [x - 15, 2.3, 0] };
  const gap: Pose = { position: [x + 65, 4.2, 0], target: [x - 15, 2.3, 0] };
  const above: Pose = { position: [x + 65, 14, 0], target: [x - 15, 2.3, 0] };
  const skyline: Pose = { position: [-245, 92, -185], target: [0, 32, 130] };
  if (time <= 15) return lerp(platform, gap, THREE.MathUtils.smoothstep(time, 12, 15));
  if (time <= 18) return lerp(gap, above, THREE.MathUtils.smoothstep(time, 15, 18));
  return lerp(above, skyline, THREE.MathUtils.smoothstep(time, 18, 28));
}
