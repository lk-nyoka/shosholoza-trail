import test from 'node:test';import assert from 'node:assert/strict';import {PerspectiveCamera,Vector3} from 'three';import {projectWindowPlace} from '../app/src/animation/WindowPlaces.ts';
const camera=new PerspectiveCamera(62,1280/900,.1,3000);camera.updateMatrixWorld();
test('mapped labels reject behind-camera, distant and screen-edge points',()=>{for(const point of [new Vector3(0,0,10),new Vector3(0,0,-1500),new Vector3(500,0,-10)])assert.equal(projectWindowPlace(point,camera,1280,900),null);});
test('visible label remains anchored to the projection',()=>{const point=projectWindowPlace(new Vector3(0,0,-100),camera,1280,900);assert.ok(point);assert.equal(point.x,640);assert.equal(point.y,450);assert.equal(point.distance,100);});

import {BoxGeometry,Mesh,MeshBasicMaterial,Raycaster} from 'three';
import {windowPlaceOccluded} from '../app/src/animation/WindowPlaces.ts';
test('intervening building hides a mapped label but a building beyond it does not',()=>{const mesh=new Mesh(new BoxGeometry(10,10,10),new MeshBasicMaterial());const ray=new Raycaster(),eye=new Vector3(),anchor=new Vector3(0,0,-100);mesh.position.z=-50;mesh.updateMatrixWorld();assert.equal(windowPlaceOccluded(ray,eye,anchor,[mesh]),true);mesh.position.z=-150;mesh.updateMatrixWorld();assert.equal(windowPlaceOccluded(ray,eye,anchor,[mesh]),false);mesh.geometry.dispose();mesh.material.dispose();});
