import { createTrailWorld } from '../trail-draft/world';
import { TrainSound } from './TrainSound';
import type { createRailScene } from './RailScene';

// Only the two previously empty towns use the draft scenery. The interface is
// AnimationRide itself, identical to the existing Pretoria experience.
export async function createMissingTownScene(
 town:'matjiesfontein'|'worcester',host:HTMLElement,signal:AbortSignal,
 report:(distance:number,fps:number)=>void,visitChanged:(label:string|null)=>void,
):Promise<NonNullable<Awaited<ReturnType<typeof createRailScene>>>> {
 const world=createTrailWorld(host),sound=new TrainSound();
 const index=town==='matjiesfontein'?5:6,end=700;
 world.setChapter(index);host.dataset.journeyEnd=String(end);
 let distance=0,playing=false,elapsed=0,travelled=0,activeSeconds=0,view='side',visiting=false,disposed=false,last=performance.now(),lastReport=0,frame=0;
 const returnToTrain=()=>{visiting=false;world.setView(view);visitChanged(null);};
 const tick=(now:number)=>{if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;const moving=playing&&!visiting&&!document.hidden;
 if(moving){const step=Math.min(end-distance,dt*14);distance+=step;travelled+=step;activeSeconds+=dt;elapsed+=dt;if(distance>=end)playing=false;}
 world.render(index,distance/end,elapsed,view==='window');sound.update({speed:moving?14:0,distance,nearCrossing:false,dt,paused:!moving,cameraMode:view==='window'?'WINDOW':'FOLLOW'});
 if(now-lastReport>100){report(distance,Math.round(1/Math.max(.001,dt)));lastReport=now;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 const dispose=()=>{if(disposed)return;disposed=true;signal.removeEventListener('abort',dispose);cancelAnimationFrame(frame);sound.dispose();world.destroy();};signal.addEventListener('abort',dispose,{once:true});if(signal.aborted)dispose();
 return {places:[],landmarks:[],journeyEnd:end,
 get telemetry(){return {speedKph:playing?50.4:0,playing,travelled,activeSeconds,completedLandmarks:[]};},
 setQuality:world.setQuality,setTime:world.setTime,
 play(value){playing=value;},seek(value){returnToTrain();distance=Math.max(0,Math.min(end,value));playing=false;elapsed=distance/14;report(distance,0);},
 async setSound(on){if(on)await sound.enable();else sound.disable();},
 view(value){view=value;returnToTrain();host.dataset.cameraView=value;},windowSide:world.setSide,
 // No geographic POI label set is supplied for these illustrative blockouts.
 setWindowLabels(){},
 visitStation(){visiting=true;world.setView('visit');visitChanged(town==='matjiesfontein'?'Lord Milner Hotel and village bus - illustrative study':'Hex River mountain and vineyard study');},
 pauseVisit(value){playing=!value;},returnToTrain,
 playLandmark(){visiting=true;world.setView('visit');},skipLandmark:returnToTrain,pauseLandmark(value){playing=!value;},dispose,
 };
}
