import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createTrainModel, sampleTrainCoordinate } from '../train-model';
import { createConsist } from './TrainConsist';
import { TrainWheels } from './TrainWheels';
import { createStationStudy } from './StationScene';
import { createJohannesburgScene } from './cities/johannesburg/JohannesburgScene';
import { TrainSound } from './TrainSound';
import { createBuildings, type BuildingData } from './Buildings';
import type { RideRoute } from '../ride-model';

/** Continuous geographic preview. Intermediate elevations are deliberately not invented. */
export async function createCorridorScene(host: HTMLElement, signal: AbortSignal, report: (s: number, length: number, playing: boolean, speed: number) => void) {
  const loader = new GLTFLoader();
  const loaded: THREE.Object3D[] = [];
  const releaseLoaded = () => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    loaded.forEach(root => root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } }));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  };
  const load = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Local asset unavailable: ${url}`);
    const asset = await loader.parseAsync(await response.arrayBuffer(), '/assets/models/train/');
    loaded.push(asset.scene); return asset;
  };
  const results = await Promise.allSettled([
    fetch('/data/route-gauteng.geojson', { signal }).then(r => { if (!r.ok) throw new Error('Route unavailable'); return r.json(); }),
    load('/assets/models/train/quaternius-electric.glb'), load('/assets/models/train/quaternius-passenger.glb'),
    fetch('/data/pretoria-buildings.json', { signal }).then(r => r.ok ? r.json() as Promise<BuildingData> : null).catch(() => null),
  ]);
  if (signal.aborted || results.some(result => result.status === 'rejected')) {
    releaseLoaded(); throw new Error(signal.aborted ? 'Corridor loading cancelled' : 'Corridor assets unavailable');
  }
  const [route, engine, coach, buildings] = results.map(result => (result as PromiseFulfilledResult<unknown>).value) as [RideRoute, GLTF, GLTF, BuildingData | null];
  const model = createTrainModel(route.geometry.coordinates), end = model.cumulative.at(-1)!;
  const origin = route.geometry.coordinates[0], cos = Math.cos(origin[1] * Math.PI / 180);
  const point = (s: number) => { const p = sampleTrainCoordinate(model, s); return new THREE.Vector3((p[0]-origin[0])*111320*cos,0,-(p[1]-origin[1])*110540); };
  const heading = (s: number) => { const d = point(s+2).sub(point(s-2)); return Math.atan2(-d.z,d.x); };
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#b9cbd4'); scene.fog = new THREE.Fog('#b9cbd4',900,2900);
  const world = new THREE.Group(); scene.add(world);
  // Reuse the sourced Pretoria footprints. Exclude rail-adjacent sheds where
  // the authored station already supplies the architecture and clearances.
  const context = buildings ? createBuildings({ ...buildings, buildings: buildings.buildings.filter((b: BuildingData['buildings'][number]) => b.away > 60) },
    (lon, lat) => new THREE.Vector3((lon-origin[0])*111320*cos,0,-(lat-origin[1])*110540), () => {}) : null;
  context?.meshes.forEach(mesh => world.add(mesh));
  const camera = new THREE.PerspectiveCamera(48,1,.2,3500);
  const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera,renderer.domElement); controls.enablePan=false; controls.minDistance=8; controls.maxDistance=250; controls.maxPolarAngle=Math.PI/2-.06;
  const sound = new TrainSound();
  scene.add(new THREE.HemisphereLight('#dce9ff','#685d44',1.9));
  const sun = new THREE.DirectionalLight('#fff1da',2.1); sun.position.set(-100,200,-70);scene.add(sun);
  const material = (color: string) => new THREE.MeshStandardMaterial({color,roughness:.9});
  const groundMaterial=material('#8b9065'), ballastMaterial=material('#918675'), railMaterial=material('#606b6d'), sleeperMaterial=material('#5e5548');
  const mastMaterial=material('#59655e'), foliageMaterial=material('#657c4c');
  const trainMaterial=new Map<string,THREE.Material>();
  const consist=createConsist(engine.scene,coach.scene);
  for(const vehicle of consist){
    vehicle.asset.traverse(o=>{if(o instanceof THREE.Mesh){
      const recolor=(m:THREE.Material)=>{const color=/window|darkblue/i.test(m.name)?'#263b42':/grey|white/i.test(m.name)?'#a6a9a4':/black|wheel/i.test(m.name)?'#30383a':vehicle.color;
        if(!trainMaterial.has(color))trainMaterial.set(color,material(color));return trainMaterial.get(color)!;};
      o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);
    }});world.add(vehicle.root);
  }
  const wheels=new TrainWheels(consist.flatMap(v=>v.wheelSlots),material('#30383a'));world.add(wheels.mesh);
  const poses=consist.map(()=>({position:new THREE.Vector3(),angle:0}));
  const endpoint = point(end), endYaw = heading(end), vertical = new THREE.Vector3(0, 1, 0);
  const station=createStationStudy(), joburg=createJohannesburgScene((along, lateral) => {
    const yaw = heading(end + along);
    const position = point(end + along).add(new THREE.Vector3(0, 0, lateral).applyAxisAngle(vertical, yaw)).sub(endpoint).applyAxisAngle(vertical, -endYaw);
    return { position, yaw: yaw - endYaw };
  });
  station.root.position.copy(point(-45)).add(new THREE.Vector3(0,0,26).applyAxisAngle(new THREE.Vector3(0,1,0),heading(0)));station.root.rotation.y=heading(0);world.add(station.root);
  joburg.root.position.copy(point(end));joburg.root.rotation.y=heading(end);world.add(joburg.root);
  const chunks=new Map<number,THREE.Group>(), chunkLength=1000;
  const box=new THREE.BoxGeometry(1,1,1), matrix=new THREE.Matrix4(), rotation=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0);
  const createChunk=(index:number)=>{
    const group=new THREE.Group(), start=index*chunkLength;
    const railMatrices:THREE.Matrix4[]=[], ties:THREE.Matrix4[]=[], bed:THREE.Matrix4[]=[], equipment:THREE.Matrix4[]=[];
    for(let s=start;s<start+chunkLength;s+=10){
      const a=point(s),b=point(s+10),d=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5),yaw=Math.atan2(-d.z,d.x);
      rotation.setFromAxisAngle(up,yaw);
      bed.push(new THREE.Matrix4().compose(mid.clone().setY(-.1),rotation,new THREE.Vector3(d.length()+.1,.2,4.3)));
      for(const side of [-1,1]){
        const pos=mid.clone().add(new THREE.Vector3(0,.2,side*.5335).applyAxisAngle(up,yaw));
        railMatrices.push(new THREE.Matrix4().compose(pos,rotation,new THREE.Vector3(d.length()+.1,.16,.09)));
      }
      for(let offset=0;offset<10;offset+=2){const at=point(s+offset);rotation.setFromAxisAngle(up,heading(s+offset));ties.push(new THREE.Matrix4().compose(at,rotation,new THREE.Vector3(.25,.15,2.7)));}
      if (s % 50 === 0) {
        const mast = a.clone().add(new THREE.Vector3(0,3.6,3.5).applyAxisAngle(up,yaw));
        rotation.setFromAxisAngle(up,yaw);
        equipment.push(new THREE.Matrix4().compose(mast,rotation,new THREE.Vector3(.2,7.2,.2)));
        equipment.push(new THREE.Matrix4().compose(a.clone().add(new THREE.Vector3(0,6.6,1.5).applyAxisAngle(up,yaw)),rotation,new THREE.Vector3(.12,.12,4.2)));
      }
      rotation.setFromAxisAngle(up,yaw);
      equipment.push(new THREE.Matrix4().compose(mid.clone().setY(6.4),rotation,new THREE.Vector3(d.length()+.05,.025,.025)));
    }
    for(const [transforms,mat] of [[bed,ballastMaterial],[railMatrices,railMaterial],[ties,sleeperMaterial],[equipment,mastMaterial]] as const){const mesh=new THREE.InstancedMesh(box,mat,transforms.length);transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));group.add(mesh);}
    const treeGeometry=new THREE.IcosahedronGeometry(1,0), trees=new THREE.InstancedMesh(treeGeometry,foliageMaterial,32);
    trees.userData.ownsGeometry=true;
    for(let i=0;i<32;i++){
      const s=start+i*31.25, yaw=heading(s), side=(i%2?-1:1)*(35+(Math.abs(index*17+i*23)%110));
      const p=point(s).add(new THREE.Vector3(0,2,side).applyAxisAngle(up,yaw));
      // Sparse, explicitly illustrative vegetation; keep station yards clear.
      const size=s<500||s>end-650?0:1.8+(i%4)*.35;
      matrix.compose(p,new THREE.Quaternion(),new THREE.Vector3(size,size*.8,size));trees.setMatrixAt(i,matrix);
    }
    group.add(trees);
    // Flat illustrative land belongs to each bounded chunk; no online tiles.
    const p=point(start+500), ground=new THREE.Mesh(new THREE.PlaneGeometry(3400,3400),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.copy(p).y=-.25-index*.00001;group.add(ground);
    world.add(group);chunks.set(index,group);
  };
  const removeChunk=(index:number)=>{const group=chunks.get(index)!;world.remove(group);group.traverse(o=>{if(o instanceof THREE.InstancedMesh){o.dispose();if(o.userData.ownsGeometry)o.geometry.dispose();}else if(o instanceof THREE.Mesh)o.geometry.dispose();});chunks.delete(index);};
  let distance=0,playing=false,rate=1,speed=0,last=performance.now(),frame=0,disposed=false,lastReport=-1,lastChunk=NaN,dragging=false,following=true,cameraStarted=false,dirty=true,renderedFrames=0;
  const wake = () => { dirty=true; if (!disposed && !frame && !document.hidden) { last=performance.now(); frame=requestAnimationFrame(render); } };
  controls.addEventListener('change',wake);
  controls.addEventListener('start',()=>{dragging=true;following=false;});controls.addEventListener('end',()=>{dragging=false;});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const render=()=>{
    frame=0; if(disposed || document.hidden) return;
    dirty=false;
    const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
    if(playing&&!document.hidden){
      const target=Math.min(22.2,Math.sqrt(Math.max(0,2*.7*(end-distance))));
      speed=THREE.MathUtils.damp(speed,target,1.5,dt);distance=Math.min(end,distance+speed*rate*dt);
      if(end-distance<.1){distance=end;playing=false;speed=0;}
    }
    const index=Math.floor(distance/chunkLength);
    if(index!==lastChunk){
      for(let i=index-1;i<=index+2;i++)if(!chunks.has(i))createChunk(i);
      for(const i of chunks.keys())if(i<index-1||i>index+2)removeChunk(i);
      lastChunk=index; host.dataset.chunks=String(chunks.size);
    }
    const anchor=point(distance);world.position.copy(anchor).negate();
    station.root.visible=distance<2200;joburg.root.visible=end-distance<2400;
    context?.meshes.forEach(mesh => { mesh.visible = distance < 9000; });
    consist.forEach((v,i)=>{const s=distance-v.offset,a=point(s+v.halfBogieSpacing),b=point(s-v.halfBogieSpacing),d=a.clone().sub(b);v.root.position.copy(a.add(b).multiplyScalar(.5)).y=.58;v.root.rotation.y=Math.atan2(-d.z,d.x);poses[i].position.copy(v.root.position);poses[i].angle=v.root.rotation.y;});
    wheels.update(poses,distance);
    if(!dragging && following){
      const yaw=heading(distance),approach=THREE.MathUtils.smoothstep(distance,end-600,end-180);
      const offset=new THREE.Vector3(30,THREE.MathUtils.lerp(7,3.8,approach),THREE.MathUtils.lerp(-12,-4.8,approach)).applyAxisAngle(up,yaw);
      const aim=new THREE.Vector3(-12,2,0).applyAxisAngle(up,yaw);
      // Time-based damping avoids camera heading snaps at OSM segment joints.
      const blend=!cameraStarted||motion.matches?1:1-Math.exp(-4*dt);
      if (camera.position.distanceToSquared(offset) > .0001 || controls.target.distanceToSquared(aim) > .0001) dirty=true;
      camera.position.lerp(offset,blend);controls.target.lerp(aim,blend);cameraStarted=true;
    }
    sound.update({ speed: playing ? speed : 0, dt, distance, nearCrossing: false, paused: !playing || document.hidden,
      cameraMode: following ? 'FOLLOW' : 'FREE', cameraDistanceM: camera.position.length(),
      environment: distance < 500 || end - distance < 650 ? 'STATION' : 'OPEN', atStation: distance === 0 || distance === end });
    controls.update();renderer.render(scene,camera);
    host.dataset.renderedFrames=String(++renderedFrames);
    if(now-lastReport>150){report(distance,end,playing,playing?speed:0);lastReport=now;}
    if(!disposed && (playing || dragging || dirty) && !frame)frame=requestAnimationFrame(render);
  };
  const resize=()=>{if(disposed)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();wake();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const visibility=()=>{last=performance.now();if(document.hidden){cancelAnimationFrame(frame);frame=0;sound.update({speed:0,distance,nearCrossing:false,paused:true});}else wake();};document.addEventListener('visibilitychange',visibility);
  const reduced=()=>{if(motion.matches){playing=false;speed=0;report(distance,end,false,0);wake();}};motion.addEventListener('change',reduced);
  host.dataset.ready = 'true';
  wake();
  return {seek(s:number){distance=THREE.MathUtils.clamp(s,0,end);speed=0;cameraStarted=false;report(distance,end,playing,0);wake();},play(value:boolean){playing=value;speed=0;report(distance,end,playing,0);wake();},rate(value:number){rate=THREE.MathUtils.clamp(value,1,16);},
    follow(){following=true;wake();}, async sound(value:boolean){if(value) await sound.enable();else sound.disable();wake();},dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',reduced);
    for(const i of [...chunks.keys()])removeChunk(i);
    sound.dispose();context?.dispose();context?.meshes.forEach(mesh => mesh.removeFromParent());station.dispose();joburg.dispose();wheels.dispose();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    for(const root of [world,engine.scene,coach.scene])root.traverse((o: THREE.Object3D)=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    geometries.add(box);[groundMaterial,ballastMaterial,railMaterial,sleeperMaterial,mastMaterial,foliageMaterial,...trainMaterial.values()].forEach(m=>materials.add(m));
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();
  }};
}
