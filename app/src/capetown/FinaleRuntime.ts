import { ProgressTriggerTimeline } from './template/core/ProgressTriggerTimeline';
import * as THREE from 'three';
import { CinematicCamera } from '../animation/CinematicCamera';
import { TrainSound } from '../animation/TrainSound';
import { CapeTownChapterController } from './template/capetown/CapeTownChapterController';
import type { CapeTownAdapters } from './template/adapters/contracts';
import type { PanoramaPoint } from './template/core/types';
import { createFinaleWorld } from './FinaleWorld';

export type FinaleState={phase:string;title:string;body:string;progress:number;running:boolean;paused:boolean;panorama:PanoramaPoint[];memories:string[];complete:boolean;error:string};
export const initialFinaleState:FinaleState={phase:'IDLE',title:'Cape Town · Mountain to Sea',body:'A journey from the railway to the mountain and harbour.',progress:0,running:false,paused:false,panorama:[],memories:[],complete:false,error:''};

export async function createFinaleRuntime(host:HTMLElement,signal:AbortSignal,notify:(state:FinaleState)=>void){
  const world=await createFinaleWorld(host,signal),sound=new TrainSound();
  let state={...initialFinaleState},dead=false,paused=false,time=0,last=performance.now(),frame=0,speed=0,rail=0,mode='FOLLOW',environment='OPEN',runAbort=new AbortController();
  const memories=new Set<string>();
  try{const saved=JSON.parse(localStorage.getItem('shosholoza:cape-town:v1')??'{}');if(Array.isArray(saved.memories))saved.memories.filter((s:unknown)=>typeof s==='string').slice(0,30).forEach((s:string)=>memories.add(s));state.complete=saved.complete===true;}catch{}
  const update=(patch:Partial<FinaleState>)=>{if(dead)return;state={...state,...patch,memories:[...memories]};notify(state);};
  const save=()=>{try{localStorage.setItem('shosholoza:cape-town:v1',JSON.stringify({phase:state.phase,passport:memories.has('cape-town-passport'),complete:state.complete,memories:[...memories]}));}catch{}};
  type Job={start:number;duration:number;tick:(p:number)=>void;resolve:()=>void;reject:(reason:Error)=>void;signal?:AbortSignal};
  const jobs=new Set<Job>();
  const animate=(duration:number,tick:(p:number)=>void=()=>{},abort?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    if(dead||abort?.aborted||runAbort.signal.aborted){reject(new Error('Chapter cancelled'));return;}
    jobs.add({start:time,duration:Math.max(1,duration),tick,resolve,reject,signal:abort});
  });
  const sleep=(ms:number,abort?:AbortSignal)=>animate(ms,()=>{},abort);
  const capture=async(id:string)=>{memories.add(id);update({});save();};
  const path=async(id:string,abort?:AbortSignal)=>{
    const destination=world.paths[id];if(!destination)throw new Error('Missing camera path '+id);
    world.controls.enabled=false;
    const beats=new ProgressTriggerTimeline((id.includes('mountain-to-sea') ? [
      {at:0,fire:()=>update({title:'Leaving the summit',body:'The mountain gives way to the City Bowl.'})},
      {at:.4,fire:()=>update({title:'City Bowl',body:'From the slopes towards Table Bay.'})},
      {at:.75,fire:()=>update({title:'The harbour opens',body:'Our final approach to the Waterfront.'})},
    ] : []));
    const q=world.camera.quaternion.toArray() as [number,number,number,number];
    const animation=new CinematicCamera({duration:destination.duration/1000,keyframes:[
      {time:0,position:world.camera.position.toArray(),quaternion:q,fov:world.camera.fov},
      {time:destination.duration/1000,position:destination.position.toArray(),target:destination.target.toArray(),fov:48},
    ]},new THREE.Group(),48);
    await animate(destination.duration,p=>{beats.update(p);const pose=animation.sample(p*destination.duration/1000);world.camera.position.copy(pose.position);world.camera.quaternion.copy(pose.quaternion);world.camera.fov=pose.fov;world.camera.updateProjectionMatrix();},abort);
    world.controls.target.copy(destination.target);
  };
  let activeRun=false;
  let panoramaResolve:(()=>void)|null=null;
  const card=async(title:string,body='',duration=1800)=>{update({title,body});await sleep(duration);};
  const adapters:CapeTownAdapters={
    clock:{sleep},
    camera:{setMode(value){mode=value;world.controls.enabled=value==='PANORAMA'||value==='FREE';},playPath:path,transitionToPath:id=>path(id)},
    train:{setTargetSpeedKph(value){speed=value/3.6;},async waitUntilStopped(abort){await animate(1200,p=>{speed*=1-p;},abort);speed=0;rail=world.routeEnd;},async setVisible(){}},
    world:{async setCityProfile(){},async preloadAsset(id){if(!id)throw new Error('Missing scene id');},async releaseAsset(){},async activateHeroScene(){},async deactivateHeroScene(){},async setSceneGroupVisibility(id,visible){if(id==='tablecloth-clouds')world.clouds.visible=visible;},async setEnvironmentState(id){if(id.includes('sunset')){world.sun.color.set('#ffb16b');world.sun.intensity=1.5;world.scene.background=new THREE.Color('#dbad96');(world.scene.fog as THREE.Fog).color.set('#dbad96');}},async setTimeOfDay(){world.sun.position.set(-4000,700,-2500);},async setMountainCloudAmount(value){world.cloudMaterial.opacity=value*.65;},async setBoKaapColourFocus(){},async setOceanIntensity(value){(world.sea.material as THREE.MeshStandardMaterial).roughness=1-value*.5;},async setQuality(level){world.renderer.setPixelRatio(level==='LOW'?1:Math.min(devicePixelRatio,1.5));}},
    routeFollower:{async spawnVehicle(){world.cable.visible=true;world.cableAt(0);},follow:(_id,ms,abort)=>animate(ms,p=>world.cableAt(p),abort),followWithProgress:(_id,ms,progress,abort)=>animate(ms,p=>{world.cableAt(p);progress(p);},abort),async despawnVehicle(){world.cable.visible=false;}},
    audio:{setEnvironment(value){environment=value;},setCameraMode(value){mode=value;},async playCue(){/* No supplied narration or cableway recording: do not substitute train sounds. */},async fadeScene(){}},
    effects:{async play(id){if(id==='tablecloth-cloud-pass')world.cloudMaterial.opacity=.48;},async stop(){world.cloudMaterial.opacity=.15;}},
    capture:{captureMoment:capture},
    ui:{setChapterTitle(title,subtitle){update({title:subtitle?`${title} · ${subtitle}`:title});},setPhase(phase){update({phase});host.dataset.phase=phase;save();host.dispatchEvent(new CustomEvent('cape-town:phase',{detail:{phase},bubbles:true}));},setProgress(progress){update({progress});},showLocationCard:card,showStoryCard:card,
      async showPanorama(points,abort){world.controls.enabled=true;update({panorama:points,title:'Explore the summit',body:'Choose a place to look towards it. Continue when you are ready.'});await new Promise<void>((resolve,reject)=>{const onAbort=()=>{panoramaResolve=null;reject(new Error('Cancelled'));};abort?.addEventListener('abort',onAbort,{once:true});panoramaResolve=()=>{abort?.removeEventListener('abort',onAbort);panoramaResolve=null;resolve();};});},
      hidePanorama(){update({panorama:[]});world.controls.enabled=false;},async showFinaleMoment(){/* The v1 static city cards are replaced by actual captured memories below. */},async showJourneyRecap(){update({title:'Your Cape Town memories',body:[...memories].map(id=>id.replaceAll('-',' ')).join(' · ')});},
      async unlockPassportStamp(){await capture('cape-town-passport');},async showCompletion(){update({complete:true,title:'Mountain to Sea — complete',body:'Your Cape Town chapter and captured moments are saved.',progress:1});save();},async showRecoveryNotice(body){update({error:body});}},
  };
  const controller=new CapeTownChapterController(adapters,{forceQuality:matchMedia('(max-width:600px)').matches?'LOW':'HIGH'});
  const resize=()=>{world.renderer.setSize(host.clientWidth,host.clientHeight);world.camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);world.camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const render=()=>{
    if(dead)return;const now=performance.now(),dt=Math.min(1,(now-last)/1000);last=now;
    if(!paused&&!document.hidden){time+=dt*1000;rail=Math.min(world.routeEnd,rail+speed*dt);world.clouds.position.x=Math.sin(time/24000)*60;}
    for(const job of [...jobs]){
      if(job.signal?.aborted||runAbort.signal.aborted){jobs.delete(job);job.reject(new Error('Chapter cancelled'));continue;}
      if(paused||document.hidden)continue;
      const p=Math.min(1,(time-job.start)/job.duration);try{job.tick(p);if(p===1){jobs.delete(job);job.resolve();}}catch(error){jobs.delete(job);job.reject(error instanceof Error?error:new Error(String(error)));}
    }
    world.train(rail);if(world.controls.enabled)world.controls.update();
    sound.update({speed,dt,distance:rail,nearCrossing:false,paused:paused||!state.running||!['OPEN','CITY','STATION'].includes(environment),environment:environment==='STATION'?'STATION':environment==='CITY'?'CITY':'OPEN',cameraMode:mode==='FOLLOW'?'FOLLOW':'CINEMATIC'});
    if(!document.hidden)world.render();frame=requestAnimationFrame(render);
  };
  render();update({});host.dataset.ready='true';
  return {async run(){if(activeRun)return;activeRun=true;runAbort=new AbortController();rail=Math.max(0,world.routeEnd-200);paused=false;speed=0;world.cable.visible=false;world.scene.background=new THREE.Color('#adc9d4');(world.scene.fog as THREE.Fog).color.set('#adc9d4');world.sun.color.set('#fff0d7');world.sun.intensity=2.4;world.sun.position.set(-2000,4000,-1000);update({running:true,paused:false,error:'',panorama:[]});try{await controller.run();}catch(error){if(!runAbort.signal.aborted&&!dead)update({error:String(error)});}finally{activeRun=false;update({running:false});}},
    pause(){paused=!paused;update({paused});},cancel(){speed=0;world.cable.visible=false;world.controls.enabled=false;controller.cancel();runAbort.abort();panoramaResolve?.();paused=false;update({running:false,paused:false,panorama:[],title:'Finale stopped',body:'Start again whenever you are ready.'});},
    continue(){panoramaResolve?.();},async sound(on:boolean){if(on)await sound.enable();else sound.disable();},
    async discover(point:PanoramaPoint){const target=world.geo(...point.coordinates);world.controls.target.copy(target);world.camera.lookAt(target);await capture('discovered-'+point.id);update({body:point.description});},
    async capture(){await capture('photo-'+state.phase.toLowerCase());},
    dispose(){if(dead)return;dead=true;controller.cancel();runAbort.abort();panoramaResolve?.();for(const job of jobs)job.reject(new Error('Disposed'));jobs.clear();cancelAnimationFrame(frame);observer.disconnect();sound.dispose();world.dispose();},
  };
}
