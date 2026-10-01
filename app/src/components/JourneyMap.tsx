import { useEffect, useRef, useState } from 'react';
import maplibregl, { ensureMapLibre } from '../vendor/maplibre';
import { STOPS } from '../data';
import { coordinateAtDistance, cumulativeDistances, readRideRoute, type Coordinate } from '../ride-model';
import type { FoundPlace } from './PlaceSearch';

type Position = { lon: number; lat: number };
type MapController = {
  addStyleControl(): HTMLElement;
  destroy(): void;
  fitRoute(options?: Record<string, unknown>): void;
  setFollow(value: boolean): boolean;
  setRouteProgress(metres: number, options?: Record<string, unknown>): unknown;
  selectPlace(place: FoundPlace): boolean;
  updatePosition(position: Position & { s: number; source: string }, movement?: Record<string, unknown>): void;
};
type ImmersiveModule = {
  createImmersiveMap(options: Record<string, unknown>): MapController;
  haversineMetres(a: [number, number], b: [number, number]): number;
};

let mapConfigPromise: Promise<Record<string, unknown>> | null = null;
function loadMapConfig(): Promise<Record<string, unknown>> {
  if (!mapConfigPromise) {
    mapConfigPromise = fetch('/api/map-config', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async response => {
        const result = await response.json() as Record<string, unknown>;
        if (!response.ok) throw new Error(String(result.reason || result.error || 'Map configuration unavailable'));
        return result;
      })
      .catch(() => ({ provider: 'esri' }));
  }
  return mapConfigPromise;
}

export function JourneyMap({ progress, focus, onSelect, corridor = false, selectedPlace }: {
  corridor?: boolean;
  progress: number;
  current: number;
  next: number;
  focus: boolean;
  /** A searched place or selected stop to outline, label and fly to. */
  selectedPlace?: FoundPlace | null;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // The map fits the whole route once it loads, which would undo an earlier flight.
  const readyRef = useRef(false);
  const controllerRef = useRef<MapController | null>(null);
  const distanceRef = useRef(0);
  const coordinatesRef = useRef<Coordinate[]>(STOPS.map(stop => [stop.lon, stop.lat]));
  const cumulativeRef = useRef(cumulativeDistances(coordinatesRef.current));
  const progressRef = useRef(progress);
  const focusRef = useRef(focus);
  const onSelectRef = useRef(onSelect);
  progressRef.current = progress;
  focusRef.current = focus;
  onSelectRef.current = onSelect;
  const [status, setStatus] = useState('Loading geographic map...');
  const [routeSource, setRouteSource] = useState('Loading mapped rail geometry...');

  // Outline a searched place, a "See on map" destination, or a clicked stop.
  useEffect(() => {
    if (!selectedPlace) return;
    let cancelled = false;
    const select = () => {
      const controller = controllerRef.current;
      if (cancelled) return;
      if (!controller || !readyRef.current) { setTimeout(select, 250); return; }
      controller.selectPlace(selectedPlace);
    };
    select();
    return () => { cancelled = true; };
  }, [selectedPlace]);

  useEffect(() => {
    let cancelled = false;
    const moduleUrl = '/map/immersive-map.js';
    void Promise.all([
      import(/* @vite-ignore */ moduleUrl) as Promise<ImmersiveModule>,
      loadMapConfig(),
      fetch(corridor ? '/data/route-gauteng.geojson' : '/data/route.geojson', { cache: 'no-store', headers: { Accept: 'application/geo+json, application/json' } })
        .then(async response => {
          if (!response.ok) throw new Error('overview-route-unavailable');
          return readRideRoute(await response.json());
        })
        .catch(() => null),
      ensureMapLibre(),
    ]).then(([module, mapConfig, verifiedRoute]) => {
      if (cancelled || !canvasRef.current || !controlsRef.current) return;
      if (corridor && !verifiedRoute) throw new Error('Corridor geometry unavailable');
      const coordinates = verifiedRoute?.geometry.coordinates
        ?? STOPS.map(stop => [stop.lon, stop.lat] as Coordinate);
      const lengthMetres = coordinates.slice(1).reduce(
        (sum, point, index) => sum + module.haversineMetres(coordinates[index], point), 0,
      );
      distanceRef.current = lengthMetres;
      coordinatesRef.current = coordinates;
      cumulativeRef.current = cumulativeDistances(coordinates);
      setRouteSource(verifiedRoute
        ? `Mapped rail geometry / ${String(verifiedRoute.properties.confidence ?? 'verified').replaceAll('-', ' ')}`
        : 'Station-connector fallback / mapped rail overview unavailable');
      const controller = module.createImmersiveMap({
        maplibre: maplibregl,
        container: canvasRef.current,
        controlsContainer: controlsRef.current,
        route: verifiedRoute ?? {
          type: 'Feature',
          properties: { lengthMetres, confidence: 'unresolved', geometryType: 'schematic-station-connectors' },
          geometry: { type: 'LineString', coordinates },
        },
        hubs: (corridor ? STOPS.slice(0, 2) : STOPS).map((stop, index) => ({ ...stop, hubId: stop.id, index })),
        initialStyle: 'satellite',
        follow: focusRef.current,
        cinematic: true,
        trueSatellite: corridor,
        mapConfig,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onHubSelect: (hub: { index: number }) => onSelectRef.current(hub.index),
        onStatus: ({ status: nextStatus }: { status: string }) => {
          if (cancelled) return;
          if (nextStatus === 'ready' || nextStatus === 'style-ready') { setStatus(''); readyRef.current = true; if (corridor && !focusRef.current) controllerRef.current?.fitRoute({ duration: 0, maxZoom: 10 }); }
          else if (nextStatus === 'provider-fallback') setStatus('Map provider unavailable; keyless fallback loaded.');
        },
      });
      controllerRef.current = controller;
      controller.addStyleControl();
      const distance = progressRef.current * lengthMetres;
      const position = coordinateAtDistance(coordinatesRef.current, cumulativeRef.current, distance);
      controller.setRouteProgress(distance, { animate: false });
      controller.updatePosition({ lon: position[0], lat: position[1], s: distance, source: 'replay' }, { duration: 0 });
      if (!focusRef.current) controller.fitRoute({ duration: 0, maxZoom: corridor ? 10 : 6 });
    }).catch(() => {
      if (!cancelled) setStatus('The geographic map could not load. Open the journey engine for its offline route.');
    });
    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [corridor]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !distanceRef.current) return;
    const distance = progress * distanceRef.current;
    const position = coordinateAtDistance(coordinatesRef.current, cumulativeRef.current, distance);
    controller.setRouteProgress(distance);
    // The map camera follows the train's rendered position frame by frame.
    // Supplying a competing ease duration here made fast playback chase stale
    // targets and eventually let the train leave the viewport.
    controller.updatePosition({ lon: position[0], lat: position[1], s: distance, source: 'replay' }, { zoom: 7.2 });
  }, [progress]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setFollow(focus);
    if (!focus) controller.fitRoute({ duration: 900 });
  }, [focus]);

  return <div className="journey-map real-journey-map">
    <div ref={canvasRef} className="journey-map-canvas" aria-label={corridor ? 'Interactive Pretoria to Johannesburg corridor map' : 'Interactive Pretoria to Cape Town story map'} />
    <div ref={controlsRef} className="react-map-controls" />
    <p className="journey-map-provenance" data-testid="journey-route-source">{routeSource}</p>
    {status && <p className="journey-map-loading" role="status">{status}</p>}
  </div>;
}
