import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Terrain } from '../app/src/animation/Terrain.ts';
import { RailFormation } from '../app/src/animation/RailFormation.ts';

test('cutting exposes the railway and leaves distant ground and low bridge terrain intact', () => {
  const formation = new RailFormation(s => new THREE.Vector3(s, 5, 0), -100, 100);
  assert.equal(formation.heightAt(0, 0, 20), 4.8);
  assert.equal(formation.heightAt(0, 100, 20), 20);
  assert.equal(formation.heightAt(0, 0, -10), -10);
  const shoulder = formation.heightAt(0, 30, 20);
  assert.ok(shoulder > 4.8 && shoulder < 20);
});

test('rendered terrain leaves clearance over a diagonal graded railway between coarse DEM samples', () => {
  const terrain = new Terrain({grid: 5, bounds:{west:0,east:240,south:-240,north:0},
    minMetres:0,maxMetres:20,routeSampleStride:1,alongRoute:[0,0],heights:Array(25).fill(20)},
    (x,z) => new THREE.Vector3(x,0,-z), 280);
  const project = (s: number) => new THREE.Vector3(20+s*.7, s*.01, 20+s*.7);
  terrain.carveRail(project,0,280);
  const mesh = terrain.build(new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for(let s=10;s<270;s+=7){
    const p=project(s);
    for(const offset of [-1.6,0,1.6]){
      ray.set(new THREE.Vector3(p.x+offset,100,p.z-offset),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(mesh)[0];
      assert.ok(hit,`terrain missing at ${s}`);
      assert.ok(hit.point.y < p.y-.1,`terrain covers rail at ${s}: ${hit.point.y} >= ${p.y}`);
    }
  }
  mesh.geometry.dispose();
});
