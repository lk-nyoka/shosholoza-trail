import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainModel,updateTrainModel,departureProfile,departureProgress,smoothRailProfile,semanticTrainScale,WHEEL_RADIUS} from '../app/src/train-model.ts';
const rail:[number,number][]=[[25,-30],[25.005,-30],[25.008,-29.998],[25.009,-29.994]];
test('journey extrusion retains separate underframe, inset roof and continuous waistline with varied night glazing',()=>{
 const m=updateTrainModel(createTrainModel(rail),650,40,{night:true,scale:1.35});
 const parts=m.features.features.filter(f=>f.properties.vehicle===2);
 const part=(name:string)=>parts.find(f=>f.properties.part===name)!;
 assert.equal(part('underframe').properties.color,'#3A3F45');
 assert.equal(part('roof').properties.color,'#A9AFB5');
 assert.ok(part('underframe').properties.height<=part('body').properties.base);
 assert.ok(part('body').properties.height<=part('roof').properties.base);
 assert.equal(parts.filter(f=>f.properties.part.startsWith('window:band:')).length,2);
 for(const side of [-1,1]){
  const band=part(`window:band:${side}`);
  assert.equal(band.properties.color,'#1D2A33');
  assert.ok(band.properties.base>part('body').properties.base);
  assert.ok(band.properties.height<part('roof').properties.base);
 }
 const glazing=parts.filter(f=>f.properties.lit!==undefined);
 assert.ok(glazing.some(f=>f.properties.lit)&&glazing.some(f=>!f.properties.lit));
});
test('couplers keep trailing vehicles still until their 70ms departure delay then restore exact gaps',()=>{
 const m=createTrainModel(rail);updateTrainModel(m,100,.75);
 const initial=m.vehicles.map(v=>v.chainage);
 updateTrainModel(m,100.01,.79);
 assert.ok(m.vehicles[0].chainage>initial[0]);
 assert.equal(m.vehicles[1].chainage,initial[1]);
 assert.equal(m.vehicles[2].chainage,initial[2]);
 updateTrainModel(m,100.03,.86);
 assert.ok(m.vehicles[1].chainage>initial[1]);
 assert.equal(m.vehicles[2].chainage,initial[2]);
 updateTrainModel(m,102,3.5);
 for(const v of m.vehicles)assert.ok(Math.abs(v.chainage-(102-v.offset))<1e-8);
 const day=m.features.features.find(f=>f.id==='train:2:body')!.properties.color;
 assert.equal(day,'#2FA8C6');updateTrainModel(m,102,3.6,{night:true});
 assert.notEqual(m.features.features.find(f=>f.id==='train:2:body')!.properties.color,day);
});
test('18 rigid vehicles use two bogies and alternating whole-coach liveries with inset roofs',()=>{
 const m=updateTrainModel(createTrainModel(rail),650,40);
 assert.equal(m.vehicles.length,18);assert.equal(m.vehicles.filter(v=>v.kind==='locomotive').length,2);
 assert.deepEqual(m.features.features.filter(f=>f.properties.part==='body').slice(2,8).map(f=>f.properties.livery),['turquoise','yellow','violet','turquoise','yellow','violet']);
 assert.ok(new Set(m.vehicles.map(v=>v.heading.toFixed(3))).size>1);
 assert.ok(m.features.features.every(f=>f.geometry.coordinates[0].length===5));
 assert.equal(m.features.features.filter(f=>f.properties.part==='pantograph').length,2);
 const body=m.features.features.find(f=>f.id==='train:2:body')!,roof=m.features.features.find(f=>f.id==='train:2:roof')!;
 assert.notDeepEqual(body.geometry.coordinates,roof.geometry.coordinates);
});
test('wheel rotation follows distance and reverse scrubbing; suspension stops under reduced motion',()=>{
 const m=createTrainModel(rail);updateTrainModel(m,100,40);updateTrainModel(m,50,41,{reducedMotion:true});
 assert.ok(Math.abs(m.vehicles[0].wheelAngle-50/WHEEL_RADIUS)<1e-8);
 assert.ok(m.vehicles.every(v=>v.heave===0&&v.roll===0));
 const angle=m.vehicles[0].wheelAngle;updateTrainModel(m,50,42);assert.equal(m.vehicles[0].wheelAngle,angle);
});
test('departure remains staged at 16x and window illumination is deterministic and varied',()=>{
 assert.equal(departureProfile(0,16,false).state,'idle');assert.equal(departureProfile(.2,16).state,'departure-prep');
 assert.equal(departureProfile(.6,16).state,'creep');assert.equal(departureProfile(2,16).state,'accelerating');assert.equal(departureProfile(3,16).state,'cruising');
 assert.equal(departureProfile(3,16).presentationTimeScale,2);
 assert.equal(departureProgress(0,16,3.5),0);assert.equal(departureProgress(3.5,16,3.5),1);assert.ok(departureProgress(.4,16,3.5)<departureProgress(1.5,16,3.5));
 const a=createTrainModel(rail),b=createTrainModel(rail);assert.deepEqual(a.vehicles.map(v=>v.windows),b.vehicles.map(v=>v.windows));
 updateTrainModel(a,500,40,{night:true});const windows=a.features.features.filter(f=>f.properties.part.startsWith('window'));
 assert.ok(windows.some(f=>f.properties.lit)&&windows.some(f=>!f.properties.lit));
 assert.deepEqual(smoothRailProfile([10,10,10,999,10,10,10]),[10,10,10,10,10,10,10]);
 assert.equal(semanticTrainScale(1),1.8);assert.equal(semanticTrainScale(20),1);
});
