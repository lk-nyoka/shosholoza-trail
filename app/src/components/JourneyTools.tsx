import { useState } from 'react';
import type { LandmarkDefinition } from '../animation/JourneyDirector';
export function JourneyTools({open, locationName, landmarks, distance, end, travelled, activeSeconds, completed, reduced, quality, setQuality, restart, seek, playLandmark, close}: {
  open:boolean; locationName:string; landmarks: LandmarkDefinition[]; distance:number; end:number; travelled:number; activeSeconds:number; completed:string[]; reduced:boolean; quality:'light'|'balanced'; setQuality:(v:'light'|'balanced')=>void; restart:()=>void; seek:(v:number)=>void; playLandmark:(id:string)=>void; close:()=>void;
}) {
  const [notice,setNotice]=useState('');
  const [link,setLink]=useState('');
  async function share() {
    const url=new URL(location.href);url.search='';url.searchParams.set('position',String(Math.round(distance)));
    setLink(url.href);
    try {await navigator.clipboard.writeText(url.href);setNotice('Link copied. It opens paused at this route position.');}
    catch {setNotice('Copy the route link below. It opens paused.');}
  }
  async function fullscreen() {
    try {if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.animation-ride')?.requestFullscreen();}
    catch {setNotice('Fullscreen is unavailable in this browser.');}
  }
  return <aside className="journey-guide-panel" aria-label={`${locationName} journey guide`} hidden={!open}>
    <header><div><small>{locationName} chapter</small><h2>Journey guide &amp; settings</h2></div><button className="journey-guide-close" onClick={close} aria-label="Close journey guide">Close</button></header>
    <div className="journey-actions"><button onClick={restart}>Restart at {locationName}</button><button onClick={share}>Copy this route position</button><button onClick={fullscreen}>Toggle fullscreen</button>
    <label>Graphics <select value={quality} onChange={e=>setQuality(e.target.value as 'light'|'balanced')}><option value="balanced">Balanced</option><option value="light">Light (fewer shadows)</option></select></label></div>
    {link && <label className="journey-share">Route link<input readOnly value={link} onFocus={e=>e.target.select()} /></label>}
    <p role="status">{notice}</p>
    <h3>Explore the landmarks</h3><p>Authored 3D studies using the existing local assets. Choose a section of rail, or play a landmark sequence.</p>
    {landmarks.length===0 && <p>No landmark studies loaded. The route remains available.</p>}
    <div className="journey-landmarks">{landmarks.map(item=><article key={item.id}><h4>{item.name}</h4><p>{item.tourism.body}</p><small>{item.tourism.credit}</small><div><button onClick={()=>seek(Math.min(end,Math.max(0,item.alongMetres)))}>Go to nearby rail</button><button disabled={reduced} onClick={()=>{close();playLandmark(item.id);}}>Explore {item.name}</button></div>{reduced && <small>Motion reduced: read the story or inspect the rail position.</small>}</article>)}</div>
    <h3>This session</h3><dl className="journey-recap"><div><dt>Route position</dt><dd>{(distance/1000).toFixed(2)} / {(end/1000).toFixed(2)} km</dd></div><div><dt>Simulated train travel</dt><dd>{(travelled/1000).toFixed(2)} km</dd></div><div><dt>Moving time</dt><dd>{Math.floor(activeSeconds/60)}m {Math.floor(activeSeconds%60)}s</dd></div><div><dt>Sequences completed</dt><dd>{completed.length} / {landmarks.length}</dd></div></dl>
    {completed.length>0 && <ul>{landmarks.filter(l=>completed.includes(l.id)).map(l=><li key={l.id}>{l.name}</li>)}</ul>}
    <small>Slider jumps do not count as train travel. These are virtual activities, not physical visits. Restart keeps this session summary.</small>
  </aside>;
}
