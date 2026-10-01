import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { JourneyMap } from './JourneyMap';
import './Corridor.css';
import { readCorridorProgress, saveCorridorProgress, corridorPhase } from '../animation/CorridorProgress';

export function Corridor() {
  const [initial] = useState(() => { try { return readCorridorProgress(localStorage, location.search); } catch { return { distance: 0, rate: 1 }; } });
  const host = useRef<HTMLDivElement>(null);
  const ride = useRef<{ seek(s: number): void; play(value: boolean): void; rate(value: number): void; follow(): void; sound(value: boolean): Promise<void>; dispose(): void } | null>(null);
  const [soundOn, setSoundOn] = useState(false), [soundError, setSoundError] = useState('');
  const [length, setLength] = useState(69537), [distance, setDistance] = useState(initial.distance), [speed, setSpeed] = useState(0);
  const [map, setMap] = useState(false), [playing, setPlaying] = useState(false), [rate, setRate] = useState(initial.rate);
  const [shareStatus, setShareStatus] = useState('');
  const [status, setStatus] = useState('Loading the local corridor…');
  const distanceRef = useRef(initial.distance), rateRef = useRef(rate), lastSave = useRef(0);
  rateRef.current = rate;
  function persist() { try { saveCorridorProgress(localStorage, { distance: distanceRef.current, rate: rateRef.current }); } catch { /* Storage unavailable. */ } }
  useEffect(() => { const save = () => persist(); window.addEventListener('pagehide', save); return () => { save(); window.removeEventListener('pagehide', save); }; }, []);
  useEffect(() => {
    if (map || !host.current) return;
    const container = host.current;
    const abort = new AbortController();
    const startingDistance = distanceRef.current;
    let local: typeof ride.current = null;
    setStatus('Loading the local corridor…');
    void import('../animation/CorridorScene').then(m => {
      if (abort.signal.aborted) throw new Error('View closed');
      return m.createCorridorScene(container, abort.signal, (s, end, active, velocity) => {
      if (abort.signal.aborted) return;
      distanceRef.current = s; setDistance(s); setLength(end);
      setPlaying(active); setSpeed(velocity);
      if (local && performance.now() - lastSave.current > 1500) { persist(); lastSave.current = performance.now(); }
    }); }).then(scene => {
      if (abort.signal.aborted) { scene.dispose(); return; }
      local = scene; ride.current = scene; scene.seek(startingDistance); scene.rate(rate); setStatus('');
    }).catch(() => { if (!abort.signal.aborted) setStatus('The corridor could not load. Switch to the map or reload to retry.'); });
    return () => { abort.abort(); local?.dispose(); ride.current = null; };
  }, [map]);
  function seek(s: number) { distanceRef.current = s; setDistance(s); ride.current?.seek(s); persist(); }
  async function share() {
    const url = new URL('/corridor', location.origin); url.searchParams.set('position', String(Math.round(distanceRef.current)));
    try { await navigator.clipboard.writeText(url.href); setShareStatus('Journey link copied'); }
    catch { setShareStatus(url.href); }
  }
  function switchView() { ride.current?.play(false); setPlaying(false); setSoundOn(false); setMap(!map); }
  return <main className="corridor-page">
    <header><Link to="/animation">← Pretoria</Link><strong>Pretoria → Johannesburg</strong><a href="/johannesburg.html">Explore Johannesburg →</a></header>
    <section className="corridor-world" aria-label="Connected rail corridor">
      {map ? <JourneyMap corridor progress={distance / length} current={0} next={1} focus={false} onSelect={index => seek(index ? length : 0)} /> : <div className="corridor-canvas" ref={host} />}
      {!map && status && <p className="corridor-status" role="status">{status}</p>}
      <aside><b>{corridorPhase(distance, length)}</b><span>{(distance / 1000).toFixed(1)} / {(length / 1000).toFixed(1)} km · {(speed * 3.6).toFixed(0)} km/h</span><span>Mapped rail candidate · simplified surroundings</span></aside>
      {distance >= length - .1 && <section className="corridor-arrival" aria-label="Johannesburg arrival"><small>JOURNEY COMPLETE</small><h2>Welcome to Park Station</h2><p>Your train has reached Johannesburg. Explore the station and city, or return to Pretoria.</p><a href="/johannesburg.html">Explore Johannesburg →</a><button onClick={() => seek(0)}>Return to Pretoria</button></section>}
    </section>
    <section className="corridor-controls" aria-label="Corridor journey controls">
      <button onClick={switchView}>{map ? '3D journey' : 'Route map'}</button>
      <button disabled={map || !!status} onClick={() => { if (distance >= length) seek(0); ride.current?.play(!playing); setPlaying(!playing); }}>{playing ? 'Pause' : 'Travel'}</button>
      <button disabled={map || !!status} aria-pressed={soundOn} onClick={async () => { const scene = ride.current; if (!scene) return; try { await scene.sound(!soundOn); if (ride.current === scene) { setSoundOn(!soundOn); setSoundError(''); } } catch { setSoundOn(false); setSoundError('Audio could not load. Try again.'); } }}>{soundOn ? 'Sound on' : 'Sound off'}</button>
      <button disabled={map || !!status} onClick={() => ride.current?.follow()}>Follow train</button>
      <label>Presentation speed <select value={rate} onChange={e => { const value = Number(e.target.value); setRate(value); ride.current?.rate(value); }}><option value={1}>1×</option><option value={4}>4×</option><option value={16}>16×</option></select></label>
      <label className="corridor-distance">Journey position <input aria-label="Corridor distance" type="range" min={0} max={length} step={10} value={distance} onChange={e => seek(Number(e.target.value))} /></label>
      <button onClick={() => seek(0)}>Pretoria</button><button onClick={() => seek(length)}>Park Station</button>
      <button onClick={share}>Share position</button>
    </section>
    {soundError && <p role="status" className="corridor-note">{soundError}</p>}
    {shareStatus && <p role="status" className="corridor-note">{shareStatus}</p>}
    <p className="corridor-note">One continuous local 3D route, with detailed city studies at either end. Intermediate scenery and level terrain are illustrative. The OSM railway candidate still needs operational route review; this is not a service timetable. The route map shows South Africa only.</p>
  </main>;
}
