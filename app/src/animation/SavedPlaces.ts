import type { Place } from './Waypoints.ts';
export const STORAGE_KEY = 'shosholoza.animation.saved-places.v1';
export const placeKey = (place: Place) => `${place.lon.toFixed(6)},${place.lat.toFixed(6)}:${place.name}`;
export function savePlace(places: Place[], place: Place): Place[] {
  return places.some(p => placeKey(p) === placeKey(place)) ? places : [...places, place].slice(-50);
}
export function readSavedPlaces(raw: string | null): Place[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((p): p is Place => !!p && typeof p === 'object' && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 200 && typeof p.kind === 'string' && p.kind.length <= 100 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180 && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.alongMetres) && Number.isFinite(p.offsetMetres) && Number.isFinite(p.side)).reduce<Place[]>((all, p) => savePlace(all, p), []);
  } catch { return []; }
}

/** Plain-text itinerary remains useful offline and contains no visit claims. */
export function itineraryText(places: Place[]): string {
  const ordered = [...places].sort((a, b) => a.alongMetres - b.alongMetres);
  return ['Shosholoza Trail - saved Pretoria places', 'Planned places, not a record of physical visits.', '', ...ordered.flatMap((p, i) => [`${i + 1}. ${p.name}`, `${p.kind} | ${(p.alongMetres / 1000).toFixed(2)} km along the route | ${p.offsetMetres} m from the line`, `Coordinates: ${p.lat}, ${p.lon}`, `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`, '']), 'Place data: OpenStreetMap contributors (ODbL).', 'External maps need a connection.'].join('\n');
}

export function itineraryGeoJSON(places: Place[]) {
  return { type: 'FeatureCollection', attribution: 'OpenStreetMap contributors (ODbL)', purpose: 'Saved plans, not physical visits', features: [...places].sort((a,b)=>a.alongMetres-b.alongMetres).map(p=>({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon,p.lat] }, properties: { name:p.name, kind:p.kind, alongMetres:p.alongMetres, offsetMetres:p.offsetMetres } })) };
}
