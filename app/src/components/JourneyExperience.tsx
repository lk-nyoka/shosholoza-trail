import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Pause, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';
import { PlaceSearch, type FoundPlace } from './PlaceSearch';
import { STOPS, STOP_PROGRESS, TOTAL_KM, currentStopIndex, nextStopIndex } from '../data';
import { JourneyMap } from './JourneyMap';
import { DestinationPanel } from './DestinationPanel';

const stopPlace = (index: number): FoundPlace => {
  const stop = STOPS[index];
  return { name: stop.name, region: `${stop.province} · stop on the line`, kind: 'railway stop', lon: stop.lon, lat: stop.lat, zoom: 11, stop: true, stopId: stop.id };
};

type BoundaryFeature = { properties?: { id?: string }; bbox?: [number, number, number, number]; geometry?: FoundPlace['geometry'] };
let boundaryData: Promise<BoundaryFeature[]> | null = null;
function stopBoundary(id: string) {
  boundaryData ??= fetch('/data/location-boundaries.geojson', { headers: { Accept: 'application/geo+json, application/json' } })
    .then(async response => {
      if (!response.ok) throw new Error('Location boundaries unavailable');
      return ((await response.json()) as { features?: BoundaryFeature[] }).features ?? [];
    });
  return boundaryData.then(features => features.find(feature => feature.properties?.id === id));
}

export function JourneyExperience() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<FoundPlace | null>(null);
  const selectionRequest = useRef(0);
  const last = useRef<number | null>(null);
  const heading = useRef(1);

  async function showPlace(place: FoundPlace) {
    setPlaying(false);
    const request = ++selectionRequest.current;
    try {
      let resolved = place;
      if (resolved.stopId) {
        const boundary = await stopBoundary(resolved.stopId);
        if (selectionRequest.current !== request) return;
        if (boundary?.geometry) resolved = { ...resolved, geometry: boundary.geometry, bbox: boundary.bbox, kind: 'administrative boundary' };
        setSelectedPlace(resolved);
        return;
      }
      setSelectedPlace(resolved);
      if (!resolved.id || selectionRequest.current !== request) return;
      const response = await fetch(`/api/geocode?id=${encodeURIComponent(resolved.id)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const detail = await response.json() as Pick<FoundPlace, 'geometry' | 'bbox'>;
      if (selectionRequest.current === request) setSelectedPlace({ ...resolved, geometry: detail.geometry ?? null, bbox: detail.bbox ?? resolved.bbox });
    } catch {
      // Never invent a boundary. Keep the selected-place pin if exact polygon
      // data is unavailable, and clear any older outline via selectPlace().
      if (selectionRequest.current === request) setSelectedPlace(place);
    }
  }

  function showStop(index: number, openPanel = true) {
    setProgress(STOP_PROGRESS[index]);
    if (openPanel) setOpen(index);
    void showPlace(stopPlace(index));
  }

  // "See on map" arrives as ?stop=kimberley: fly there and mark it.
  useEffect(() => {
    const id = params.get('stop');
    if (!id) return;
    const index = STOPS.findIndex(stop => stop.id === id);
    if (index < 0) return;
    showStop(index, false);
    const next = new URLSearchParams(params);
    next.delete('stop');
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let frame = 0;
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const delta = now - last.current;
      last.current = now;
      setProgress(value => {
        const next = value + delta / 95000 * speed * heading.current;
        if (next >= 1) { heading.current = -1; return 1; }
        if (next <= 0) { heading.current = 1; return 0; }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate('/');
  const current = currentStopIndex(progress);
  const next = nextStopIndex(progress);

  return <div className="journey-screen">
    <JourneyMap progress={progress} current={current} next={next} focus={focus} selectedPlace={selectedPlace} onSelect={index => showStop(index)} />
    <header className="journey-top">
      <div className="journey-top-left"><button className="glass journey-back" onClick={goBack} aria-label="Go back"><ArrowLeft />Back</button><Link to="/" className="brand"><span className="brand-mark">ST</span><span>Shosholoza Trail</span></Link></div>
      <div className="journey-top-right"><PlaceSearch onPick={place => void showPlace(place)} /><button className="glass" onClick={() => setFocus(!focus)}>{focus ? <Minimize2 /> : <Maximize2 />}{focus ? 'Whole route' : 'Follow train'}</button><Link className="glass" to="/destinations">All destinations</Link></div>
    </header>
    <footer className="playback"><button className="play" aria-label={playing ? 'Pause the journey' : 'Play the journey'} onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</button><div className="timeline"><input type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={event => setProgress(+event.target.value / 1000)} /><div className="track"><span style={{ width: progress * 100 + '%' }} /></div></div><div className="journey-readout"><b>{Math.round(progress * TOTAL_KM)} km</b><small>{Math.round(progress * 100)}%</small><div className="speed">{[1, 2, 4].map(value => <button className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)} key={value}>{value}×</button>)}</div></div></footer>
    {open !== null && <DestinationPanel stop={STOPS[open]} index={open} onClose={() => { setOpen(null); setPlaying(true); }} onJump={index => showStop(index)} />}
  </div>;
}
