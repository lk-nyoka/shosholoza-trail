import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createConsist } from '../app/src/animation/TrainConsist.ts';
import { stationMotion } from '../app/src/animation/cities/johannesburg/StationMotion.ts';

test('city trains share rigid proportional assets, correct gaps and wheel locations', () => {
  const engine = new THREE.Mesh(new THREE.BoxGeometry(12,3,2),new THREE.MeshBasicMaterial());
  const coach = new THREE.Mesh(new THREE.BoxGeometry(16,3,2),new THREE.MeshBasicMaterial());
  const consist=createConsist(engine,coach);
  assert.equal(consist.length,18);
  for(const [i,v] of consist.entries()){
    const size=new THREE.Box3().setFromObject(v.root).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.z-3.04)<1e-6);
    assert.ok(Math.abs(size.x/size.y-(i<2?4:16/3))<1e-6,'mesh proportions must survive normalisation');
    assert.equal(v.wheelSlots.length,4);
    assert.ok(v.wheelSlots.every(w=>Math.abs(w.along)<v.length/2));
    if(i)assert.ok(Math.abs(v.offset-consist[i-1].offset-(v.length+consist[i-1].length)/2-1.2)<1e-6);
  }
});

test('arrival motion has no 153 km/h spike and its speed matches travelled distance',()=>{
  for(let t=.1;t<24;t+=.1){
    const m=stationMotion(t);
    assert.ok(m.speed<=19 && m.speed>=0);
    const derivative=(stationMotion(t+.0001).x-stationMotion(t-.0001).x)/.0002;
    assert.ok(Math.abs(derivative-m.speed)<.001);
  }
  assert.ok(Math.abs(stationMotion(23.999).x)<.001);
});
