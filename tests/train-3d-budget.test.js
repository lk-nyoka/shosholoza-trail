import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('shipped GLB bodies plus wheelsets, windows and locomotive details keep all 18 vehicles under 60k triangles',async()=>{
 let total=0;
 for(const kind of ['electric','passenger']){
  const bytes=await readFile(`public/assets/models/train/quaternius-${kind}.glb`);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  let triangles=0;
  for(const mesh of gltf.meshes){
   if(/wheel/i.test(mesh.name))continue;
   for(const primitive of mesh.primitives){
    if(/wood/i.test(gltf.materials[primitive.material].name))continue;
    triangles+=gltf.accessors[primitive.indices].count/3;
   }
  }
  // Eight 8-segment cylinders, two bogie boxes, 24 window boxes, five loco details.
  triangles+=8*32+2*12+24*12+(kind==='electric'?5*12:0);
  total+=triangles*(kind==='electric'?2:16);
 }
 assert.equal(total,56232);
 assert.ok(total<=60000);
});
