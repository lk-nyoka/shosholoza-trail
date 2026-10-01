// Search South African places on the map.
//
// The eight stops are matched here, instantly and offline. Everything else
// goes to /api/geocode, which asks MapTiler from the Worker so the key never
// reaches the browser. If that is unavailable the stops still work.
import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { STOPS } from '../data';

export type PlaceGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
export type FoundPlace = { name: string; region: string | null; lon: number; lat: number; zoom?: number; stop?: boolean; stopId?: string; id?: string | null; kind?: string; bbox?: [number, number, number, number] | null; geometry?: PlaceGeometry | null };

const stopMatches = (query: string): FoundPlace[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return STOPS.filter(stop => stop.name.toLowerCase().includes(needle))
    .map(stop => ({ name: stop.name, region: `${stop.province} · stop on the line`, kind: 'railway stop', lon: stop.lon, lat: stop.lat, zoom: 11, stop: true, stopId: stop.id }));
};

export function PlaceSearch({ onPick }: { onPick: (place: FoundPlace) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<FoundPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const stops = stopMatches(trimmed);
    setPlaces(stops);
    if (trimmed.length < 2) { setBusy(false); setNote(''); return; }
    // Wait for a pause in typing before asking the server.
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json() as { places?: FoundPlace[] };
        const found = (data.places ?? []).filter(place => !stops.some(stop => stop.name.toLowerCase() === place.name.toLowerCase()));
        setPlaces([...stops, ...found]);
        setNote(stops.length + found.length ? '' : 'No places found.');
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setNote(stops.length ? '' : 'Place search is unavailable. The eight stops still work.');
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', away);
    addEventListener('keydown', escape);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', escape); };
  }, [open]);

  const pick = (place: FoundPlace) => { onPick(place); setOpen(false); setQuery(place.name); };

  return <div className="place-search" ref={box}>
    <label className="glass place-search-field">
      <Search aria-hidden="true" />
      <input
        type="search" value={query} placeholder="Search a place in South Africa"
        aria-label="Search a place in South Africa" aria-expanded={open && places.length > 0} aria-controls={listId}
        onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => { if (event.key === 'Enter' && places[0]) { event.preventDefault(); pick(places[0]); } }}
      />
      {busy && <Loader2 className="place-search-busy" aria-label="Searching" />}
      {query && !busy && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setPlaces([]); setNote(''); }}><X /></button>}
    </label>
    {open && (places.length > 0 || note) && <ul className="place-search-results" id={listId} role="listbox">
      {places.map(place => <li key={`${place.name}-${place.lon}-${place.lat}`}>
        <button type="button" onClick={() => pick(place)}>
          <strong>{place.name}</strong>
          {place.region && <small>{place.region}</small>}
        </button>
      </li>)}
      {note && <li className="place-search-note">{note}</li>}
      {places.some(place => !place.stop) && <li className="place-search-credit">Places © MapTiler · © OpenStreetMap contributors</li>}
    </ul>}
  </div>;
}
