import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { STOPS } from '../data';
import { createTrailWorld } from './world';
import './trail.css';
const MOMENTS=['Jacaranda avenue · Union Buildings','Egoli skyline · gold-bearing landscape','Big Hole · mine hoist','Night junction · signal lights','Karoo koppies · springbok','Lord Milner Hotel · red village bus','Hex River mountains · vineyards','Table Mountain · arrival at the sea'];
// Shared layout and controls; each stop supplies colours only.
const THEMES=[
 ['#281f3e','#d3b4ff','#443557'], ['#322719','#f5cb70','#51422a'],
 ['#19353b','#91dadd','#2d5055'], ['#172039','#bbcaff','#2c3856'],
 ['#3b2d23','#e9c397','#584636'], ['#402327','#ffb5ac','#60373c'],
 ['#23382c','#bdd99b','#395341'], ['#18343f','#99dded','#2c505e'],
];
const SECONDS=24, TOTAL=SECONDS*8;
export function TrailDraft(){
 const [query]=useSearchParams();const initial=Math.max(0,STOPS.findIndex(s=>s.id===query.get('stop')))*SECONDS;
 const host=useRef<HTMLDivElement>(null),clock=useRef(initial),playingRef=useRef(false),windowRef=useRef(false);
 const [elapsed,setElapsed]=useState(initial),[playing,setPlaying]=useState(false),[windowSeat,setWindowSeat]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false);
 const index=Math.min(7,Math.floor(elapsed/SECONDS)),finished=elapsed>=TOTAL,stop=STOPS[index];
 useEffect(()=>{if(!host.current)return;let world:ReturnType<typeof createTrailWorld>;try{world=createTrailWorld(host.current);}catch{setError('The 3D draft could not start on this device. The map and individual chapters are still available.');return;}
 let frame=0,last=performance.now(),shown=-1,lastUi=0;setReady(true);
 const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.1);last=now;if(playingRef.current&&!document.hidden){clock.current=Math.min(TOTAL,clock.current+dt);if(clock.current===TOTAL){playingRef.current=false;setPlaying(false);}}
 const chapter=Math.min(7,Math.floor(clock.current/SECONDS));if(chapter!==shown){world.setChapter(chapter);shown=chapter;}
 world.render(chapter,(clock.current-chapter*SECONDS)/SECONDS,clock.current,windowRef.current);
 if(now-lastUi>100){setElapsed(clock.current);lastUi=now;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 return()=>{cancelAnimationFrame(frame);world.destroy();};},[]);
 useEffect(()=>{const id=query.get('stop');const found=STOPS.findIndex(s=>s.id===id);if(found>=0){clock.current=found*SECONDS;setElapsed(clock.current);}},[query]);
 const jump=(seconds:number)=>{clock.current=Math.max(0,Math.min(TOTAL,seconds));setElapsed(clock.current);};
 const toggle=()=>{if(finished)jump(0);playingRef.current=!playingRef.current;setPlaying(playingRef.current);};
 const palette=THEMES[index];
 const theme={'--trail-panel':palette[0],'--trail-accent':palette[1],'--trail-button':palette[2]} as CSSProperties;
 return <main style={theme} className="trail-draft" data-ready={ready} data-stop={stop.id}>
 <div className="trail-world" ref={host} aria-label={`Animated ${stop.name} landscape`}/>
 <header><Link to="/chapters">All chapters</Link><strong>Pretoria to Cape Town</strong><Link to="/journey">Geographic map</Link></header>
 <section className="trail-caption"><small>CONNECTED DRAFT · {index+1} / 8</small><h1>{stop.name}</h1><p>{MOMENTS[index]}</p><p className="trail-disclosure">Simplified 3D landmarks and compressed surroundings. Illustrative scenery, not surveyed geography.</p>{error&&<p role="alert">{error}</p>}{finished&&<p role="status">You reached Cape Town. All eight draft scenes are connected.</p>}
 <div className="trail-detail-slot"><span>One continuous journey · eight animated stops</span></div>
 <p className="trail-next" aria-live="polite">{index<7?`Next: ${STOPS[index+1].name}`:'Final stop: Cape Town'}</p>
 </section>
 <footer><div className="trail-actions"><button disabled={!ready} onClick={toggle}>{finished?'Replay journey':playing?'Pause':'Play journey'}</button><button onClick={()=>{windowRef.current=!windowRef.current;setWindowSeat(windowRef.current);}}>{windowSeat?'Landscape view':'Window view'}</button><button disabled={index===0} onClick={()=>jump((index-1)*SECONDS)}>Previous</button><button disabled={index===7} onClick={()=>jump((index+1)*SECONDS)}>Next stop</button><span>{Math.floor(elapsed/60)}:{String(Math.floor(elapsed%60)).padStart(2,'0')} / 3:12</span></div>
 <input aria-label="Journey progress" type="range" min="0" max={TOTAL} step=".1" value={elapsed} onChange={e=>jump(+e.target.value)}/>
 <nav aria-label="Eight animated stops">{STOPS.map((s,i)=><button key={s.id} aria-current={i===index?'step':undefined} onClick={()=>jump(i*SECONDS)}>{i+1}. {s.name}</button>)}</nav>
 </footer></main>;
}
