import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createJohannesburgScene } from '../app/src/animation/cities/johannesburg/JohannesburgScene.ts';

test('connected station splits platforms and follows the supplied curved rail frame', () => {
  const city = createJohannesburgScene((x, lateral) => ({ position: new THREE.Vector3(x, 0, lateral + x*x*.001), yaw: -Math.atan(.002*x) }));
  let count=0, maxLength=0;
  city.root.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const material=object.material as THREE.MeshStandardMaterial;
    if(material.color.getHexString()!=='b6aa95')return;
    for(let i=0;i<object.count;i++){
      const matrix=new THREE.Matrix4();object.getMatrixAt(i,matrix);
      const position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();matrix.decompose(position,rotation,scale);
      const lateral=position.z-position.x*position.x*.001;
      assert.ok([-18,-6,6,18].some(z=>Math.abs(z-lateral)<.001));
      maxLength=Math.max(maxLength,scale.x);count++;
    }
  });
  assert.equal(count,160);
  assert.ok(maxLength<8.1,'no straight 320 m platform should cross the curved railway');
  city.dispose();
});
