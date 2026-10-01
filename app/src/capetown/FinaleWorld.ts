import { addCityDetails } from './CityDetails';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TrainWheels } from '../animation/TrainWheels';
import { createConsist } from '../animation/TrainConsist';
import { createTrainModel, sampleTrainCoordinate } from '../train-model';
import { CAPE_TOWN } from './template/capetown/config';

/** Procedural integration scenery: every hero asset here is labelled an approximation. */
export async function createFinaleWorld(host: HTMLElement, signal: AbortSignal) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#adc9d4'); scene.fog = new THREE.Fog('#adc9d4',4500,15000);
  const origin = [18.42613,-33.92219];
  const geo = (lon:number,lat:number,y=0) => new THREE.Vector3((lon-origin[0])*92300,y,-(lat-origin[1])*110540);
  const station = new THREE.Vector3(), mountain = new THREE.Vector3(-1900,1050,4300), waterfront=geo(18.42392,-33.90602);
  const boKaap=geo(18.413,-33.92), lower=geo(18.4019,-33.952,330);
  const camera = new THREE.PerspectiveCamera(48,1,1,22000); camera.position.set(1900,680,-1700);camera.lookAt(new THREE.Vector3(-600,320,1500));
  const renderer = new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=false;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=30;controls.maxDistance=8000;
  const sun=new THREE.DirectionalLight('#fff0d7',2.4);sun.position.set(-2000,4000,-1000);scene.add(sun,new THREE.HemisphereLight('#d7e6fa','#625746',1.8));
  const materials:THREE.Material[]=[],geometries:THREE.BufferGeometry[]=[];
  const materialCache=new Map<string,THREE.MeshStandardMaterial>();
  const mat=(color:string,other:THREE.MeshStandardMaterialParameters={})=>{const key=color+JSON.stringify(other);const existing=materialCache.get(key);if(existing)return existing;const m=new THREE.MeshStandardMaterial({color,roughness:.86,...other});materials.push(m);materialCache.set(key,m);return m;};
  const unit=new THREE.BoxGeometry(1,1,1);geometries.push(unit);
  const box=(size:number[],at:THREE.Vector3,color:string,parent:THREE.Object3D=scene)=>{const mesh=new THREE.Mesh(unit,mat(color));mesh.position.copy(at);mesh.scale.set(...size as [number,number,number]);parent.add(mesh);return mesh;};
  box([11000,10,12000],new THREE.Vector3(-1000,-10,3000),'#859071');
  const sea=box([19000,6,9000],new THREE.Vector3(0,-5,-6000),'#397d91');
  // A flat-topped, stratified silhouette, deliberately not a DEM or surveyed mesh.
  const mountainGroup=new THREE.Group();scene.add(mountainGroup);
  const outline=[[-1,-.8],[-.65,-1],[.4,-.92],[1,-.55],[.94,.7],[.35,1],[-.8,.85]];
  const vertices:number[]=[],rockColors:number[]=[];
  for(let band=0;band<8;band++){
    const low=band/8,high=(band+1)/8;
    for(let i=0;i<outline.length;i++){
      const point=(j:number,t:number)=>{const [x,z]=outline[j%outline.length];const scale=t<.5?1-t*.86:.57-(t-.5)*.1;return [mountain.x+x*2200*scale,t*1050,mountain.z+z*950*scale];};
      const a=point(i,low),b=point(i+1,low),c=point(i+1,high),d=point(i,high);
      vertices.push(...a,...c,...b,...a,...d,...c);
      const color=new THREE.Color(['#7e826e','#878672','#928d79','#99917e','#a39b89','#a09988','#aaa18f','#a69d8b'][band]);
      for(let v=0;v<6;v++)rockColors.push(color.r,color.g,color.b);
      if(band===7){vertices.push(mountain.x,1050,mountain.z,...c,...d);for(let v=0;v<3;v++)rockColors.push(color.r,color.g,color.b);}
    }
  }
  const rockGeometry=new THREE.BufferGeometry();rockGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));rockGeometry.setAttribute('color',new THREE.Float32BufferAttribute(rockColors,3));rockGeometry.computeVertexNormals();geometries.push(rockGeometry);
  mountainGroup.add(new THREE.Mesh(rockGeometry,mat('#ffffff',{side:THREE.DoubleSide,flatShading:true,vertexColors:true})));
  const summit=box([450,20,280],mountain.clone().add(new THREE.Vector3(0,10,-250)),'#ada793');
  const city=new THREE.Group();scene.add(city);
  for(let i=0;i<160;i++){
    const x=(i%16)*145-1100,z=Math.floor(i/16)*155+200,height=20+(i*37%100);
    box([75+(i%3)*10,height,80],new THREE.Vector3(x,height/2,z),['#c6c2ad','#b6b6a9','#c6ac8b'][i%3],city);
  }
  const bo=new THREE.Group();bo.position.copy(boKaap);scene.add(bo);
  const colors=['#e6ad37','#31a6a3','#d95b8c','#bbc54d','#a089c5'];
  for(let i=0;i<16;i++){
    const x=(i%8)*22-80,z=i<8?-24:24;box([20,14,20],new THREE.Vector3(x,7,z),colors[i%5],bo);
    box([21,1,21],new THREE.Vector3(x,14,z),'#eee0c7',bo);
    box([20,.8,2],new THREE.Vector3(x,1,z+(i<8?11:-11)),'#c8bda9',bo);
    box([4,7,1],new THREE.Vector3(x-4,3.5,z+(i<8?10.5:-10.5)),'#284448',bo);
    for(const dx of [-5,5])box([4,3,1],new THREE.Vector3(x+dx,10,z+(i<8?10.5:-10.5)),'#e9e3cf',bo);
  }
  box([210,.2,26],boKaap.clone().setY(.2),'#6e7470');
  const harbour=new THREE.Group();harbour.position.copy(waterfront);scene.add(harbour);
  box([900,9,300],new THREE.Vector3(0,0,0),'#b6ae98',harbour);
  for(let i=0;i<9;i++)box([70,25+(i%3)*8,70],new THREE.Vector3(i*85-330,18,-40),colors[i%5],harbour);
  const wheelGeometry=new THREE.TorusGeometry(48,2,6,48);geometries.push(wheelGeometry);
  const wheel=new THREE.Mesh(wheelGeometry,mat('#ede4d4'));wheel.position.set(260,63,-170);harbour.add(wheel);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box([5,7,5],new THREE.Vector3(260+48*Math.cos(a),63+48*Math.sin(a),-170),'#d9ae61',harbour);}
  const cloudGeometry=new THREE.SphereGeometry(1,10,6);geometries.push(cloudGeometry);
  const cloudMaterial=mat('#eef2ee',{transparent:true,opacity:.32,depthWrite:false});
  const clouds=new THREE.Group();scene.add(clouds);
  for(let i=0;i<18;i++){const mesh=new THREE.Mesh(cloudGeometry,cloudMaterial);mesh.position.set(mountain.x-1700+i*200,1080+(i%3)*35,mountain.z-150);mesh.scale.set(300,70,200);clouds.add(mesh);}
  const cable=new THREE.Group();box([9,8,7],new THREE.Vector3(0,0,0),'#c4423b',cable);box([9.2,3,7.2],new THREE.Vector3(0,1,0),'#244e5f',cable);scene.add(cable);cable.visible=false;
  const cableEnd=mountain.clone().add(new THREE.Vector3(-250,20,-360));
  const cableLineGeometry=new THREE.BufferGeometry().setFromPoints([lower.clone().add(new THREE.Vector3(0,15,0)),cableEnd.clone().add(new THREE.Vector3(0,15,0))]);geometries.push(cableLineGeometry);
  const lineMaterial=new THREE.LineBasicMaterial({color:'#394340'});materials.push(lineMaterial);scene.add(new THREE.Line(cableLineGeometry,lineMaterial));
  const loaded:THREE.Object3D[]=[];
  let route:any, train:ReturnType<typeof createConsist>=[];
  try{
    const response=await fetch('/data/cape-town-rail.geojson',{signal});if(!response.ok)throw new Error('Cape Town route unavailable');route=await response.json();
    if(route.geometry?.type!=='LineString'||route.geometry.coordinates.length<2)throw new Error('Invalid Cape Town rail');
    const loader=new GLTFLoader();
    for(const file of ['quaternius-electric.glb','quaternius-passenger.glb']){
      const r=await fetch('/assets/models/train/'+file,{signal});if(!r.ok)throw new Error('Train unavailable');
      const asset=await loader.parseAsync(await r.arrayBuffer(),'/assets/models/train/');loaded.push(asset.scene);
    }
    signal.throwIfAborted();train=createConsist(loaded[0],loaded[1]);train.forEach(v=>{scene.add(v.root);v.asset.traverse(o=>{if(o instanceof THREE.Mesh){const original=Array.isArray(o.material)?o.material[0]:o.material;const name=(o.name+' '+original.name).toLowerCase();o.material=mat(/glass|window/.test(name)?'#294650':/roof|under|chassis|bogie/.test(name)?'#454b50':v.color);}});});
  }catch(error){dispose();throw error;}
  const wheels=new TrainWheels(train.flatMap(v=>v.wheelSlots),mat('#30373a'));scene.add(wheels.mesh);
  const model=createTrainModel(route.geometry.coordinates),routeEnd=model.cumulative.at(-1)!;
  const sample=(s:number)=>{const p=sampleTrainCoordinate(model,s);return geo(p[0],p[1],.6);};
  const tangent=sample(routeEnd).sub(sample(routeEnd-10)).normalize(),yaw=Math.atan2(-tangent.z,tangent.x);
  const stationGroup=new THREE.Group();stationGroup.position.copy(sample(routeEnd)).setY(0);station.copy(stationGroup.position);stationGroup.rotation.y=yaw;scene.add(stationGroup);
  box([300,1,8],new THREE.Vector3(-100,.5,6),'#c9bea5',stationGroup);
  box([260,.5,8],new THREE.Vector3(-100,6,6),'#738a88',stationGroup);
  for(let x=-220;x<30;x+=20)box([.4,5.5,.4],new THREE.Vector3(x,3,8),'#485e5c',stationGroup);
  for(let s=0;s<routeEnd;s+=8){const a=sample(s),b=sample(s+8),d=b.clone().sub(a),m=a.clone().add(b).multiplyScalar(.5);const mesh=box([d.length()+.1,.2,3.4],m.setY(.1),'#817c70');mesh.rotation.y=Math.atan2(-d.z,d.x);}
  // Keep procedural city blocks clear of the mapped railway corridor.
  const corridorSamples=Array.from({length:Math.ceil(routeEnd/20)+1},(_,i)=>sample(Math.min(routeEnd,i*20)));
  for(const building of [...city.children])if(corridorSamples.some(point=>Math.hypot(point.x-building.position.x,point.z-building.position.z)<100))city.remove(building);
  addCityDetails(city,scene);
  for(let i=0;i<10;i++)box([2350,.12,18],new THREE.Vector3(-10,.05,140+i*155),'#747976');
  for(let i=0;i<16;i++)box([16,.12,1670],new THREE.Vector3(-1170+i*145,.06,920),'#747976');
  const targets:Record<string,THREE.Vector3>={station,city: new THREE.Vector3(0,150,800),boKaap,lower,mountain:cableEnd,waterfront};
  const paths:Record<string,{position:THREE.Vector3;target:THREE.Vector3;duration:number}>={};
  const add=(id:string,pos:THREE.Vector3,target:THREE.Vector3,duration:number)=>{paths[id]={position:pos,target,duration};};
  add(CAPE_TOWN.camera.mountainApproach,new THREE.Vector3(1000,310,-850),new THREE.Vector3(-800,450,2000),7000);
  add(CAPE_TOWN.camera.stationArrival,station.clone().add(new THREE.Vector3(65,16,-65)),station,5500);
  add(CAPE_TOWN.camera.cityUnfold,new THREE.Vector3(1200,800,-400),new THREE.Vector3(-300,350,2200),6500);
  add(CAPE_TOWN.camera.boKaap,boKaap.clone().add(new THREE.Vector3(90,28,5)),boKaap.clone().add(new THREE.Vector3(0,8,0)),7500);
  add(CAPE_TOWN.camera.cableTransfer,lower.clone().add(new THREE.Vector3(80,45,-120)),lower,5000);
  add(CAPE_TOWN.camera.cableAscent,cableEnd.clone().add(new THREE.Vector3(45,20,-80)),cableEnd,11000);
  add(CAPE_TOWN.camera.summitReveal,cableEnd.clone().add(new THREE.Vector3(200,70,-40)),new THREE.Vector3(0,100,0),5000);
  add(CAPE_TOWN.camera.mountainToSea,waterfront.clone().add(new THREE.Vector3(0,14,-250)),waterfront,10000);
  add(CAPE_TOWN.camera.waterfront,waterfront.clone().add(new THREE.Vector3(350,130,-340)),waterfront,5500);
  add(CAPE_TOWN.camera.sunsetFinale,waterfront.clone().add(new THREE.Vector3(600,160,-550)),mountain.clone().multiplyScalar(.5),6500);
  add(CAPE_TOWN.camera.recap,new THREE.Vector3(2200,1300,-2200),new THREE.Vector3(-500,300,1600),5000);
  function dispose(){controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});loaded.forEach(root=>root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}}));geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();}
  return {scene,camera,renderer,controls,paths,targets,geo,cable,clouds,cloudMaterial,sun,sea,routeEnd,
    train(s:number){train.forEach(v=>{const a=sample(s-v.offset+v.halfBogieSpacing),b=sample(s-v.offset-v.halfBogieSpacing),d=a.clone().sub(b);v.root.position.copy(a.add(b).multiplyScalar(.5));v.root.rotation.y=Math.atan2(-d.z,d.x);});wheels.update(train.map(v=>({position:v.root.position,angle:v.root.rotation.y})),s);},
    cableAt(p:number){cable.position.copy(lower).lerp(cableEnd,p);},
    render(){renderer.render(scene,camera);},dispose};
}
