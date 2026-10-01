import * as THREE from 'three';
import { TRAIN_LIVERY } from '../train-model.ts';

export const CONSIST_COUNT = 18;
export const TRAIN_WIDTH = 3.04;
export const COUPLER_GAP = 1.2;

/** One asset/spacing contract for both cities. Source mesh proportions stay intact. */
export function createConsist(engine: THREE.Object3D, coach: THREE.Object3D) {
  let offset = 0, previousLength = 0;
  return Array.from({ length: CONSIST_COUNT }, (_, index) => {
    const locomotive = index < 2;
    const asset = (locomotive ? engine : coach).clone(true);
    const bounds = new THREE.Box3().setFromObject(asset), size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3()), scale = TRAIN_WIDTH / size.z;
    const length = size.x * scale;
    if (index) offset += previousLength / 2 + length / 2 + COUPLER_GAP;
    previousLength = length;
    asset.position.sub(new THREE.Vector3(centre.x, bounds.min.y, centre.z));
    const shell = new THREE.Group(); shell.add(asset); shell.scale.setScalar(scale);
    const root = new THREE.Group(); root.add(shell);
    asset.traverse(object => { if (/wheel/i.test(object.name)) object.visible = false; });
    const halfBogieSpacing = length * .32;
    const wheelSlots = [-1, 1].flatMap(bogie => [-1, 1].map(axle => ({ vehicle: index, along: bogie * halfBogieSpacing + axle * 1.05 })));
    return { root, asset, length, offset, halfBogieSpacing, wheelSlots,
      color: locomotive ? TRAIN_LIVERY.locomotive : [TRAIN_LIVERY.turquoise, TRAIN_LIVERY.yellow, TRAIN_LIVERY.violet][(index - 2) % 3] };
  });
}
