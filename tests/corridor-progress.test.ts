import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCorridorProgress, saveCorridorProgress, corridorPhase } from '../app/src/animation/CorridorProgress.ts';

test('saved distance resumes while shared position overrides it', () => {
  const storage={getItem:()=>JSON.stringify({distance:32000,rate:4})};
  assert.deepEqual(readCorridorProgress(storage),{distance:32000,rate:4});
  assert.deepEqual(readCorridorProgress(storage,'?position=1250'),{distance:1250,rate:4});
});
test('malformed and unavailable storage never stop a journey', () => {
  assert.deepEqual(readCorridorProgress({getItem:()=>'{broken'}),{distance:0,rate:1});
  assert.deepEqual(readCorridorProgress({getItem:()=>'{"distance":"400","rate":900}'}),{distance:0,rate:1});
  assert.equal(readCorridorProgress({getItem:()=>null},'?position=Infinity').distance,0);
  assert.equal(readCorridorProgress({getItem:()=>null},'?position=-400').distance,0);
  assert.doesNotThrow(()=>saveCorridorProgress({setItem:()=>{throw new Error('blocked');}},{distance:10,rate:1}));
});
test('arrival is only announced at the destination', () => {
  assert.equal(corridorPhase(0,69537),'Leaving Pretoria');
  assert.equal(corridorPhase(35000,69537),'Travelling to Johannesburg');
  assert.equal(corridorPhase(69000,69537),'Approaching Johannesburg');
  assert.equal(corridorPhase(69537,69537),'Arrived at Park Station');
});
