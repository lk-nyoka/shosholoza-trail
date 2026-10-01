import * as THREE from 'three';

/** Repeated facade details stay in two draw calls, regardless of building count. */
export function addCityDetails(city: THREE.Group, scene: THREE.Scene) {
  const buildings = city.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  const poses: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#6c7977', roughness: .9 }), buildings.length);
  buildings.forEach((building, index) => {
    const { x: width, y: height, z: depth } = building.scale;
    dummy.position.copy(building.position).setY(height + 1.2);
    dummy.scale.set(width + 2, 2.4, depth + 2); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    roofs.setMatrixAt(index, dummy.matrix);
    for (let y = 8; y < height - 5; y += 8) {
      for (let x = -width / 2 + 9; x < width / 2 - 5; x += 12) {
        for (const side of [-1, 1]) {
          dummy.position.set(building.position.x + x, y, building.position.z + side * (depth / 2 + .12));
          dummy.scale.set(5, 3.2, .22); dummy.updateMatrix(); poses.push(dummy.matrix.clone());
        }
      }
    }
  });
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#45636a', roughness: .45 }), poses.length);
  poses.forEach((pose, index) => windows.setMatrixAt(index, pose));
  roofs.instanceMatrix.needsUpdate = windows.instanceMatrix.needsUpdate = true;
  scene.add(roofs, windows);
}
