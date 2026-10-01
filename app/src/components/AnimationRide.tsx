import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createRailScene } from '../animation/RailScene';
import type { DirectorState, LandmarkDefinition } from '../animation/JourneyDirector';
import { AnimationDebug, useDebugMode } from './AnimationDebug';
import { TIME_ORDER, TIME_PRESETS, type TimeKey } from '../animation/TimeOfDay';
import { markChapterComplete } from '../journey/passport';
import type { Place } from '../animation/Waypoints';
import './animation-ride.css';
import { JourneyTools } from './JourneyTools';
import { PREFERENCES_KEY, readJourneyPreferences, routePositionFromSearch } from '../animation/JourneyPreferences';
import { SavedAnimationPlaces } from './SavedAnimationPlaces';
import './city-navigation.css';

export function AnimationRide(){const {town}=useParams();return <AnimationRideScene key={town??"pretoria"}/>;}
function AnimationRideScene() {
  const {town}=useParams();
  const draftTown=town==='matjiesfontein'||town==='worcester'?town:null;
  const locationId=draftTown??'pretoria', locationName=draftTown==='matjiesfontein'?'Matjiesfontein':draftTown==='worcester'?'Worcester':'Pretoria';
  const createScene:typeof createRailScene=draftTown?async(host,signal,report,visit)=>{const {createMissingTownScene}=await import('../animation/MissingTownScene');return createMissingTownScene(draftTown,host,signal,report,visit??(()=>{}));}:createRailScene;
  const [preferences] = useState(() => { try { return readJourneyPreferences(localStorage.getItem(PREFERENCES_KEY)); } catch { return readJourneyPreferences(null); } });
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Awaited<ReturnType<typeof createRailScene>>>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [playing, setPlaying] = useState(false), [distance, setDistance] = useState(0), [fps, setFps] = useState(0), [view, setView] = useState<'side' | 'follow' | 'wide' | 'window'>(preferences.view);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality,setQuality] = useState<'light'|'balanced'>(preferences.quality);
  const [telemetry,setTelemetry] = useState({speedKph:0,playing:false,travelled:0,activeSeconds:0,completedLandmarks:[] as string[]});
  const [compact,setCompact] = useState(false);
  const [guideOpen,setGuideOpen] = useState(false);
  const [visitLabel, setVisitLabel] = useState<string | null>(null), [visitPaused, setVisitPaused] = useState(false);
  const [journey, setJourney] = useState<{ mode: DirectorState['mode']; landmark: LandmarkDefinition | null }>({ mode: 'follow', landmark: null });
  const [landmarks, setLandmarks] = useState<LandmarkDefinition[]>([]);
  const [landmarkPaused, setLandmarkPaused] = useState(false);
  // How far the journey runs, reported by the scene once it is built.
  const [journeyEnd, setJourneyEnd] = useState(5000);
  const [time, setTime] = useState<TimeKey>(preferences.time);
  const [windowLabels, setWindowLabels] = useState(preferences.labels);
  const [windowSide, setWindowSide] = useState<-1 | 1>(preferences.side);
  const [sound, setSound] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [passing, setPassing] = useState<Place | null>(null);
  const [routePlaces, setRoutePlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const debug = useDebugMode();
  useEffect(() => {
    const element = host.current;
    const select = (event: Event) => setSelectedPlace((event as CustomEvent<Place>).detail);
    element?.addEventListener('window-place-selected', select);
    return () => element?.removeEventListener('window-place-selected', select);
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let cleanup: (() => void) | undefined;
    void createScene(host.current!, abort.signal, (s, f) => { setDistance(s); setFps(f); const live = engine.current?.telemetry; if (live) { setTelemetry(live); setPlaying(live.playing); } const end = Number(host.current?.dataset.journeyEnd ?? 0); if (end) setJourneyEnd(end); if (end && s >= end) { setPlaying(false); if(!draftTown)markChapterComplete('pretoria'); } }, label => { setVisitLabel(label); if (!label) setVisitPaused(false); }, state => {
      setJourney(state);
      if (state.mode === 'follow') setLandmarkPaused(false);
      if (state.landmark) setLandmarks(list => list.some(item => item.id === state.landmark!.id) ? list : [...list, state.landmark!]);
    }, place => setPassing(place)).then(scene => {
      // Only an abort returns nothing; anything else falsy means the scene
      // failed to build, and the page must say so rather than load forever.
      if (!scene) { if (!abort.signal.aborted) setError('The 3D scene could not be started on this device.'); return; }
      if (abort.signal.aborted) { scene.dispose(); return; }
      engine.current = scene; setRoutePlaces(scene.places); setLandmarks(scene.landmarks); setJourneyEnd(scene.journeyEnd);
      scene.setTime(preferences.time); scene.setQuality(preferences.quality); scene.windowSide(preferences.side); scene.setWindowLabels(preferences.labels); scene.view(preferences.view);
      const position=routePositionFromSearch(location.search,scene.journeyEnd);if(position!==null)scene.seek(position);
      cleanup = scene.dispose; setReady(true);
    }).catch(e => { if (!abort.signal.aborted) setError(String(e)); });
    return () => { abort.abort(); cleanup?.(); engine.current = null; };
  }, []);
  useEffect(() => {
    const query=matchMedia('(prefers-reduced-motion: reduce)');
    const change=()=>{setReduced(query.matches);if(query.matches){engine.current?.play(false);setPlaying(false);}};
    query.addEventListener('change',change);return()=>query.removeEventListener('change',change);
  },[]);
  useEffect(() => { try { localStorage.setItem(PREFERENCES_KEY,JSON.stringify({view,time,quality,side:windowSide,labels:windowLabels})); } catch {} },[view,time,quality,windowSide,windowLabels]);
  useEffect(()=>{
    const main=host.current?.parentElement, controls=main?.querySelector('.animation-controls');
    if(!main || !controls)return;
    const observer=new ResizeObserver(()=>main.style.setProperty('--journey-controls-height',`${controls.getBoundingClientRect().height}px`));
    observer.observe(controls);return()=>observer.disconnect();
  },[]);
  const seekTo=(value:number)=>{engine.current?.seek(value);setDistance(value);setPlaying(false);};
  const goBack=()=>{if(history.length>1)history.back();else location.assign('/');};
  const visiting = Boolean(journey.landmark);
  return <main className="animation-ride" data-location={locationId} data-compact={compact} data-window={view === 'window'} data-ready={ready} data-visiting={Boolean(visitLabel) || visiting} data-journey={journey.mode} data-debug={debug} data-time={time}>
    {!draftTown&&<div hidden id="pretoria-shared-actions"><button id="visit-union-buildings" disabled={!ready||reduced} onClick={()=>engine.current?.playLandmark('union-buildings')}>Visit Union Buildings</button><button id="return-pretoria-train" disabled={!ready||(!visiting&&!visitLabel)} onClick={()=>{if(visiting)engine.current?.skipLandmark();else engine.current?.returnToTrain();}}>Return to train</button><button id="pause-pretoria-landmark" disabled={!visiting} onClick={()=>{const next=!landmarkPaused;engine.current?.pauseLandmark(next);setLandmarkPaused(next);}}>{landmarkPaused?'Resume landmark':'Pause landmark'}</button></div>}
    <div className="animation-world" ref={host} role="group" aria-label={`Three-dimensional animation at ${locationName}`} />
    <header><Link to="/">Shosholoza Trail</Link><div className="animation-header-actions"><nav aria-label="Experience view"><span aria-current="page">3D animation</span></nav><button type="button" className="animation-back" onClick={goBack}><ArrowLeft aria-hidden="true" /> Back</button></div></header>
    <section className="animation-title"><p>{locationName.toUpperCase()} / WORLD PREVIEW</p><h1>A journey built in 3D.</h1><span>{draftTown?'Local landmark draft. A moving train. Room to look around.':'Jacaranda colours. A moving train. Room to look around.'}</span></section>
    {!ready && <div className="animation-loading" role={error ? 'alert' : 'status'}>{error || 'Loading local train models…'}</div>}
    {ready && !guideOpen && journey.landmark && <section className="station-visit landmark-visit" aria-label={journey.landmark.name} role="status">
      <span>{journey.landmark.tourism.eyebrow}</span><h2>{journey.landmark.tourism.title}</h2>
      <p>{journey.landmark.tourism.body}</p>
      <div>
        {!reduced && <button onClick={() => { const next = !landmarkPaused; engine.current?.pauseLandmark(next); setLandmarkPaused(next); }}>{landmarkPaused ? 'Resume' : 'Pause'}</button>}
        <button onClick={() => engine.current?.skipLandmark()}>Back to the train</button>
      </div>
      <small>{journey.landmark.tourism.credit}</small>
    </section>}
    {ready && !guideOpen && !journey.landmark && <section className="station-visit" aria-label="Station visit">
      <span>01 / A PLACE ALONG THE LINE</span><h2>{draftTown==='matjiesfontein'?'The railway village':draftTown==='worcester'?'The Hex River valley':'The departure platform'}</h2>
      <p>{visitLabel ?? (draftTown?'Explore this illustrative 3D landmark study.':'Step off the train view and explore the 3D station study.')}</p>
      <div>{visitLabel ? <>
        {!draftTown && !reduced && <button onClick={() => { engine.current?.pauseVisit(!visitPaused); setVisitPaused(!visitPaused); }}>{visitPaused ? 'Resume visit' : 'Pause visit'}</button>}
        <button onClick={() => engine.current?.returnToTrain()}>Return to train</button>
      </> : <button onClick={() => { setVisitPaused(false); engine.current?.visitStation(); }}>{draftTown?'Explore landmark':reduced ? 'View station' : 'Visit station'}</button>}</div>
      <small>Approximate architecture · newly authored camera study</small>
    </section>}
    <aside className="animation-caption"><strong>{locationName} {draftTown?'draft study':'departure study'}</strong><p>{draftTown?'Simplified scenery and compressed surroundings; not surveyed geometry.':'Real mapped track · real OpenStreetMap building footprints · supplied CC0 train models · simplified station, trees and overhead line.'}</p><small>{draftTown?'Draft scenery fills this previously empty chapter. Detailed reconstruction remains to be done.':'Buildings are real footprints at estimated heights. The station and landmarks are visual approximations, not reconstructions. Map data © OpenStreetMap contributors (ODbL). No satellite tiles or photographic billboards.'}</small></aside>
    {debug && ready && <AnimationDebug distance={distance} fps={fps} mode={journey.mode} landmark={journey.landmark} landmarks={landmarks} controls={{
      seek: metres => { engine.current?.seek(metres); setDistance(metres); setPlaying(false); },
      view: value => { setView(value); engine.current?.view(value); },
      playLandmark: id => engine.current?.playLandmark(id),
      skipLandmark: () => engine.current?.skipLandmark(),
      setTime: key => { setTime(key); engine.current?.setTime(key); },
    }} />}
    {/* A landmark owns the frame while its cinematic plays; the passing card
        would otherwise repeat it, then switch to the next place mid-shot. */}
    {ready && passing && view !== 'window' && !journey.landmark && <aside className="animation-passing" role="status">
      <span>{passing.kind}</span><strong>{passing.name}</strong>
      <small>{passing.offsetMetres} m from the line · OpenStreetMap</small>
    </aside>}
    {ready && <div hidden={visiting || !!visitLabel || compact}><SavedAnimationPlaces routePlaces={routePlaces} onSeek={seekTo} onSelect={setSelectedPlace} current={selectedPlace ?? passing} selected={!!selectedPlace} clearSelection={() => setSelectedPlace(null)} /></div>}
    {ready && <button className="journey-chrome-toggle" onClick={()=>setCompact(!compact)}>{compact ? 'Show journey controls' : 'Hide panels'}</button>}
    <section className="animation-controls" aria-label="Animation controls" inert={journey.mode !== 'follow' || undefined}>
      <div className="animation-views">{(['side', 'follow', 'wide', 'window'] as const).map(v => <button disabled={!ready} aria-pressed={view === v} key={v} onClick={() => { setView(v); engine.current?.view(v); }}>{v === 'side' ? 'Alongside' : v === 'follow' ? 'Behind the train' : v === 'window' ? 'Window view' : 'Wide view'}</button>)}</div>
      {view === 'window' && <div role="group" aria-label="Passenger window side" className="animation-views">
        {([-1, 1] as const).map(side => <button key={side} aria-pressed={windowSide === side} onClick={() => { setWindowSide(side); engine.current?.windowSide(side); }}>{side === -1 ? 'Left window' : 'Right window'}</button>)}
        <button disabled={!!draftTown} aria-pressed={windowLabels} onClick={() => { setWindowLabels(!windowLabels); engine.current?.setWindowLabels(!windowLabels); }}>{windowLabels ? 'Place labels on' : 'Place labels off'}</button>
      </div>}
      <div className="animation-times" role="group" aria-label="Time of day">
        <button className="animation-sound" disabled={!ready} aria-pressed={sound} onClick={() => { const next = !sound; setSound(next); void engine.current?.setSound(next).catch(() => { setSound(false); setAudioError('Train audio could not load. Try Sound again.'); }); setAudioError(''); }}>{sound ? '♪ Sound on' : '♪ Sound off'}</button>{TIME_ORDER.map(key => <button disabled={!ready} aria-pressed={time === key} key={key} onClick={() => { setTime(key); engine.current?.setTime(key); }}>{TIME_PRESETS[key].label}</button>)}</div>
      {audioError && <p role="status">{audioError}</p>}
      <div className="animation-play"><button disabled={!ready || reduced || distance >= journeyEnd} onClick={() => { engine.current?.play(!playing); setPlaying(!playing); }}>{playing ? 'Pause journey' : 'Start journey'}</button><label>{draftTown?'Compressed draft':'Explore the first'} {(journeyEnd / 1000).toFixed(1)} km<input aria-label="Animation route position" type="range" min="0" max={journeyEnd} step="10" value={distance} disabled={!ready} onChange={e => { engine.current?.seek(Number(e.target.value)); setPlaying(false); }} /></label><output>{(distance / 1000).toFixed(2)} km</output></div>
      <button className="journey-guide-toggle" aria-expanded={guideOpen} onClick={()=>setGuideOpen(value=>!value)}>Journey guide &amp; settings</button>
      <small>{reduced ? 'Reduced motion: use the position slider.' : view === 'window' ? 'Drag or focus the scene and use arrow keys to look; Home resets. Exterior viewpoint; coach interior not modelled.' : 'Drag to orbit / scroll to move closer'} <span>{fps} fps / local assets</span></small>
    </section>
    <JourneyTools open={guideOpen} locationName={locationName} landmarks={landmarks} distance={distance} end={journeyEnd} travelled={telemetry.travelled} activeSeconds={telemetry.activeSeconds} completed={telemetry.completedLandmarks} reduced={reduced} quality={quality} setQuality={value=>{setQuality(value);engine.current?.setQuality(value);}} restart={()=>seekTo(0)} seek={seekTo} playLandmark={id=>engine.current?.playLandmark(id)} close={()=>setGuideOpen(false)} />
  </main>;
}
