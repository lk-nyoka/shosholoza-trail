import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TIME_PRESETS, type TimeKey } from '../animation/TimeOfDay';

import { TRAIN_LIVERY as L } from '../train-model';



/** Deliberately compressed stage geometry; never used by the geographic map. */

export function createTrailWorld(host: HTMLElement) {

 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);

 const scene=new T.Scene(),camera=new T.PerspectiveCamera(48,1,.1,1800);

 scene.background=new T.Color('#b8d6dd');scene.fog=new T.Fog('#b8d6dd',280,1100);

 const ambient=new T.HemisphereLight('#e7f4ff','#805c38',2.4);scene.add(ambient);

 const sun=new T.DirectionalLight('#fff0cb',3);sun.position.set(50,100,50);scene.add(sun);

 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=8;controls.maxDistance=550;
 let selectedView='wide',side=-1,cameraDirty=true;
 const stage=new T.Group();scene.add(stage);

 const materials=new Map<string,T.MeshStandardMaterial>();

 const mat=(color:string)=>{if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.85}));return materials.get(color)!;};

 const box=(g:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);g.add(m);return m;};

 const cone=(g:T.Object3D,x:number,y:number,z:number,r:number,h:number,c:string,n=6)=>{const m=new T.Mesh(new T.ConeGeometry(r,h,n),mat(c));m.position.set(x,y,z);g.add(m);return m;};

 const orb=(g:T.Object3D,x:number,y:number,z:number,r:number,c:string)=>{const m=new T.Mesh(new T.IcosahedronGeometry(r,1),mat(c));m.position.set(x,y,z);g.add(m);return m;};

 const ground=box(scene,0,-2,0,1800,3,800,'#b79870');

 for(const z of [-2,2])box(scene,0,.1,z,1800,.25,.22,'#727e83');

 for(let x=-880;x<880;x+=4)box(scene,x,-.1,0,.7,.3,6,'#65503e');

 const train=new T.Group();scene.add(train);const wheels:T.Mesh[]=[];

 for(let i=0;i<6;i++){

  const x=-i*24,c=i===0?L.locomotive:[L.turquoise,L.yellow,L.violet][(i-1)%3];

  box(train,x,2,0,22,1,3.6,L.underframe);box(train,x,4.1,0,21,3.5,3.2,c);box(train,x,6,0,20,.55,3,L.roof);

  for(const side of [-1,1])for(let n=0;n<8;n++)box(train,x-8+n*2.2,4.6,side*1.63,1.3,1.2,.06,i%2?'#203642':'#d6bd7c');

  for(const ax of [-7,-5,5,7])for(const side of [-1,1]){const wheel=new T.Mesh(new T.CylinderGeometry(.85,.85,.35,10),mat('#253039'));wheel.rotation.x=Math.PI/2;wheel.position.set(x+ax,1,side*1.75);train.add(wheel);wheels.push(wheel);}

  if(i)box(train,x+12,2,0,2,.4,.5,'#32393e');

 }

 box(train,10.6,4.7,0,.12,1.25,2.6,L.window);box(train,10.7,3,0,.15,.5,2.8,L.yellow);box(train,10.8,3.8,0,.2,.3,1,'#ffffde');

 const animated:{object:T.Object3D;kind:string;x:number;y:number;z:number}[]=[];

 const animate=(object:T.Object3D,kind:string)=>animated.push({object,kind,x:object.position.x,y:object.position.y,z:object.position.z});

 const building=(x:number,z:number,w:number,h:number,d:number,c:string)=>{box(stage,x,h/2,z,w,h,d,c);for(let a=-w/2+2;a<w/2;a+=4)for(let y=3;y<h;y+=4)box(stage,x+a,y,z+d/2+.06,1.3,1.6,.1,'#34454c');};

 const mountain=(x:number,z:number,r:number,h:number,c:string)=>cone(stage,x,h/2,z,r,h,c);

 const tree=(x:number,z:number,purple=false)=>{box(stage,x,3,z,1,6,1,'#695541');orb(stage,x,8,z,5,purple?'#9d78bd':'#667e4e');};

 function clear(){stage.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});stage.clear();animated.length=0;}

 function setChapter(index:number){

  clear();ground.visible=index!==2;const night=index===3;

  if(index===2){const shape=new T.Shape();shape.moveTo(-1100,-500);shape.lineTo(1100,-500);shape.lineTo(1100,500);shape.lineTo(-1100,500);shape.closePath();const hole=new T.Path();hole.absarc(45,76,35,0,Math.PI*2,true);shape.holes.push(hole);const floor=new T.Mesh(new T.ShapeGeometry(shape),mat('#b79870'));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;stage.add(floor);}

  const sky=night?'#111d38':index===7?'#b8dfe5':'#d9d4be';scene.background=new T.Color(sky);scene.fog=new T.Fog(sky,280,1100);ambient.intensity=night?.75:2.4;sun.intensity=night?.6:3;

  ground.material=mat(index===6?'#8f9c62':index===7?'#aea785':'#b79870');

  // The stage is translated past one shared train, so chapter changes never reload a map.

  if(index===0){

   for(let i=0;i<24;i++)tree(-160+i*14,-25-i%2*10,true);

   building(80,-90,100,16,20,'#c5a17c');for(const x of [38,122]){building(x,-90,14,30,22,'#c4a178');cone(stage,x,33,-90,10,8,'#846e58');}

   for(let i=0;i<5;i++)box(stage,80,.6+i,-65-i*4,130-i*5,1,5,'#b3a186');

  }else if(index===1){

   for(let i=0;i<18;i++)building(-140+i*19,-65-(i%3)*18,13,18+(i*17%57),15,['#988e7d','#737e86','#b69b7d'][i%3]);

   box(stage,50,47,-100,4,94,4,'#b4bdbe');orb(stage,50,76,-100,7,'#717c82');box(stage,50,100,-100,.6,35,.6,'#5a636b');

   mountain(150,-180,85,38,'#c6a46b');

  }else if(index===2){

   const ring=new T.Mesh(new T.RingGeometry(35,63,48),mat('#ac8561'));ring.rotation.x=-Math.PI/2;ring.position.set(45,.1,-76);stage.add(ring);

   const pit=new T.Mesh(new T.CylinderGeometry(35,16,20,48,1,true),new T.MeshStandardMaterial({color:'#514b3c',side:T.DoubleSide}));pit.position.set(45,-9,-76);stage.add(pit);

   const water=new T.Mesh(new T.CircleGeometry(19,40),mat('#327f83'));water.rotation.x=-Math.PI/2;water.position.set(45,-18,-76);stage.add(water);

   // Raise surrounding rim so the depression reads from the oblique camera.

   for(let i=0;i<16;i++){const a=i*Math.PI/8;orb(stage,45+Math.cos(a)*47,3,-76+Math.sin(a)*47,12,'#9d7857');}

   const derrick=new T.Group();stage.add(derrick);for(const x of [-7,7])box(derrick,x,12,0,1,24,1,'#52483c');box(derrick,0,24,0,17,1,2,'#52483c');derrick.position.set(5,0,-35);const bucket=box(derrick,0,10,0,3,3,3,'#555453');animate(bucket,'bucket');

  }else if(index===3){

   for(let lane=1;lane<6;lane++){for(const z of [-1,1])box(stage,0,.15,-lane*9+z*2,550,.2,.2,'#a4a9a5');for(let i=0;i<4;i++)box(stage,-90+i*25,3,-lane*9,21,5,3,['#6d5d59','#a18d67','#546b70'][lane%3]);}

   for(let i=0;i<8;i++){box(stage,-130+i*40,6,-8,1,12,1,'#718189');const signal=orb(stage,-130+i*40,12,-8,.8,i%2?'#efbc52':'#74dd9b');animate(signal,'signal');}

   for(let i=0;i<110;i++)orb(stage,Math.sin(i*13)*380,70+(i*17%180),-150-Math.cos(i*7)*100,.35,'#f6efd3');

  }else if(index===4){

   for(let i=0;i<7;i++){box(stage,-180+i*65,22,-170,55,44,70,'#927d69');mountain(-180+i*65,-160,45,38,'#a18b70');}

   for(let i=0;i<7;i++){const animal=new T.Group();stage.add(animal);box(animal,0,1.8,0,3,1.3,1,'#bf9567');box(animal,1.7,2.6,0,.7,1.4,.6,'#ba9163');for(const x of [-1,1])for(const z of [-.4,.4])box(animal,x,.7,z,.17,1.4,.17,'#4b4137');animal.position.set(-80+i*13,0,-30-i%3*7);animate(animal,'animal');}

  }else if(index===5){

   building(35,-45,75,13,16,'#eee0c1');building(35,-45,13,24,19,'#e7d6b3');cone(stage,35,29,-45,10,10,'#6d5753',4);

   box(stage,35,5,-35,80,.5,8,'#8b7765');for(let x=-1;x<74;x+=6)box(stage,x,2.5,-31,.35,5,.35,'#e5ddce');

   const bus=new T.Group();stage.add(bus);box(bus,0,3,0,12,5.5,4,'#b73532');for(const y of [2.2,4.5])for(let x=-4;x<5;x+=2)box(bus,x,y,2.03,1.5,1.1,.1,'#b3d1d5');for(const x of [-4,4])for(const z of [-2,2])orb(bus,x,.6,z,.8,'#243139');bus.position.set(-50,0,-20);animate(bus,'bus');

  }else if(index===6){

   for(let i=0;i<8;i++)mountain(-190+i*60,-140,60,65+(i%3)*20,'#8a8d89');

   for(let row=0;row<13;row++)for(let col=0;col<12;col++)box(stage,-150+col*24,1,-20-row*6,18,2,1.8,'#53734c');

   // Portal beside the track: illustrative pass landmark, not a surveyed alignment.

   box(stage,145,6,-4,9,12,3,'#706d63');box(stage,145,6,4,9,12,3,'#706d63');box(stage,145,13,0,9,3,11,'#706d63');

  }else{

   box(stage,20,45,-180,185,90,65,'#818d88');mountain(-130,-160,60,76,'#8f9990');mountain(155,-150,45,55,'#8b9793');

   box(stage,0,.05,-290,900,.1,260,'#558f9f');

   for(let i=0;i<16;i++)building(-150+i*20,-55,14,10+(i%3)*4,16,['#d59777','#ddc355','#6faeb3','#c98fa1'][i%4]);

   for(let i=0;i<8;i++){const cloud=orb(stage,-70+i*24,93,-178,17,'#e1e6df');cloud.scale.set(1.7,.3,1);animate(cloud,'cloud');}

  }

 }

 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);resize();

 function render(index:number,phase:number,time:number,windowSeat:boolean){

  stage.position.x=-20-phase*70;

  train.position.x=-10;

  wheels.forEach(w=>w.rotation.y=time*3);

  animated.forEach(a=>{if(a.kind==='bus')a.object.position.x=a.x+Math.sin(time*.22)*26;if(a.kind==='animal'){a.object.position.x=a.x+Math.sin(time*.4)*9;a.object.position.y=Math.abs(Math.sin(time*3+a.x))*.22;}if(a.kind==='bucket')a.object.position.y=a.y+Math.sin(time*.7)*5;if(a.kind==='cloud')a.object.position.x=a.x+Math.sin(time*.15)*8;if(a.kind==='signal')a.object.scale.setScalar(.9+Math.sin(time*2+a.x)*.12);});

  if(cameraDirty){
   if(selectedView==='window'){camera.position.set(-15,6,side*2.2);controls.target.set(25,14,side*70);}
   else if(selectedView==='follow'){camera.position.set(-175,24,35);controls.target.set(-30,5,-20);}
   else if(selectedView==='side'){camera.position.set(-30,22,100);controls.target.set(-30,6,-25);}
   else if(selectedView==='visit'){camera.position.set(80,30,40);controls.target.set(stage.position.x+35,12,-45);}
   else{camera.position.set(130,110,200);controls.target.set(-10,10,-55);}
   camera.lookAt(controls.target);cameraDirty=false;
  }
  controls.update();
  renderer.render(scene,camera);

 }

 return{setChapter,render,
 setView(value:string){selectedView=value;cameraDirty=true;},
 setSide(value:number){side=value;cameraDirty=true;},
 setQuality(value:string){renderer.setPixelRatio(value==='light'?1:Math.min(devicePixelRatio,1.5));resize();},
 setTime(key:TimeKey){const p=TIME_PRESETS[key];scene.background=new T.Color(p.skyColour);scene.fog=new T.Fog(p.skyColour,280,1100);ambient.intensity=p.hemisphereIntensity;sun.intensity=p.sunIntensity;sun.color.set(p.sunColour);sun.position.set(...p.sunDirection).multiplyScalar(100);},
 destroy(){controls.dispose();observer.disconnect();scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();if(!Array.isArray(o.material)&&!Array.from(materials.values()).includes(o.material as T.MeshStandardMaterial))o.material.dispose();}});materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();}};

}

