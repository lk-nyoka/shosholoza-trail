import type { Coordinate } from './ride-model.js';

export const COACH_LENGTH = 22, LOCO_LENGTH = 19, GAP = 1.2, BOGIE_SPACING = 15.5, HALF_WIDTH = 1.52;
export const COACH_HEIGHT = 4, LOCO_HEIGHT = 4.2, WHEEL_RADIUS = .46;
export const TRAIN_LIVERY = { turquoise:'#2FA8C6', yellow:'#EBB937', violet:'#7E63A8', locomotive:'#8B76B8', underframe:'#3A3F45', roof:'#A9AFB5', window:'#1D2A33', lit:'#F6D9A0' } as const;
export type DepartureState = 'idle' | 'departure-prep' | 'creep' | 'accelerating' | 'cruising';
export type TrainFeature = {type:'Feature'; id:string; properties:{vehicle:number; part:string; partType:string; livery:string; color:string; base:number; height:number; lit?:boolean}; geometry:{type:'Polygon';coordinates:Coordinate[][]}};
export type TrainVehicle = {index:number;kind:'locomotive'|'coach';length:number;offset:number;chainage:number;frontBogie:Coordinate;rearBogie:Coordinate;heading:number;frontBogieHeading:number;rearBogieHeading:number;pitch:number;roll:number;heave:number;wheelAngle:number;windows:boolean[]};
export type RailElevationSample = {chainage:number;elevation:number};
export type TrainModel = {coordinates:Coordinate[];cumulative:number[];elevations:number[];railElevationSamples:RailElevationSample[];vehicles:TrainVehicle[];chainage:number;departureOrigin:number;lastTime:number;features:{type:'FeatureCollection';features:TrainFeature[]};state:DepartureState;worldSpeed:number;presentationTimeScale:number};

const radians=Math.PI/180;
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*x*(x*(x*6-15)+10);};
function metres(a:Coordinate,b:Coordinate){const h=Math.sin((b[1]-a[1])*radians/2)**2+Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin((b[0]-a[0])*radians/2)**2;return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function sample(model:TrainModel,s:number):Coordinate{
  const {coordinates:c,cumulative:d}=model;let i=1;
  if(s>=d[d.length-1])i=d.length-1;
  else if(s>0){let low=1,high=d.length-1;while(low<high){const mid=(low+high)>>1;if(d[mid]<s)low=mid+1;else high=mid;}i=low;}
  const t=(s-d[i-1])/Math.max(.001,d[i]-d[i-1]);return[c[i-1][0]+(c[i][0]-c[i-1][0])*t,c[i-1][1]+(c[i][1]-c[i-1][1])*t];
}
export function sampleTrainCoordinate(model:TrainModel,chainage:number){return sample(model,chainage);}
export function smoothRailProfile(values:number[]){
  const median=values.map((_,i)=>{const local=values.slice(Math.max(0,i-3),Math.min(values.length,i+4)).filter(Number.isFinite).sort((a,b)=>a-b);return local.length?local[Math.floor(local.length/2)]:0;});
  return median.map((_,i)=>{let total=0,weight=0;for(let k=-4;k<=4;k++){const w=5-Math.abs(k);total+=median[Math.max(0,Math.min(median.length-1,i+k))]*w;weight+=w;}return total/weight;});
}
export function setTrainRailElevationSamples(model:TrainModel,raw:RailElevationSample[]){
  const ordered=raw.filter(value=>Number.isFinite(value.chainage)&&Number.isFinite(value.elevation)).sort((a,b)=>a.chainage-b.chainage);
  if(ordered.length<3)return;
  const filtered=smoothRailProfile(ordered.map(value=>value.elevation));
  model.railElevationSamples=ordered.map((value,index)=>({chainage:value.chainage,elevation:filtered[index]}));
}
export function railElevationAt(model:TrainModel,s:number){
  const local=model.railElevationSamples;
  if(local.length>=2&&s>=local[0].chainage&&s<=local[local.length-1].chainage){
    let lo=0,hi=local.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(local[mid].chainage<s)lo=mid;else hi=mid;}
    const t=(s-local[lo].chainage)/(local[hi].chainage-local[lo].chainage||1);return local[lo].elevation*(1-t)+local[hi].elevation*t;
  }
  const d=model.cumulative;let lo=0,hi=d.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(d[mid]<s)lo=mid;else hi=mid;}const t=Math.max(0,Math.min(1,(s-d[lo])/(d[hi]-d[lo]||1)));return model.elevations[lo]*(1-t)+model.elevations[hi]*t;
}
export function departureProfile(elapsedSeconds:number,requestedScale=1,started=true){
  const presentationTimeScale=Math.max(1,Math.min(2,requestedScale));const t=Math.max(0,elapsedSeconds)*presentationTimeScale;
  let state:DepartureState='idle',speedKmh=0;
  if(started){if(t<.75)state='departure-prep';else if(t<2.75){state='creep';const p=t-.75;speedKmh=p<.67?2*smooth(p/.67):p<1.34?2+3*smooth((p-.67)/.67):5+3*smooth((p-1.34)/.66);}else if(t<5.5){state='accelerating';speedKmh=8+72*smooth((t-2.75)/2.75);}else{state='cruising';speedKmh=80;}}
  return {state,speedKmh,worldSpeed:speedKmh/3.6*Math.max(1,requestedScale),presentationTimeScale};
}
// Distance is the integral of the staged speed curve. Normalising that
// integral to a UI journey segment preserves the physical departure shape
// while the route's 1x/4x/16x presentation still completes predictably.
export function departureProgress(elapsedSeconds:number,requestedScale:number,durationSeconds:number){
  const integrate=(until:number)=>{let total=0;const steps=80,dt=Math.max(0,until)/steps;for(let index=0;index<steps;index++)total+=departureProfile((index+.5)*dt,requestedScale,true).worldSpeed*dt;return total;};
  return Math.max(0,Math.min(1,integrate(Math.min(elapsedSeconds,durationSeconds))/Math.max(.001,integrate(durationSeconds))));
}
export function semanticTrainScale(zoom:number){return Math.max(1,Math.min(1.8,1+.8*smooth((17-zoom)/6)));}

export function createTrainModel(coordinates:Coordinate[],rawElevations:number[]=[],seed=1729):TrainModel{
  if(coordinates.length<2)throw new Error('Train requires a continuous rail route');
  const cumulative=[0];for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative[i-1]+metres(coordinates[i-1],coordinates[i]));
  let offset=0;const vehicles:TrainVehicle[]=[];
  for(let i=0;i<18;i++){const length=i<2?LOCO_LENGTH:COACH_LENGTH;if(i)offset+=(vehicles[i-1].length+length)/2+GAP;vehicles.push({index:i,kind:i<2?'locomotive':'coach',length,offset,chainage:-offset,frontBogie:coordinates[0],rearBogie:coordinates[0],heading:0,frontBogieHeading:0,rearBogieHeading:0,pitch:0,roll:0,heave:0,wheelAngle:0,windows:Array.from({length:12},(_,j)=>(((seed^(i*73856093)^(j*19349663))>>>0)%7)<4)});}
  return {coordinates,cumulative,elevations:smoothRailProfile(rawElevations.length===coordinates.length?rawElevations:coordinates.map(()=>0)),railElevationSamples:[],vehicles,chainage:0,departureOrigin:0,lastTime:0,features:{type:'FeatureCollection',features:[]},state:'idle',worldSpeed:0,presentationTimeScale:1};
}

function rectangle(center:Coordinate,heading:number,length:number,width:number):Coordinate[]{
  const dx=Math.sin(heading),dy=Math.cos(heading),mx=111320*Math.cos(center[1]*radians),my=110540;
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
  return corners.map(([a,b])=>[center[0]+(dx*a*length/2-dy*b*width/2)/mx,center[1]+(dy*a*length/2+dx*b*width/2)/my]);
}

export function updateTrainModel(model:TrainModel,routeChainageMetres:number,elapsedSeconds:number,options:{requestedScale?:number;started?:boolean;reducedMotion?:boolean;night?:boolean;scale?:number}={}){
  const profile=departureProfile(elapsedSeconds,options.requestedScale??1,options.started??true);
  Object.assign(model,profile);const dt=Math.max(0,elapsedSeconds-model.lastTime),scale=Math.max(1,Math.min(1.8,options.scale??1));
  if(profile.state==='idle'||profile.state==='departure-prep'||elapsedSeconds<=.75/profile.presentationTimeScale)model.departureOrigin=routeChainageMetres;
  const features:TrainFeature[]=[];
  for(const vehicle of model.vehicles){
    const delay=vehicle.index*.07;
    // Each vehicle stays at its departure chainage until its coupler takes up.
    // Delays are real milliseconds even at 16x. Smooth catch-up then restores the
    // exact nominal gap; it is not a permanent per-coach speed lag.
    const departureTime=elapsedSeconds-.75/profile.presentationTimeScale;
    const takeUp=vehicle.index===0||profile.state==='idle'||profile.state==='departure-prep'?1:smooth((departureTime-delay)/.35);
    const priorChainage=vehicle.chainage;
    vehicle.chainage=model.departureOrigin+(routeChainageMetres-model.departureOrigin)*takeUp-vehicle.offset;vehicle.wheelAngle+=(vehicle.chainage-priorChainage)/WHEEL_RADIUS;
    vehicle.frontBogie=sample(model,vehicle.chainage+BOGIE_SPACING/2);vehicle.rearBogie=sample(model,vehicle.chainage-BOGIE_SPACING/2);
    const rear=vehicle.rearBogie,front=vehicle.frontBogie,lat=(rear[1]+front[1])/2;
    vehicle.heading=Math.atan2((front[0]-rear[0])*Math.cos(lat*radians),front[1]-rear[1]);
    const frontBefore=sample(model,vehicle.chainage+BOGIE_SPACING/2-1),frontAfter=sample(model,vehicle.chainage+BOGIE_SPACING/2+1);
    const rearBefore=sample(model,vehicle.chainage-BOGIE_SPACING/2-1),rearAfter=sample(model,vehicle.chainage-BOGIE_SPACING/2+1);
    vehicle.frontBogieHeading=Math.atan2((frontAfter[0]-frontBefore[0])*Math.cos(front[1]*radians),frontAfter[1]-frontBefore[1]);
    vehicle.rearBogieHeading=Math.atan2((rearAfter[0]-rearBefore[0])*Math.cos(rear[1]*radians),rearAfter[1]-rearBefore[1]);
    const targetPitch=Math.atan2(railElevationAt(model,vehicle.chainage+25)-railElevationAt(model,vehicle.chainage-25),50);
    vehicle.pitch+=(targetPitch-vehicle.pitch)*(1-Math.exp(-Math.min(dt,1)*3));
    vehicle.heave=options.reducedMotion?0:Math.sin(vehicle.chainage*.21)*.015;
    vehicle.roll=options.reducedMotion?0:Math.max(-1.2,Math.min(1.2,Math.sin(vehicle.chainage*.13)*.35));
    const sway=options.reducedMotion?0:Math.sin(vehicle.chainage*.17)*.02;
    const center:Coordinate=[(rear[0]+front[0])/2-Math.cos(vehicle.heading)*sway/(111320*Math.cos(lat*radians)),lat+Math.sin(vehicle.heading)*sway/110540];
    const livery=vehicle.kind==='locomotive'?'locomotive':(['turquoise','yellow','violet'] as const)[(vehicle.index-2)%3];
    const add=(part:string,c:Coordinate,length:number,width:number,base:number,height:number,color:string,lit?:boolean)=>features.push({type:'Feature',id:`train:${vehicle.index}:${part}`,properties:{vehicle:vehicle.index,part,partType:part.startsWith('window:')?'window':part,livery,color,base:base*scale+vehicle.heave,height:height*scale+vehicle.heave,...(lit===undefined?{}:{lit})},geometry:{type:'Polygon',coordinates:[rectangle(c,vehicle.heading,length,width)]}});
    add('underframe',center,vehicle.length,HALF_WIDTH*2*scale,0,1.1,TRAIN_LIVERY.underframe);
    const bodyColor=options.night?'#'+TRAIN_LIVERY[livery].slice(1).match(/../g)!.map(channel=>Math.round(parseInt(channel,16)*.7).toString(16).padStart(2,'0')).join(''):TRAIN_LIVERY[livery];
    add('body',center,vehicle.length,HALF_WIDTH*2*scale,1.1,3.4,bodyColor);
    add('roof',center,vehicle.length-.5,(HALF_WIDTH*2-.5)*scale,3.4,vehicle.kind==='locomotive'?LOCO_HEIGHT:COACH_HEIGHT,TRAIN_LIVERY.roof);
    if(vehicle.kind==='locomotive')add('pantograph',center,2,.15*scale,LOCO_HEIGHT,5.4,TRAIN_LIVERY.underframe);
    // Continuous dark waistline behind individual glazing. Offset it beyond
    // the body sides so depth testing cannot hide the band inside the coach.
    for(const side of [-1,1]){
      const transverse=side*(HALF_WIDTH*scale+.025);
      const band:Coordinate=[center[0]-Math.cos(vehicle.heading)*transverse/(111320*Math.cos(lat*radians)),center[1]+Math.sin(vehicle.heading)*transverse/110540];
      add(`window:band:${side}`,band,vehicle.length-1.5,.08,2.15,3.05,TRAIN_LIVERY.window);
    }
    for(let j=0;j<12;j++)for(const side of [-1,1]){
      const longitudinal=(j-5.5)*1.45,transverse=side*(HALF_WIDTH*scale+.075);
      const c:Coordinate=[center[0]+(Math.sin(vehicle.heading)*longitudinal-Math.cos(vehicle.heading)*transverse)/(111320*Math.cos(lat*radians)),center[1]+(Math.cos(vehicle.heading)*longitudinal+Math.sin(vehicle.heading)*transverse)/110540];
      const lit=Boolean(options.night&&vehicle.windows[j]);add(`window:${side}:${j}`,c,.95,.07,2.25,2.95,lit?TRAIN_LIVERY.lit:TRAIN_LIVERY.window,lit);
    }
  }
  model.chainage=routeChainageMetres;model.lastTime=elapsedSeconds;model.features={type:'FeatureCollection',features};return model;
}
