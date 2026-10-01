import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { TimeKey } from '../animation/TimeOfDay';
/** Small engine-side bridge. Camera changes cancel the chapter's camera owner first. */
export function installSharedViews(camera:THREE.PerspectiveCamera,controls:OrbitControls,origin:()=>THREE.Vector3,release:()=>void,time?:(key:TimeKey)=>void){
 if(new URLSearchParams(location.search).get('sceneOnly')!=='1')return()=>{};
 const panel=document.createElement('div');panel.hidden=true;panel.id='shared-engine-controls';
 const offsets=[[0,14,65],[-75,16,22],[110,85,140],[0,4,-3]];
 offsets.forEach((v,i)=>{const b=document.createElement('button');b.id='shared-camera-'+i;b.textContent=['Alongside','Behind the train','Wide view','Window view'][i];b.onclick=()=>{release();const p=origin();controls.enabled=true;camera.position.copy(p).add(new THREE.Vector3(...v));controls.target.copy(p).add(new THREE.Vector3(i===3?20:0,3,i===3?-50:0));camera.lookAt(controls.target);controls.update();};panel.append(b);});
 if(time){const s=document.createElement('select');s.id='shared-time';for(const key of ['dawn','day','dusk','night']){const o=document.createElement('option');o.value=key;o.textContent=key;s.append(o);}s.onchange=()=>time(s.value as TimeKey);panel.append(s);}
 document.body.append(panel);return()=>panel.remove();
}
