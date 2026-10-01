import { useEffect, useRef, useState } from 'react';
import type { Place } from '../animation/Waypoints';
import { readSavedPlaces, itineraryText, itineraryGeoJSON, savePlace, placeKey, STORAGE_KEY } from '../animation/SavedPlaces';

export function SavedAnimationPlaces({ current, selected = false, clearSelection, routePlaces = [], onSelect, onSeek }: { onSeek?: (distance: number) => void; routePlaces?: Place[]; onSelect?: (place: Place) => void; current: Place | null; selected?: boolean; clearSelection?: () => void }) {
  const [places, setPlaces] = useState<Place[]>(() => { try { return readSavedPlaces(localStorage.getItem(STORAGE_KEY)); } catch { return []; } });
  const [query,setQuery]=useState('');
  const [lastRemoved,setLastRemoved]=useState<Place | null>(null);
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY)setPlaces(readSavedPlaces(event.newValue));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const filteredRoute = routePlaces.filter(p=>`${p.name} ${p.kind}`.toLowerCase().includes(query.trim().toLowerCase()));
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (selected && panel.current) panel.current.open = true; }, [current, selected]);
  const [notice, setNotice] = useState('');
  function update(next: Place[]) {
    setPlaces(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setNotice('Saved on this device.'); }
    catch { setNotice('Available for this session only; device storage is unavailable.'); }
  }
  function download(geojson=false) {
    const url = URL.createObjectURL(new Blob([geojson ? JSON.stringify(itineraryGeoJSON(places),null,2) : itineraryText(places)], { type: geojson ? 'application/geo+json' : 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = geojson ? 'shosholoza-pretoria-saved-places.geojson' : 'shosholoza-pretoria-saved-places.txt';
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Itinerary download started.');
  }
  const saved = current && places.some(p => placeKey(p) === placeKey(current));
  return <details ref={panel} className="animation-saved">
    <summary>Saved places ({places.length})</summary>
    <p>Plan a future visit. Saving a place does not record a physical visit.</p>
    {selected && <p>Selected mapped place. <button onClick={clearSelection}>Follow passing places</button></p>}
    {current && <button disabled={!!saved} onClick={() => update(savePlace(places, current))}>{saved ? 'Place saved' : `Save ${current.name}`}</button>}
    {places.length > 0 && <button onClick={()=>download()}>Download itinerary</button>}
    {places.length > 0 && <button onClick={()=>download(true)}>Export map points (GeoJSON)</button>}
    {lastRemoved && <button onClick={()=>{update(savePlace(places,lastRemoved));setLastRemoved(null);}}>Undo remove {lastRemoved.name}</button>}
    {current && <button onClick={()=>onSeek?.(current.alongMetres)}>Preview nearby rail</button>}
    {routePlaces.length > 0 && <details className="animation-route-places">
      <summary>Places along this route ({routePlaces.length})</summary>
      <p>Mapped locations, including places hidden from the current window.</p>
      <label>Find a place<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name or type" /></label>
      {filteredRoute.length===0 && <p>No matching places.</p>}
      <ol>{filteredRoute.map(place => <li key={placeKey(place)}><button aria-pressed={current ? placeKey(current) === placeKey(place) : false} onClick={() => onSelect?.(place)}>{place.name}</button><small>{(place.alongMetres / 1000).toFixed(2)} km along the route / {place.kind}</small></li>)}</ol>
    </details>}
    {!current && <p>A Save button appears when you pass a named place.</p>}
    {places.length === 0 ? <p>No saved places yet.</p> : <ul>{places.map(place => <li key={placeKey(place)}>
      <strong>{place.name}</strong><small>{place.kind} / {place.offsetMetres} m from the line</small>
      <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`} target="_blank" rel="noreferrer">Open location map</a>
      <button aria-label={`Remove ${place.name}`} onClick={() => {setLastRemoved(place);update(places.filter(p => placeKey(p) !== placeKey(place)));}}>Remove</button>
    </li>)}</ul>}
    <small>Place data: OpenStreetMap contributors. The external map needs a connection.</small>
    <p role="status">{notice}</p>
  </details>;
}
