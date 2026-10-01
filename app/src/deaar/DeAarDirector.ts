import type {Map,GeoJSONSource} from 'maplibre-gl';
import type {FeatureCollection,Point} from 'geojson';
import {createTrainModel,sampleTrainCoordinate,updateTrainModel} from '../train-model';
import {TrainSound} from '../animation/TrainSound';

export type DirectorState={time:number;playing:boolean;phase:string};
const duration=40;
export function createDeAarDirector(map:Map,coordinates:[number,number][],controls:FeatureCollection,notify:(state:DirectorState)=>void){
 const model=createTrainModel(coordinates),audio=new TrainSound();
 const end=model.cumulative.at(-1)!;
 let time=0,playing=false,frame=0,last=0,dead=false,lastDraw=-1,lastNotify=-1;
 const switches=controls.features.filter(f=>f.properties?.kind==='switch'&&f.geometry.type==='Point').sort((a,b)=>{
  const p=(a.geometry as Point).coordinates,q=(b.geometry as Point).coordinates,c=coordinates[0];
  return Math.hypot(p[0]-c[0],p[1]-c[1])-Math.hypot(q[0]-c[0],q[1]-c[1]);
 }).slice(0,6);
 const source=map.getSource('train') as GeoJSONSource|undefined;
 if(!source){map.addSource('train',{type:'geojson',data:model.features});map.addLayer({id:'deaar-train',type:'fill-extrusion',source:'train',paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1}});}
 const smooth=(x:number)=>{const p=Math.max(0,Math.min(1,x));return p*p*(3-2*p);};
 const phase=()=>time<5?'Train approach':time<13?'Above the yard':time<22?'Crossroads of the rails':time<29?'Candidate route reveal':time<40?'Return to the train':'Preview complete';
 const publish=()=>notify({time,playing,phase:phase()});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const render=()=>{
  const s=Math.min(end-10,440+time*12);
  updateTrainModel(model,s,time,{started:false,reducedMotion:true,scale:1});
  (map.getSource('train') as GeoJSONSource).setData(model.features);
  const train=sampleTrainCoordinate(model,s),ahead=sampleTrainCoordinate(model,Math.min(end,s+70));
  const heading=Math.atan2((ahead[0]-train[0])*Math.cos(train[1]*Math.PI/180),ahead[1]-train[1])*180/Math.PI;
  const rise=smooth((time-4)/9),descend=smooth((time-28)/10),wide=rise*(1-descend);
  const centre:[number,number]=[train[0]*(1-wide)+coordinates[0][0]*wide,train[1]*(1-wide)+coordinates[0][1]*wide];
  if(!reduced)map.jumpTo({center:centre,zoom:17.5-3.7*wide,pitch:62-29*wide,bearing:heading*(1-wide)+25*wide});
  const reveal=smooth((time-22)/5);
  map.setPaintProperty('route-glow','line-opacity',reveal*.8);map.setPaintProperty('route-core','line-opacity',reveal);
  switches.forEach((f,i)=>{const start=14+i*.9;const pulse=time>=start&&time<start+1.4?Math.sin((time-start)/1.4*Math.PI):0;map.setFeatureState({source:'controls',id:f.id!},{pulse});});
  map.getContainer().dataset.phase=phase();map.getContainer().dataset.time=time.toFixed(2);
 };
 const tick=(now:number)=>{
  if(dead)return;const dt=last?Math.min(.15,(now-last)/1000):0;last=now;
  if(playing&&!document.hidden){time=Math.min(duration,time+dt);if(time===duration){playing=false;publish();}}
  if(Math.abs(lastDraw-time)>=1/20||time===duration&&lastDraw!==time){render();lastDraw=time;}
  audio.update({speed:12,distance:440+time*12,dt,nearCrossing:false,paused:!playing,environment:time>5&&time<32?'STATION':'OPEN',cameraMode:time>5&&time<36?'CINEMATIC':'FOLLOW',cameraDistanceM:time>5&&time<32?200:15});
  if(Math.floor(time*4)!==lastNotify){lastNotify=Math.floor(time*4);publish();}
  frame=requestAnimationFrame(tick);
 };
 map.stop();render();publish();frame=requestAnimationFrame(tick);
 return {play(){if(time>=duration)time=0;playing=true;map.stop();publish();},pause(){playing=false;publish();},seek(value:number){playing=false;time=Math.max(0,Math.min(duration,value));render();publish();},async sound(enabled:boolean){if(enabled)await audio.enable();else audio.disable();},dispose(){dead=true;cancelAnimationFrame(frame);audio.dispose();switches.forEach(f=>map.removeFeatureState({source:'controls',id:f.id!}));if(map.getLayer('deaar-train'))map.removeLayer('deaar-train');if(map.getSource('train'))map.removeSource('train');}};
}
