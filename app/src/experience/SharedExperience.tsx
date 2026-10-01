import { JourneyFlow } from './JourneyFlow';
﻿import { useEffect,useRef,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { STOPS } from '../data';
import { scenePages,sceneControls,concealSceneChrome } from './scene-adapter';
import '../components/animation-ride.css';
import './shared-experience.css';
export function SharedExperience(){const {town='pretoria'}=useParams();return <TownExperience key={town} town={town in scenePages?town:'pretoria'}/>;}
function TownExperience({town}:{town:string}){
 const frame=useRef<HTMLIFrameElement>(null),[revision,refresh]=useState(0),[compact,setCompact]=useState(false),[guide,setGuide]=useState(false),[view,setView]=useState('side'),[time,setTime]=useState('day'),[notice,setNotice]=useState('');
 const index=STOPS.findIndex(s=>s.id===town),stop=STOPS[index];
 const doc=frame.current?.contentDocument;
 const controls=doc?.querySelector('canvas')?sceneControls(doc,town):null;
 useEffect(()=>{const timer=setInterval(()=>{const d=frame.current?.contentDocument;if(d){concealSceneChrome(d);refresh(r=>r+1);}},300);return()=>clearInterval(timer);},[]);
 const ready=!!controls?.ready;
 const action=(b:HTMLButtonElement|null|undefined)=>{if(b&&!b.disabled){b.click();refresh(r=>r+1);}};
 const play=()=>{if(!controls)return;const text=controls.run?.textContent??'';if((town==='de-aar'&&controls.pause||/Running/i.test(text))&&controls.pause)action(controls.pause);else {if(controls.pause!==controls.run&&/Resume/i.test(controls.pause?.textContent??''))action(controls.pause);action(controls.run);}};
 const playbackLabel=(()=>{if(!controls)return'Start journey';const t=controls.run?.textContent??'';if((town==='de-aar'&&controls.pause)||/Running/i.test(t))return /Resume/i.test(controls.pause?.textContent??'')?'Resume journey':'Pause journey';if(/Pause/i.test(t))return'Pause journey';if(/Resume/i.test(t))return'Resume journey';return'Start journey';})();
 const selections=controls?.selects.filter(s=>s.id!=='time')??[];
 return <main className="animation-ride shared-experience" data-location={town} data-compact={compact} data-time={time} data-ready={ready} data-revision={revision}>
 <iframe className="animation-world shared-scene" ref={frame} title={`${stop.name} existing animation`} src={`${scenePages[town]}?sceneOnly=1`} onLoad={()=>{if(frame.current?.contentDocument)concealSceneChrome(frame.current.contentDocument);refresh(r=>r+1);}} allow="autoplay; fullscreen"/>
 <header><Link to="/">Shosholoza Trail</Link><div className="animation-header-actions"><nav aria-label="Experience view"><span aria-current="page">3D animation</span></nav><Link to="/chapters" className="animation-back">All chapters</Link></div></header>
 <section className="animation-title"><p>{stop.name.toUpperCase()} / WORLD PREVIEW</p><h1>A journey built in 3D.</h1><span>{stop.tagline}</span></section>
 <button className="journey-chrome-toggle" onClick={()=>setCompact(!compact)}>{compact?'Show journey controls':'Hide panels'}</button>
 <section className="station-visit shared-place" aria-label="Place along the line"><span>{String(index+1).padStart(2,'0')} / A PLACE ALONG THE LINE</span><h2>{controls?.title||stop.name}</h2><p>{controls?.body||stop.teaser}</p><button onClick={()=>setGuide(true)}>Explore this location</button><small>{['matjiesfontein','worcester'].includes(town)?'Illustrative draft · compressed surroundings':'Existing chapter · landmark approximations'}</small></section>
 {!ready&&<p className="animation-loading" role="status">{controls?.error||`Loading ${stop.name} scene…`}</p>}
 <section className="animation-controls" aria-label="Animation controls">
 <div className="animation-views">{['Alongside','Behind the train','Wide view','Window view'].map((label,i)=><button key={label} aria-pressed={view===['side','follow','wide','window'][i]} disabled={!ready||!controls?.cameras[i]} title={!controls?.cameras[i]?'This scene does not yet provide this camera':undefined} onClick={()=>{action(controls?.cameras[i]);setView(['side','follow','wide','window'][i]);}}>{label}</button>)}</div>
 <div className="animation-times">{['Dawn','Midday','Dusk','Night'].map((label,i)=><button key={label} aria-pressed={time===['dawn','day','dusk','night'][i]} disabled={!ready||(!controls?.times[i]&&!controls?.timeSelect)} onClick={()=>{const key=['dawn','day','dusk','night'][i];if(controls?.timeSelect)controls.change(controls.timeSelect,key);else action(controls?.times[i]);setTime(key);}}>{label}</button>)}</div>
 <div className="animation-play"><button disabled={!ready||!controls?.run||controls.run.disabled&&!/Running/i.test(controls.run.textContent??'')} onClick={play}>{playbackLabel}</button><label>{controls?.range?'Journey position':'Scene-directed sequence'}<input aria-label="Animation route position" type="range" min={controls?.range?.min||0} max={controls?.range?.max||100} step={controls?.range?.step||1} value={controls?.range?.value||0} disabled={!ready||!controls?.range} onChange={e=>{if(controls?.range)controls.change(controls.range,e.target.value);}}/></label><output>{controls?.range?Number(controls.range.value).toFixed(1):`${index+1} / 8`}</output></div>
 <button className="journey-guide-toggle" aria-expanded={guide} onClick={()=>setGuide(!guide)}>Journey guide &amp; settings</button>
 <div className="shared-town-nav"><Link aria-disabled={index===0} to={`/experience/${STOPS[Math.max(0,index-1)].id}`}>Previous town</Link><label>Town <select aria-label="Animated town" value={town} onChange={e=>location.assign('/experience/'+e.target.value)}>{STOPS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><Link aria-disabled={index===7} to={`/experience/${STOPS[Math.min(7,index+1)].id}`}>Next town</Link></div>
 <JourneyFlow town={town} frame={frame} ready={ready} onGuide={()=>setGuide(true)}/><small><span>{controls?.status||'Drag to explore / scroll to move closer'}</span><span>{index+1} / 8 locations</span></small>
 </section>
 <aside className="journey-guide-panel" aria-label="Journey guide" hidden={!guide}><header><div><small>{stop.name} chapter</small><h2>Journey guide &amp; settings</h2></div><button onClick={()=>setGuide(false)}>Close</button></header><p>{stop.teaser}</p>{controls?.error&&<p role="alert">{controls.error}</p>}<p>Scene activities</p><div className="shared-activities">{controls?.actions.map((b,i)=><button key={i} disabled={b.disabled} onClick={()=>{action(b);setNotice(b.textContent??'');}}>{b.textContent}</button>)}</div>{selections.map((s,i)=><label key={i}>{s.getAttribute('aria-label')||'Scene setting'}<select value={s.value} onChange={e=>controls?.change(s,e.target.value)}>{Array.from(s.options).map(o=><option key={o.value} value={o.value}>{o.text}</option>)}</select></label>)}<p role="status">{notice}</p><small>Unavailable controls stay in place and are disabled. Each town retains its existing scene capabilities.</small></aside>
 </main>;
}
