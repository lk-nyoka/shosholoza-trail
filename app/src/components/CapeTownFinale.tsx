import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createFinaleRuntime, initialFinaleState } from '../capetown/FinaleRuntime';
import './CapeTownFinale.css';

export function CapeTownFinale() {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Awaited<ReturnType<typeof createFinaleRuntime>> | null>(null);
  const [state, setState] = useState(initialFinaleState);
  const [ready, setReady] = useState(false);
  const [audio, setAudio] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (state.panorama.length || state.error || !state.running) setCollapsed(false); }, [state.panorama.length, state.error, state.running]);
  useEffect(() => { setSaved(false); }, [state.phase]);
  useEffect(() => {
    const abort = new AbortController();
    createFinaleRuntime(host.current!, abort.signal, setState).then(value => {
      if (abort.signal.aborted) { value.dispose(); return; }
      runtime.current = value; setReady(true);
    }).catch(error => { if (!abort.signal.aborted) setState(s => ({ ...s, error: String(error) })); });
    return () => { abort.abort(); runtime.current?.dispose(); runtime.current = null; };
  }, []);
  return <main className="cape-finale journey-chapter" data-location="cape-town">
    <div ref={host} className="cape-world" aria-label="Animated Cape Town landscape" />
    <header className="chapter-header"><Link to="/destinations">← Destinations</Link><h1>Cape Town</h1><span>THE FINAL CHAPTER</span></header>
    <section className={`cape-card chapter-context${collapsed ? ' is-collapsed' : ''}`} aria-label="Chapter story">
      <button className="cape-collapse" aria-expanded={!collapsed} aria-controls="cape-content" onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show controls' : 'More scenery'}</button>
      <small>{state.paused ? 'PAUSED' : state.panorama.length ? 'SUMMIT EXPLORATION' : state.phase.replaceAll('_', ' ')}</small>
      <h1>{state.title}</h1><div id="cape-content" hidden={collapsed}><p aria-live="polite">{state.body}</p>
      {state.error && <p role="alert">{state.error}</p>}
      {!ready && !state.error && <p>Preparing the train and landscape…</p>}
      {state.panorama.length > 0 && <div className="cape-panorama"><p>Drag to explore the view, or choose a landmark.</p>{state.panorama.map(point => <button key={point.id} onClick={() => void runtime.current?.discover(point)}>{point.label}</button>)}<button onClick={() => runtime.current?.continue()}>Continue to the harbour →</button></div>}
      {state.phase === 'CABLEWAY_ASCENT' && <progress max={1} value={Math.max(0, Math.min(1, (state.progress - .4) / .2))} aria-label="Cableway ascent"/>}
      {state.memories.length > 0 && <details><summary>{state.memories.length} saved memories{state.complete ? ' · Passport earned' : ''}</summary><ul>{state.memories.map(memory => <li key={memory}>{memory.replace(/^photo-/, 'Saved view: ').replace(/^discovered-/, 'Discovered: ').replaceAll('-', ' ').replaceAll('_', ' ')}</li>)}</ul></details>}
      </div>
    </section>
    <section className="chapter-controls cape-actions" aria-label="Cape Town chapter controls">
      {!state.running ? <button disabled={!ready} onClick={() => void runtime.current?.run()}>{state.complete ? 'Replay chapter' : 'Begin the finale'}</button> : <><button onClick={() => runtime.current?.pause()}>{state.paused ? 'Resume' : 'Pause'}</button><button onClick={() => runtime.current?.cancel()}>Stop</button></>}
      <button disabled={!ready} onClick={async () => { await runtime.current?.capture(); setSaved(true); }} aria-label="Save this moment">{saved ? 'Moment saved' : 'Save this moment'}</button>
      <button disabled={!ready} aria-pressed={audio} onClick={async () => { await runtime.current?.sound(!audio); setAudio(!audio); }}>Train sound {audio ? 'on' : 'off'}</button>
      <span role="status">{state.paused ? 'Paused' : state.phase.replaceAll('_', ' ')}</span>
    </section>
    <footer>Procedural scenery study · Landmarks and cableway are approximations · Railway: © OpenStreetMap contributors</footer>
  </main>;
}
