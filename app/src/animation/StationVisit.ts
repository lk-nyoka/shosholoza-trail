import * as THREE from 'three';
import { gsap } from 'gsap';

// Newly authored local-space keyframes for the approximate station study.
// Replace these with supplied trajectories when a matching real asset exists.
export const STATION_VISIT = [
  { position: [-55, 9, -48], target: [-12, 4, -12], duration: 2, label: 'Approaching the platform' },
  { position: [-22, 5, -27], target: [0, 6, -8], duration: 4, label: 'Under the platform canopy' },
  { position: [22, 14, -36], target: [0, 15, -4], duration: 4, label: 'The station clock' },
  { position: [48, 23, -65], target: [0, 5, -10], duration: 3, label: 'Departure view' },
] as const;

export function playStationVisit(camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3; enabled: boolean; update(): void }, station: THREE.Object3D, returnPose: () => { position: THREE.Vector3; target: THREE.Vector3 }, changed: (label: string) => void, complete: () => void, reducedMotion: boolean) {
  station.updateMatrixWorld(true);
  const pose = { x: camera.position.x, y: camera.position.y, z: camera.position.z, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
  controls.enabled = false;
  const renderPose = () => { camera.position.set(pose.x, pose.y, pose.z); controls.target.set(pose.tx, pose.ty, pose.tz); camera.lookAt(controls.target); };
  const timeline = gsap.timeline({ onUpdate: renderPose, onComplete: () => { controls.enabled = true; complete(); } });
  for (const shot of STATION_VISIT) {
    const position = station.localToWorld(new THREE.Vector3(...shot.position));
    const target = station.localToWorld(new THREE.Vector3(...shot.target));
    timeline.to(pose, { x: position.x, y: position.y, z: position.z, tx: target.x, ty: target.y, tz: target.z, duration: shot.duration, ease: 'sine.inOut', onStart: () => changed(shot.label) });
  }
  const back = { progress: 0 }; let from: typeof pose;
  timeline.to(back, { progress: 1, duration: 2, ease: 'sine.inOut', onStart: () => { from = { ...pose }; changed('Returning to the train'); }, onUpdate: () => {
    const destination = returnPose();
    pose.x = THREE.MathUtils.lerp(from.x, destination.position.x, back.progress); pose.y = THREE.MathUtils.lerp(from.y, destination.position.y, back.progress); pose.z = THREE.MathUtils.lerp(from.z, destination.position.z, back.progress);
    pose.tx = THREE.MathUtils.lerp(from.tx, destination.target.x, back.progress); pose.ty = THREE.MathUtils.lerp(from.ty, destination.target.y, back.progress); pose.tz = THREE.MathUtils.lerp(from.tz, destination.target.z, back.progress);
  } });
  if (reducedMotion) { timeline.pause(); const shot = STATION_VISIT[1]; camera.position.copy(station.localToWorld(new THREE.Vector3(...shot.position))); controls.target.copy(station.localToWorld(new THREE.Vector3(...shot.target))); camera.lookAt(controls.target); changed('Station study · still view'); }
  return { pause(value: boolean) { timeline.paused(value); }, stop() { timeline.kill(); controls.enabled = true; } };
}
