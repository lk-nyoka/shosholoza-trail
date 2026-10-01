import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import maplibregl, { ensureMapLibre } from '../vendor/maplibre';
import type { Map as RailMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import './DeAar.css';
import {createDeAarDirector,type DirectorState} from '../deaar/DeAarDirector';
type Candidate={coordinates:[number,number][];score:number;bearingError:number;edgeIds:string[]};
type Dataset={station:[number,number];snapshotDate:string;counts:Record<string,number>;routeStatus:string};
export function DeAar(){
 const director=useRef<ReturnType<typeof createDeAarDirector>|null>(null),controlData=useRef<FeatureCollection>({type:'FeatureCollection',features:[]});
 const [motion,setMotion]=useState<DirectorState|null>(null),[sound,setSound]=useState(false),[ready,setReady]=useState(false);
 const host=useRef<HTMLDivElement>(null),map=useRef<RailMap|null>(null);
 const [data,setData]=useState<Dataset|null>(null),[candidates,setCandidates]=useState<Candidate[]>([]),[selected,setSelected]=useState(-1),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();let owned:RailMap|undefined;let shared:HTMLDivElement|undefined;
  async function load(){
   const read=async(name:string)=>{const r=await fetch('/data/deaar/v1/'+name,{signal:abort.signal});if(!r.ok)throw Error('De Aar dataset unavailable: '+name);return r.json();};
   const [manifest,rail,controls,resolution,platforms]=await Promise.all([read('dataset-manifest.json'),read('rail.geojson'),read('controls.geojson'),read('resolution.json'),read('platforms.geojson'),ensureMapLibre()]);
   if(abort.signal.aborted)return;
   setData(manifest);setCandidates(resolution.candidates);controlData.current=controls;
   owned=new maplibregl.Map({container:host.current!,center:manifest.station,zoom:14.2,pitch:35,style:{version:8,sources:{},layers:[{id:'ground',type:'background',paint:{'background-color':'#202c2b'}}]},attributionControl:false});map.current=owned;
   owned.addControl(new maplibregl.AttributionControl({compact:false,customAttribution:'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ODbL'}));
   owned.addControl(new maplibregl.NavigationControl(),'top-right');
   owned.on('error',e=>{if(!abort.signal.aborted)setError(e.error.message);});
   owned.on('load',()=>{const m=owned!;
    m.addSource('rail',{type:'geojson',data:rail});m.addSource('controls',{type:'geojson',data:controls});
    m.addSource('platforms',{type:'geojson',data:platforms});m.addLayer({id:'platforms',type:'line',source:'platforms',paint:{'line-color':'#9c9987','line-width':7}});
    m.addSource('candidate',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    m.addLayer({id:'rails',type:'line',source:'rail',paint:{'line-color':['match',['get','railClass'],'main','#e0cf9f','yard','#9fafa6','#73837c'],'line-width':['interpolate',['linear'],['zoom'],12,1,17,4],'line-opacity':['case',['get','active'],.9,.25]}});
    m.addLayer({id:'route-glow',type:'line',source:'candidate',paint:{'line-color':'#f8bb55','line-width':12,'line-blur':6}});
    m.addLayer({id:'route-core',type:'line',source:'candidate',paint:{'line-color':'#ffe4a7','line-width':3}});
    m.addLayer({id:'switches',type:'circle',source:'controls',filter:['==',['get','kind'],'switch'],paint:{'circle-color':'#74ccc0','circle-radius':['interpolate',['linear'],['coalesce',['feature-state','pulse'],0],0,3,1,12],'circle-stroke-width':1,'circle-stroke-color':'#173c38'}});
    const label=document.createElement('div');label.className='deaar-station';label.textContent='DE AAR · STATION';new maplibregl.Marker({element:label}).setLngLat(manifest.station).addTo(m);
    if(new URLSearchParams(location.search).get('sceneOnly')==='1'){
     shared=document.createElement('div');shared.hidden=true;shared.id='shared-engine-controls';
     [45,65,25,80].forEach((pitch,i)=>{const b=document.createElement('button');b.id='shared-camera-'+i;b.textContent=['Alongside','Behind the train','Wide view','Window view'][i];b.onclick=()=>{director.current?.pause();m.easeTo({center:manifest.station,pitch,bearing:[90,180,0,180][i],zoom:[15,16,13.5,18][i],duration:600});};shared!.append(b);});
     const select=document.createElement('select');select.id='shared-time';['dawn','day','dusk','night'].forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent=key;select.append(option);});select.onchange=()=>m.setPaintProperty('ground','background-color',({dawn:'#9c846d',day:'#aab69e',dusk:'#725743',night:'#101b29'} as Record<string,string>)[select.value]);shared.append(select);document.body.append(shared);
    }
    host.current!.dataset.ready='true';setReady(true);
   });
  }
  load().catch(e=>{if(!abort.signal.aborted)setError(String(e));});return()=>{abort.abort();shared?.remove();director.current?.dispose();director.current=null;owned?.remove();map.current=null;};
 },[]);
 const choose=(index:number)=>{const m=map.current;if(!m?.getSource('candidate'))return;director.current?.dispose();director.current=null;setMotion(null);setSound(false);setSelected(index);const c=candidates[index];const line:FeatureCollection={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c.coordinates}}]};(m.getSource('candidate') as GeoJSONSource).setData(line);const bounds=new maplibregl.LngLatBounds();c.coordinates.forEach(p=>bounds.extend(p));m.fitBounds(bounds,{padding:70,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:900});};
 const play=()=>{if(!ready||selected<0||!map.current)return;if(!director.current)director.current=createDeAarDirector(map.current,candidates[selected].coordinates,controlData.current,setMotion);director.current.play();};
 return <main className="deaar journey-chapter" data-location="de-aar"><header className="chapter-header"><Link to="/destinations">← Destinations</Link><h1>De Aar</h1><span>CROSSROADS OF THE RAILS</span></header><div ref={host} className="deaar-map" aria-label="Mapped De Aar railway junction"/><aside className="chapter-context"><p className="deaar-eyebrow">RAILWAY INSPECTOR</p><h1>The junction is the landmark.</h1><p>Explore the cached railway network. Turquoise dots mark mapped switches; gold highlights a candidate exit.</p>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Loading the local rail snapshot…</p>}{data&&<><dl>{Object.entries(data.counts).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><p>OSM snapshot · {data.snapshotDate}</p><h2>Southbound candidates</h2><p>These routes await corridor review. Highlighting does not certify a passenger route or live switch state.</p>{candidates.map((c,i)=><button key={i} onClick={()=>choose(i)} aria-pressed={selected===i}>Inspect candidate {i+1} · {Math.round(c.bearingError)}° bearing difference</button>)}</>}</aside><section className="chapter-controls" aria-label="De Aar chapter controls"><button disabled={!ready||selected<0} onClick={play}>{motion?.time===40?'Replay preview':'Play junction preview'}</button>{motion&&<><button onClick={()=>motion.playing?director.current?.pause():director.current?.play()}>{motion.playing?'Pause':'Resume'}</button><label>Explore the sequence<input aria-label="Director timeline" type="range" min="0" max="40" step=".1" value={motion.time} onChange={e=>director.current?.seek(Number(e.target.value))}/></label><button aria-pressed={sound} onClick={async()=>{try{await director.current?.sound(!sound);setSound(!sound);}catch{setError('Sound unavailable; the animation can continue.');}}}>Train sound {sound?'on':'off'}</button><span role="status">{motion?.phase ?? (selected<0?'Choose a route in the guide':'Ready')} {motion?`· ${Math.round(motion.time)} / 40 seconds`:''}</span></>}</section></main>;
}
