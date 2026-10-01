import { overviewConsist } from './overview-train.js';
const EARTH_RADIUS_METRES = 6371008.8;
const DEFAULT_CENTER = [23.31, -30.03];

const ATTRIBUTION = Object.freeze({
  osm: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  topo: 'Map style: <a href="https://opentopomap.org" target="_blank" rel="noopener">© OpenTopoMap</a>',
  eox: 'Imagery: <a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> (modified Copernicus Sentinel data 2025)',
  esri: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  eoxOverlay: 'Labels: <a href="https://maps.eox.at" target="_blank" rel="noopener">© EOX and MapServer</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
});

/**
 * The trail is South African, so imagery is too. Every tiled source carries
 * these bounds and MapLibre requests nothing outside them; beyond them the
 * style's own background stands in as a plain approximation of the rest of
 * the world. [west, south, east, north], mainland plus Lesotho and Eswatini.
 */
export const SOUTH_AFRICA_BOUNDS = Object.freeze([16.2, -35.2, 33.1, -22.0]);
/** How far the camera may wander past them: enough to frame the coast. */
const VIEW_BOUNDS = [[12.5, -38.5], [36.8, -19.0]];
const MIN_ZOOM = 4;

const BACKGROUNDS = Object.freeze({
  streets: '#d8ded5', outdoor: '#c9d7bc', satellite: '#101918', hybrid: '#101918', offline: '#102820',
});

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rad(value) { return value * Math.PI / 180; }
function deg(value) { return value * 180 / Math.PI; }

export function haversineMetres(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function bearingBetween(from, to) {
  const lon = rad(to[0] - from[0]), lat1 = rad(from[1]), lat2 = rad(to[1]);
  const y = Math.sin(lon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function smoothBearing(previous, next, factor = 0.28) {
  if (!Number.isFinite(previous)) return ((next % 360) + 360) % 360;
  const delta = ((next - previous + 540) % 360) - 180;
  return (previous + delta * clamp(factor, 0, 1) + 360) % 360;
}

export function sliceLineAtDistance(route, targetMetres) {
  const coordinates = route?.geometry?.coordinates ?? route?.coordinates ?? [];
  if (!coordinates.length) return [];
  if (coordinates.length === 1) return [coordinates[0]];
  const lengths = coordinates.slice(1).map((point, index) => haversineMetres(coordinates[index], point));
  const measuredTotal = lengths.reduce((sum, length) => sum + length, 0);
  const declaredTotal = Number(route?.properties?.lengthMetres) || measuredTotal || 1;
  const target = clamp(Number(targetMetres) || 0, 0, declaredTotal) / declaredTotal * measuredTotal;
  const result = [coordinates[0]];
  let travelled = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const length = lengths[index - 1];
    if (travelled + length <= target) {
      result.push(coordinates[index]);
      travelled += length;
      continue;
    }
    const fraction = length ? clamp((target - travelled) / length, 0, 1) : 0;
    const from = coordinates[index - 1], to = coordinates[index];
    result.push([from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction]);
    break;
  }
  return result;
}

function rasterSource(tiles, attribution, maxzoom = 19, tileSize = 256) {
  return { type: 'raster', tiles: Array.isArray(tiles) ? tiles : [tiles], tileSize, maxzoom, attribution, bounds: [...SOUTH_AFRICA_BOUNDS] };
}

function rasterStyle(id, sources, layers, metadata = {}) {
  return {
    version: 8,
    name: `Shosholoza ${id}`,
    metadata: { 'shosholoza:basemap': id, ...metadata },
    sources,
    layers: [
      { id: 'canvas', type: 'background', paint: { 'background-color': BACKGROUNDS[id] ?? BACKGROUNDS.offline } },
      ...layers,
    ],
  };
}

function configuredAttribution(tiles, fallback) {
  const urls = Array.isArray(tiles) ? tiles : [tiles];
  if (urls.some(url => String(url).includes('api.maptiler.com'))) {
    return '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  }
  return fallback;
}

/**
 * Returns self-contained MapLibre style objects. Tile URLs may be replaced at
 * runtime, including with a restricted MapTiler URL supplied by the caller.
 * No credentials are read from localStorage or embedded in the source tree.
 */
export function createBasemapStyles(config = {}) {
  const streetsTiles = config.streetsTiles ?? ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
  const outdoorTiles = config.outdoorTiles ?? [
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
  ];
  const satelliteTiles = config.satelliteTiles ?? [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ];
  const terrainTiles = config.terrainTiles ?? ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
  const satelliteMaxZoom = config.satelliteMaxZoom ?? 19;
  const satelliteAttribution = config.satelliteAttribution ?? (config.satelliteTiles ? configuredAttribution(satelliteTiles, ATTRIBUTION.esri) : ATTRIBUTION.esri);
  const hybridStyle = rasterStyle('hybrid', {
    imagery: rasterSource(satelliteTiles, satelliteAttribution, satelliteMaxZoom),
    labels: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: ATTRIBUTION.osm },
  }, [
    { id: 'hybrid-imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': 0, 'raster-contrast': 0.08 } },
    { id: 'hybrid-place-labels', type: 'symbol', source: 'labels', 'source-layer': 'place', minzoom: 3, layout: {
      'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 14, 16], 'text-variable-anchor': ['center', 'top', 'bottom'],
    }, paint: { 'text-color': '#fff7df', 'text-halo-color': '#14202c', 'text-halo-width': 2, 'text-opacity': config.hybridLabelOpacity ?? 0.72 } },
    { id: 'hybrid-road-labels', type: 'symbol', source: 'labels', 'source-layer': 'transportation_name', minzoom: 8, layout: {
      'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
    }, paint: { 'text-color': '#f6ecd4', 'text-halo-color': '#17212c', 'text-halo-width': 1.5, 'text-opacity': config.hybridLabelOpacity ?? 0.65 } },
  ], { 'shosholoza:provider': config.satelliteTiles ? 'configured' : 'esri-world-imagery' });
  hybridStyle.glyphs = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

  const styles = {
    streets: {
      id: 'streets', label: 'Streets', online: true, maxUsefulZoom: 19,
      style: rasterStyle('streets', { base: rasterSource(streetsTiles, ATTRIBUTION.osm) }, [
        { id: 'streets-raster', type: 'raster', source: 'base' },
      ], { 'shosholoza:provider': config.streetsTiles ? 'configured' : 'openstreetmap' }),
    },
    outdoor: {
      id: 'outdoor', label: 'Terrain', online: true, maxUsefulZoom: 17,
      style: rasterStyle('outdoor', {
        base: rasterSource(outdoorTiles, config.outdoorTiles ? configuredAttribution(outdoorTiles, ATTRIBUTION.osm) : `${ATTRIBUTION.topo} · ${ATTRIBUTION.osm}`, 17),
        elevation: { type: 'raster-dem', tiles: terrainTiles, tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Elevation: Mapzen terrain tiles' },
      }, [
        { id: 'outdoor-raster', type: 'raster', source: 'base' },
        { id: 'terrain-hillshade', type: 'hillshade', source: 'elevation', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#46351e', 'hillshade-highlight-color': '#f6e6be' } },
      ], { 'shosholoza:terrain': true, 'shosholoza:provider': config.outdoorTiles ? 'configured' : 'opentopomap' }),
    },
    satellite: {
      id: 'satellite', label: 'Satellite', online: true, maxUsefulZoom: satelliteMaxZoom,
      style: rasterStyle('satellite', { base: rasterSource(satelliteTiles, satelliteAttribution, satelliteMaxZoom) }, [
        { id: 'satellite-raster', type: 'raster', source: 'base', paint: { 'raster-saturation': 0.12, 'raster-contrast': 0.09, 'raster-brightness-max': 1 } },
      ], { 'shosholoza:provider': config.satelliteTiles ? 'configured' : 'esri-world-imagery' }),
    },
    hybrid: {
      id: 'hybrid', label: 'Hybrid', online: true, maxUsefulZoom: satelliteMaxZoom,
      style: hybridStyle,
    },
    offline: {
      id: 'offline', label: 'Offline', online: false, maxUsefulZoom: 12,
      style: rasterStyle('offline', {}, [], { 'shosholoza:fallback': true }),
    },
  };
  for (const definition of Object.values(styles)) {
    if (!definition.online) continue;
    const style = definition.style;
    style.sources.elevation ??= { type: 'raster-dem', tiles: terrainTiles, tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Elevation: Mapzen terrain tiles' };
    style.layers = style.layers.filter(layer => layer.id !== 'terrain-hillshade');
    for (const layer of style.layers) {
      if (layer.type !== 'raster') continue;
      layer.paint = { ...layer.paint, 'raster-saturation': -0.32, 'raster-contrast': 0.04, 'raster-brightness-max': 1 };
    }
    const firstLabel = style.layers.findIndex(layer => layer.type === 'symbol');
    style.layers.splice(firstLabel < 0 ? style.layers.length : firstLabel, 0, {
      id: 'imhof-relief', type: 'hillshade', source: 'elevation', paint: {
        'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#4a3b2a',
        'hillshade-highlight-color': '#fff2d8', 'hillshade-accent-color': '#8a6f4e',
        'hillshade-illumination-anchor': 'map',
      },
    });
    if (['satellite', 'hybrid'].includes(definition.id)) {
      style.sources['relief-vector'] = { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: ATTRIBUTION.osm };
      style.layers[0].paint['background-color'] = '#c08a5a';
      style.layers.splice(1, 0,
        { id: 'relief-landcover', type: 'fill', source: 'relief-vector', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#6b7f5e', 'grass', '#8a9463', '#b08a5c'], 'fill-opacity': 0.5 } },
        { id: 'relief-water', type: 'fill', source: 'relief-vector', 'source-layer': 'water', paint: { 'fill-color': '#718f89', 'fill-opacity': 0.65 } },
        { id: 'relief-rail', type: 'line', source: 'relief-vector', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#69533a', 'line-width': 1 } });
    }
  }
  // South Africa only, for every tiled source - imagery, elevation and the
  // vector relief - whichever style declared it.
  for (const definition of Object.values(styles)) {
    for (const source of Object.values(definition.style.sources)) {
      if (['raster', 'raster-dem', 'vector'].includes(source.type)) source.bounds = [...SOUTH_AFRICA_BOUNDS];
    }
  }
  return styles;
}

function normalizeFeature(featureOrGeometry, properties = {}) {
  if (featureOrGeometry?.type === 'Feature') return structuredClone(featureOrGeometry);
  return { type: 'Feature', properties, geometry: structuredClone(featureOrGeometry) };
}

function markerButton(className, label, content) {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML = content;
  return button;
}

function boundsForCoordinates(maplibre, coordinates) {
  const bounds = new maplibre.LngLatBounds();
  for (const coordinate of coordinates) bounds.extend(coordinate);
  return bounds;
}

function validCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function visitGeometryCoordinates(coordinates, visit) {
  if (validCoordinate(coordinates)) { visit([Number(coordinates[0]), Number(coordinates[1])]); return; }
  if (Array.isArray(coordinates)) for (const child of coordinates) visitGeometryCoordinates(child, visit);
}

/**
 * Build the red Google-style selected-area overlay only from a real polygon.
 * A point or bounding box is not silently presented as an administrative
 * outline: if boundary data is unavailable, the named pin remains by itself.
 */
export function selectionAreaFeature(place) {
  const longitude = Number(place?.lon), latitude = Number(place?.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const geometry = place?.geometry;
  if (['Polygon', 'MultiPolygon'].includes(geometry?.type) && Array.isArray(geometry.coordinates)) {
    return normalizeFeature(geometry, { name: String(place.name ?? ''), approximation: false });
  }
  return null;
}

export function createImmersiveMap(options) {
  const maplibre = options.maplibre ?? globalThis.maplibregl;
  if (!maplibre?.Map) throw new Error('MapLibre GL JS is unavailable. Load /vendor/maplibre-gl/maplibre-gl.js before this module.');
  const route = normalizeFeature(options.route);
  if (route.geometry?.type !== 'LineString' || route.geometry.coordinates.length < 2) throw new Error('An immersive map requires a GeoJSON LineString route.');

  const runtimeConfig = { ...(globalThis.SHOSHOLOZA_MAP_CONFIG ?? {}), ...(options.mapConfig ?? {}) };
  const styles = createBasemapStyles(runtimeConfig);
  const keylessStyles = createBasemapStyles();
  const containerElement = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
  if (!containerElement) throw new Error('The immersive map container was not found.');
  let activeStyle = styles[options.initialStyle] ? options.initialStyle : (globalThis.navigator?.onLine === false ? 'offline' : 'satellite');
  let activeDefinition = styles[activeStyle];
  let preferredOnlineStyle = activeStyle === 'offline' ? 'satellite' : activeStyle;
  let follow = options.follow !== false;
  let cinematic = options.cinematic !== false;
  let destroyed = false;
  let lastPosition = null;
  let trainBearing = 0;
  let distanceMetres = 0;
  let previewFrame = null;
  let styleSequence = 0;
  let styleControl = null;
  let relief = null;
  let reliefSignature = '';
  const updateRelief = () => {
    if (!relief || !map.isStyleLoaded()) return;
    const center = map.getCenter();
    const measuredElevation = map.queryTerrainElevation?.(center);
    const elevation = measuredElevation == null ? 1200 : measuredElevation / (map.getTerrain?.()?.exaggeration || 1);
    const signature = `${styleSequence}:${activeStyle}:${center.lng.toFixed(4)}:${center.lat.toFixed(4)}:${Math.round(elevation / 20)}`;
    if (signature === reliefSignature) return;
    reliefSignature = signature;
    relief.applyElevationPalette(map, elevation, relief.sunlightAt(center.lat, center.lng), 'dusk');
    const nearby = (options.hubs ?? []).map(hub => [Number(hub.lon ?? hub.longitude), Number(hub.lat ?? hub.latitude)]).filter(point => point.every(Number.isFinite));
    if (options.trueSatellite) {
      // The corridor map is geographic inspection, not the animated ride's
      // distance-dependent satellite reveal. Satellite must remain imagery.
      relief.applySatelliteZone(map, 0);
      if (map.getLayer('imhof-relief') && ['satellite', 'hybrid'].includes(activeStyle)) map.setLayoutProperty('imhof-relief', 'visibility', 'none');
    } else if (nearby.length) relief.applySatelliteZone(map, Math.min(...nearby.map(point => haversineMetres([center.lng, center.lat], point))));
  };
  const providerFallbacks = new Set();
  const markers = new Map();
  containerElement.dataset.mapEngine = 'maplibre';
  containerElement.dataset.activeStyle = activeStyle;
  containerElement.dataset.offlineFallback = String(activeStyle === 'offline');
  containerElement.dataset.mapProvider = activeDefinition.style.metadata?.['shosholoza:provider'] ?? 'local';

  const notify = (status, detail = {}) => options.onStatus?.({ status, basemap: activeStyle, ...detail });
  const map = new maplibre.Map({
    container: containerElement,
    style: styles[activeStyle].style,
    center: options.center ?? DEFAULT_CENTER,
    zoom: options.zoom ?? 4.6,
    pitch: cinematic && !options.reducedMotion ? (options.pitch ?? 52) : 0,
    bearing: 0,
    antialias: true,
    attributionControl: true,
    maxPitch: 70,
    // Keep the camera over South Africa: the only place tiles exist for.
    maxBounds: options.maxBounds ?? VIEW_BOUNDS,
    minZoom: options.minZoom ?? MIN_ZOOM,
    cooperativeGestures: options.cooperativeGestures ?? false,
  });
  map.addControl(new maplibre.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
  map.addControl(new maplibre.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  // Loaded from our origin and included in the downloaded passenger pack.
  void import('./imhof-relief.js').then(module => { if (!destroyed) { relief = module; updateRelief(); } }).catch(() => notify('relief-unavailable'));
  map.on('moveend', updateRelief);
  // Car lengths are in pixels, so the consist is re-cut as the zoom changes.
  map.on('zoom', () => { drawTrain(); resizePins(); });
  map.on('idle', updateRelief);

  // The train is drawn on the map itself, as a short consist cut from the
  // route line: it bends with the track and stays on the ground at any pitch.
  // This marker is only its focusable, labelled front end.
  const trainElement = markerButton('immersive-train immersive-train--manual', 'Journey position', '');
  const trainMarker = new maplibre.Marker({ element: trainElement, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' });
  const selectedElement = document.createElement('div');
  selectedElement.className = 'immersive-selected-place';
  selectedElement.setAttribute('role', 'status');
  selectedElement.innerHTML = '<span class="immersive-selected-place-pin" aria-hidden="true"></span><strong></strong>';
  const selectedMarker = new maplibre.Marker({ element: selectedElement, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' });
  let selectedPlace = null;

  // Distances along the route, for cutting the consist out of it.
  const routeCoordinates = route.geometry.coordinates;
  const routeCumulative = [0];
  for (let index = 1; index < routeCoordinates.length; index += 1) {
    routeCumulative.push(routeCumulative[index - 1] + haversineMetres(routeCoordinates[index - 1], routeCoordinates[index]));
  }
  const measuredLength = routeCumulative.at(-1) || 1;
  const declaredLength = Number(route.properties?.lengthMetres) || measuredLength;
  /** A point at `metres` along the measured line, and the vertex before it. */
  function pointAlong(metres) {
    const target = clamp(metres, 0, measuredLength);
    let low = 0, high = routeCumulative.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (routeCumulative[mid] <= target) low = mid; else high = mid; }
    const span = routeCumulative[high] - routeCumulative[low] || 1, t = (target - routeCumulative[low]) / span;
    const a = routeCoordinates[low], b = routeCoordinates[high] ?? a;
    return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: low };
  }
  // Overview vehicles use rigid endpoints and screen-readable detail.
  let trainTarget = 0, trainShown = null, trainFrame = 0, trainLast = 0, trainHeading = 1;
  let followCameraInitialized = false, followMovement = {}, lastFollowDistance = null;
  /**
   * How much the train and the stop pins grow as the map zooms in. At country
   * scale a pixel-sized train is right; at town scale it would be a speck on a
   * map that has grown sixteen-fold around it. Everything on the map uses this
   * one curve - geometry here, line widths and icon sizes through zoomed() -
   * so nothing drifts relative to anything else.
   */
  const ZOOM_GROWTH = 1.37;   // per zoom level; x4 over about 4.4 levels
  const zoomScale = zoom => clamp(ZOOM_GROWTH ** (zoom - 7), 0.75, 4);
  /** A paint/layout value that follows zoomScale(), for MapLibre expressions. */
  const zoomed = value => ['interpolate', ['exponential', ZOOM_GROWTH], ['zoom'],
    6.1, value * 0.75, 7, value, 11.4, value * 4, 24, value * 4];
  function consistAt(declaredMetres) {
    const head = declaredMetres / declaredLength * measuredLength;
    const nose = pointAlong(head).point;
    const metresPerPixel = 40075016.686 * Math.cos(rad(nose[1])) / (512 * 2 ** map.getZoom());
    return overviewConsist(head, pointAlong, metresPerPixel * zoomScale(map.getZoom()), trainHeading);
  }

  function drawTrain() {
    const source = map.getSource('journey-train');
    if (!source || trainShown === null) return;
    source.setData({ type: 'FeatureCollection', features: consistAt(trainShown) });
  }
  /**
   * Lock the follow camera to the same interpolated distance that is actually
   * drawn. Repeated easeTo calls chase stale targets and can fall kilometres
   * behind at 2x/4x; a frame-synchronous jump keeps the consist in view while
   * its own interpolation supplies the visual smoothness.
   */
  function syncFollowCamera() {
    if (!follow || trainShown === null) return;
    // The train loop also drives a headlight pulse while stationary. Avoid
    // needlessly rebuilding the camera transform on those idle frames.
    if (followCameraInitialized && lastFollowDistance !== null
      && Math.abs(trainShown - lastFollowDistance) < 0.05) return;
    const head = trainShown / declaredLength * measuredLength;
    const drawnPosition = pointAlong(head).point;
    const zoom = Math.min(activeDefinition.maxUsefulZoom, followCameraInitialized
      ? map.getZoom()
      : (followMovement.zoom ?? Math.max(map.getZoom(), 7.2)));
    map.jumpTo({
      center: drawnPosition,
      bearing: cinematic ? trainBearing : map.getBearing(),
      pitch: cinematic && !options.reducedMotion ? (followMovement.pitch ?? 58) : map.getPitch(),
      zoom,
      padding: followMovement.padding ?? { top: 80, right: 30, bottom: 180, left: 30 },
    });
    followCameraInitialized = true;
    lastFollowDistance = trainShown;
    containerElement.dataset.followCamera = 'locked-to-drawn-train';
    const screenPosition = map.project(drawnPosition);
    containerElement.dataset.followTrainVisible = String(
      screenPosition.x >= 0 && screenPosition.x <= containerElement.clientWidth
      && screenPosition.y >= 0 && screenPosition.y <= containerElement.clientHeight,
    );
  }
  /** Glide the drawn train to its target and pulse the headlight. */
  function animateTrain(now) {
    trainFrame = 0;
    if (destroyed) return;
    const dt = Math.min(0.1, trainLast ? (now - trainLast) / 1000 : 0);
    trainLast = now;
    if (trainShown === null || options.reducedMotion) trainShown = trainTarget;
    else trainShown += (trainTarget - trainShown) * Math.min(1, dt * 7);
    drawTrain();
    syncFollowCamera();
    if (map.getLayer('journey-train-headlight-glow')) {
      const pulse = options.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 260);
      map.setPaintProperty('journey-train-headlight-glow', 'circle-opacity', 0.18 + pulse * 0.08);
      map.setPaintProperty('journey-train-headlight-glow', 'circle-radius', (5 + pulse * 1.5) * zoomScale(map.getZoom()));
    }
    // Keeps ticking for the headlight; a settled train costs one small setData.
    if (!options.reducedMotion) trainFrame = requestAnimationFrame(animateTrain);
  }
  function moveTrainTo(declaredMetres) {
    // Which way it is running, so the locomotive always leads.
    if (trainShown !== null && Math.abs(declaredMetres - trainShown) > 1) trainHeading = declaredMetres >= trainShown ? 1 : -1;
    trainTarget = declaredMetres;
    if (!trainFrame) trainFrame = requestAnimationFrame(animateTrain);
  }

  function addSelectionLayers() {
    if (!selectedPlace || map.getSource('selected-place-area')) return;
    const feature = selectionAreaFeature(selectedPlace);
    if (!feature) return;
    map.addSource('selected-place-area', { type: 'geojson', data: feature, attribution: 'Selected boundary: © OpenStreetMap contributors' });
    map.addLayer({ id: 'selected-place-fill', type: 'fill', source: 'selected-place-area', paint: {
      'fill-color': '#ea4335', 'fill-opacity': 0.11,
    } });
    map.addLayer({ id: 'selected-place-glow', type: 'line', source: 'selected-place-area', paint: {
      'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.68, 'line-blur': 1.2,
    }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'selected-place-outline', type: 'line', source: 'selected-place-area', paint: {
      'line-color': '#ea4335', 'line-width': 3.5, 'line-opacity': 1, 'line-dasharray': [1.1, 1.4],
    }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  }

  function addJourneyLayers() {
    // `style.load` is the correct point at which MapLibre accepts custom
    // sources, but `isStyleLoaded()` can still be false while raster tiles are
    // pending. Returning in that state permanently dropped the route, pins and
    // train after switching away from the initial basemap.
    if (map.getSource('journey-route')) return;
    map.addSource('journey-route', { type: 'geojson', data: route });
    map.addSource('journey-progress', { type: 'geojson', data: normalizeFeature({ type: 'LineString', coordinates: [route.geometry.coordinates[0], route.geometry.coordinates[0]] }) });
    map.addLayer({ id: 'journey-route-shadow', type: 'line', source: 'journey-route', paint: { 'line-color': '#06110e', 'line-width': 10, 'line-opacity': 0.68, 'line-blur': 2 } });
    const verifiedRail = route.properties?.railAlignmentVerified === true;
    map.addLayer({ id: 'journey-route-line', type: 'line', source: 'journey-route', paint: {
      'line-color': '#d69b52', 'line-width': 4, 'line-opacity': 0.9,
      ...(verifiedRail ? {} : { 'line-dasharray': [1.2, 2.2] }),
    }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'journey-progress-glow', type: 'line', source: 'journey-progress', paint: { 'line-color': '#ffd66b', 'line-width': 12, 'line-opacity': 0.24, 'line-blur': 4 } });
    map.addLayer({ id: 'journey-progress-line', type: 'line', source: 'journey-progress', paint: { 'line-color': '#ffe08a', 'line-width': 6, 'line-opacity': 1 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    addSelectionLayers();
    // Hubs sit on the ground: a soft shadow at the exact point under each badge.
    const hubPoints = (options.hubs ?? []).map(hub => [Number(hub.lon ?? hub.longitude), Number(hub.lat ?? hub.latitude)]).filter(point => point.every(Number.isFinite));
    map.addSource('journey-hub-ground', { type: 'geojson', data: { type: 'FeatureCollection', features: hubPoints.map(point => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } })) } });
    map.addLayer({ id: 'journey-hub-ground', type: 'circle', source: 'journey-hub-ground', paint: { 'circle-color': '#06110e', 'circle-radius': zoomed(9), 'circle-blur': 0.75, 'circle-opacity': 0.38, 'circle-pitch-alignment': 'map' } });
    addHubLayers();
    map.addSource('journey-train', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const cars = ['in', ['get', 'kind'], ['literal', ['loco', 'coach']]];
    map.addLayer({ id: 'journey-train-shadow', type: 'line', source: 'journey-train', filter: cars, paint: { 'line-color': '#06110e', 'line-width': zoomed(18), 'line-opacity': 0.45, 'line-blur': 3, 'line-translate': [2, 3] }, layout: { 'line-join': 'miter' } });
    // Keep the consist physically raised above the map. Terrain-style shading
    // remains in the basemap, but the incompatible MapLibre terrain transform
    // is deliberately not enabled, so this dynamic extrusion survives every
    // style switch without flattening or dropping the journey overlays.
    map.addLayer({id:'journey-train-solid',type:'fill-extrusion',source:'journey-train',filter:['==',['get','kind'],'solid'],paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
    containerElement.dataset.trainPresentation = '3d-extrusion';
    const detail=(id,kind,width,color)=>map.addLayer({id,type:'line',source:'journey-train',filter:['==',['get','kind'],kind],paint:{'line-color':color,'line-width':zoomed(width)},layout:{'line-cap':'butt','line-join':'miter'}});
    detail('journey-train-couplers','coupler',2,'#a4afb1');
    detail('journey-train-bogies','bogie',2.5,'#172329');
    detail('journey-train-roof','roof',6,'#b4bab9');
    detail('journey-train-windows','window',2,'#173444');
    detail('journey-train-cab','cab',2.5,'#182e3a');
    detail('journey-train-vents','vent',3,'#505d65');
    detail('journey-train-pantograph','pantograph',1.2,'#202d34');
    const light = ['==', ['get', 'kind'], 'headlight'];
    map.addLayer({ id: 'journey-train-headlight-glow', type: 'circle', source: 'journey-train', filter: light, paint: { 'circle-color': '#ffe7a3', 'circle-radius': 11, 'circle-blur': 0.9, 'circle-opacity': 0.4, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'journey-train-headlight', type: 'circle', source: 'journey-train', filter: light, paint: { 'circle-color': '#fffbe6', 'circle-radius': zoomed(2), 'circle-stroke-color': '#14202c', 'circle-stroke-width': 1, 'circle-pitch-alignment': 'map' } });
    setRouteProgress(distanceMetres, { animate: false });
    if (trainShown !== null) drawTrain();
  }

  /**
   * The stop pins, rendered by MapLibre as symbols. HTML markers are laid over
   * the canvas and repositioned after each frame, at a fixed screen size: when
   * zooming they lag the map and never grow with it, so they read as stuck to
   * the screen. Symbols are drawn in the same pass as the map, anchored at the
   * point, and sized with zoomed().
   */
  const PIN_PIXEL_RATIO = 2;
  function pinImage() {
    const w = 32 * PIN_PIXEL_RATIO, h = 44 * PIN_PIXEL_RATIO;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.scale(PIN_PIXEL_RATIO, PIN_PIXEL_RATIO);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ea4335'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.fill(new Path2D('M16 1C7.7 1 1 7.7 1 16c0 11 15 26 15 26s15-15 15-26C31 7.7 24.3 1 16 1Z'));
    ctx.shadowColor = 'transparent';
    ctx.stroke(new Path2D('M16 1C7.7 1 1 7.7 1 16c0 11 15 26 15 26s15-15 15-26C31 7.7 24.3 1 16 1Z'));
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(16, 16, 5.5, 0, Math.PI * 2); ctx.fill();
    return ctx.getImageData(0, 0, w, h);
  }
  function labelImage(text) {
    const font = '600 11px Outfit, system-ui, sans-serif';
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const width = Math.ceil(probe.measureText(text).width) + 16, height = 20;
    const canvas = document.createElement('canvas');
    canvas.width = width * PIN_PIXEL_RATIO; canvas.height = height * PIN_PIXEL_RATIO;
    const ctx = canvas.getContext('2d');
    ctx.scale(PIN_PIXEL_RATIO, PIN_PIXEL_RATIO);
    ctx.fillStyle = 'rgba(17,26,41,.86)';
    ctx.beginPath(); ctx.roundRect(0, 0, width, height, 8); ctx.fill();
    ctx.font = font; ctx.fillStyle = '#f8f2e8'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height / 2 + 0.5);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  const hubList = () => (options.hubs ?? []).map((hub, index) => ({ hub, index, point: [Number(hub.lon ?? hub.longitude), Number(hub.lat ?? hub.latitude)] }))
    .filter(entry => entry.point.every(Number.isFinite));
  let hubEventsBound = false;
  function addHubLayers() {
    if (typeof document === 'undefined' || map.getSource('journey-hubs')) return;
    // Style images do not survive a basemap switch; re-add them each time.
    if (!map.hasImage('journey-hub-pin')) map.addImage('journey-hub-pin', pinImage(), { pixelRatio: PIN_PIXEL_RATIO });
    for (const { hub, index } of hubList()) {
      const id = `journey-hub-label-${index}`;
      if (!map.hasImage(id)) map.addImage(id, labelImage(hub.name), { pixelRatio: PIN_PIXEL_RATIO });
    }
    map.addSource('journey-hubs', { type: 'geojson', data: { type: 'FeatureCollection', features: hubList().map(({ hub, index, point }) => ({
      type: 'Feature', properties: { index, hubId: hub.hubId ?? hub.id, label: `journey-hub-label-${index}` }, geometry: { type: 'Point', coordinates: point },
    })) } });
    // The pin's tip sits on the point: anchored at the bottom of the icon.
    map.addLayer({ id: 'journey-hub-pins', type: 'symbol', source: 'journey-hubs', layout: {
      'icon-image': 'journey-hub-pin', 'icon-anchor': 'bottom', 'icon-size': zoomed(0.8),
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'index'],
    } });
    map.addLayer({ id: 'journey-hub-labels', type: 'symbol', source: 'journey-hubs', layout: {
      'icon-image': ['get', 'label'], 'icon-anchor': 'top', 'icon-offset': [0, 6], 'icon-size': zoomed(0.8),
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    } });
    if (hubEventsBound) return;
    hubEventsBound = true;
    const select = event => {
      const index = Number(event.features?.[0]?.properties?.index);
      const hub = options.hubs?.[index];
      if (hub) options.onHubSelect?.(hub);
    };
    for (const layer of ['journey-hub-pins', 'journey-hub-labels']) {
      map.on('click', layer, select);
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
  }

  function resizePins(){
    const size=clamp(24+(map.getZoom()-5)*1.7,24,44);
    for(const [id,marker] of markers){if(!id.startsWith('hub:'))continue;marker.getElement().style.setProperty('--pin-width',`${size}px`);marker.getElement().style.setProperty('--pin-height',`${size*44/32}px`);}
  }
  function addMarkers() {
    if (markers.size) return;
    for (const [index, hub] of (options.hubs ?? []).entries()) {
      const longitude = Number(hub.lon ?? hub.longitude), latitude = Number(hub.lat ?? hub.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      const storyPending = String(hub.storyTriggerStatus ?? '').startsWith('not-created');
      const markerLabel = storyPending ? `View ${hub.name} mapped station` : `Open ${hub.name} story`;
      const element = markerButton('immersive-hub', markerLabel, `<svg class="station-pin" viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 26 15 26s15-15 15-26C31 7.7 24.3 1 16 1Z" fill="#ea4335" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg><strong>${hub.name}</strong>`);
      element.dataset.hub = hub.hubId ?? hub.id;
      element.addEventListener('click', () => options.onHubSelect?.(hub));
      // Flat on the map at the exact point: an upright badge on a tilted map
      // reads as floating above the place it marks.
      // Keyboard and screen-reader access only; the visible pin is the map's
      // own symbol layer (addHubLayers), which stays attached while zooming.
      element.classList.add('immersive-hub--focus-only');
      const wrapper=document.createElement('div');wrapper.className='immersive-hub-anchor';wrapper.append(element);
      const marker = new maplibre.Marker({ element: wrapper, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([longitude, latitude]).addTo(map);
      markers.set(`hub:${hub.hubId ?? hub.id}`, marker);
    }
    resizePins();
    for (const attraction of options.attractions ?? []) {
      const longitude = Number(attraction.lon ?? attraction.longitude), latitude = Number(attraction.lat ?? attraction.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      const element = markerButton('immersive-attraction', `Open ${attraction.name}`, '<span aria-hidden="true">&#9670;</span>');
      element.title = attraction.name;
      element.dataset.attraction = attraction.id;
      element.addEventListener('click', () => options.onAttractionSelect?.(attraction));
      const marker = new maplibre.Marker({ element, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(map);
      markers.set(`attraction:${attraction.id}`, marker);
    }
  }

  function setRouteProgress(metres, { animate = true } = {}) {
    distanceMetres = clamp(Number(metres) || 0, 0, Number(route.properties?.lengthMetres) || Infinity);
    const coordinates = sliceLineAtDistance(route, distanceMetres);
    if (coordinates.length === 1) coordinates.push(coordinates[0]);
    const source = map.getSource('journey-progress');
    source?.setData(normalizeFeature({ type: 'LineString', coordinates }));
    if (animate && coordinates.length > 1) options.onProgress?.({ distanceMetres, coordinates });
    return coordinates;
  }

  // Establish the follow framing once; playback must preserve the user's zoom.
  function updatePosition(position, movement = {}) {
    const next = [Number(position.lon ?? position.lng), Number(position.lat)];
    if (!next.every(Number.isFinite)) return;
    const inferred = lastPosition && haversineMetres(lastPosition, next) > 2 ? bearingBetween(lastPosition, next) : trainBearing;
    trainBearing = smoothBearing(trainBearing, Number.isFinite(position.bearing) ? position.bearing : inferred, movement.bearingSmoothing ?? 0.32);
    lastPosition = next;
    trainMarker.setLngLat(next).setRotation(trainBearing);
    if (!trainMarker.getElement().parentNode) trainMarker.addTo(map);
    trainElement.className = `immersive-train immersive-train--${position.source ?? 'manual'}`;
    trainElement.setAttribute('aria-label', position.source === 'replay' ? 'Simulated journey position' : 'Current journey position');
    if (Number.isFinite(position.s ?? movement.distanceMetres)) {
      setRouteProgress(position.s ?? movement.distanceMetres);
      moveTrainTo(position.s ?? movement.distanceMetres);
    }
    followMovement = { ...followMovement, ...movement };
    if (follow) syncFollowCamera();
    options.onPosition?.({ coordinates: next, bearing: trainBearing, follow, cinematic });
  }

  async function setBasemap(id, { remember = true, definition } = {}) {
    const requested = definition ?? styles[id] ?? styles.offline;
    if (requested.online && globalThis.navigator?.onLine === false) {
      notify('offline-fallback', { requested: id });
      return setBasemap('offline', { remember: false });
    }
    if (!definition) providerFallbacks.delete(requested.id);
    if (remember && requested.online) preferredOnlineStyle = requested.id;
    activeStyle = requested.id;
    activeDefinition = requested;
    containerElement.dataset.activeStyle = activeStyle;
    containerElement.dataset.offlineFallback = String(activeStyle === 'offline');
    containerElement.dataset.mapProvider = requested.style.metadata?.['shosholoza:provider'] ?? 'local';
    const sequence = ++styleSequence;
    map.setStyle(requested.style, { diff: false });
    await new Promise(resolve => map.once('style.load', resolve));
    if (destroyed || sequence !== styleSequence) return activeStyle;
    addJourneyLayers();
    // A very fast style switch can happen before the initial map `load`
    // event. Ensure the focusable stop markers are created on this style too.
    addMarkers();
    if (styleControl) {
      for (const candidate of styleControl.querySelectorAll('[data-map-style]')) candidate.setAttribute('aria-pressed', String(candidate.dataset.mapStyle === activeStyle));
      const status = styleControl.querySelector('.immersive-map-status');
      if (status) {
        const provider = requested.style.metadata?.['shosholoza:provider'];
        status.textContent = activeStyle === 'offline'
          ? 'Offline map active. Route and stops remain available.'
          : `${requested.label} map active${provider === 'eox-cloudless-2025' ? ' · cloudless Sentinel-2 mosaic' : ''}.`;
      }
    }
    options.onStyleChange?.({ id: activeStyle, definition: requested });
    notify('style-ready');
    return activeStyle;
  }

  function fitRoute(fitOptions = {}) {
    map.fitBounds(boundsForCoordinates(maplibre, route.geometry.coordinates), {
      padding: fitOptions.padding ?? 45,
      pitch: cinematic ? 55 : 0,
      bearing: 0,
      duration: options.reducedMotion ? 0 : (fitOptions.duration ?? 1100),
      maxZoom: fitOptions.maxZoom ?? 6,
      essential: true,
    });
  }

  function selectPlace(place, selectOptions = {}) {
    const longitude = Number(place?.lon), latitude = Number(place?.lat);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
    selectedPlace = { ...place, lon: longitude, lat: latitude };
    follow = false;
    followCameraInitialized = false;
    containerElement.dataset.selectedPlace = String(place.name ?? 'Selected location');
    selectedElement.querySelector('strong').textContent = String(place.name ?? 'Selected location');
    selectedElement.setAttribute('aria-label', `${String(place.name ?? 'Selected location')} selected on the map`);
    selectedMarker.setLngLat([longitude, latitude]);
    if (!selectedMarker.getElement().parentNode) selectedMarker.addTo(map);

    const feature = selectionAreaFeature(selectedPlace);
    containerElement.dataset.selectedBoundary = feature ? 'exact' : 'none';
    const source = map.getSource('selected-place-area');
    if (source) source.setData(feature ?? { type: 'FeatureCollection', features: [] });
    // `map.load` can fire while raster tiles are still pending, which makes
    // isStyleLoaded() false even though custom sources are already accepted.
    // The same distinction previously caused route/stops to vanish on switch.
    else addSelectionLayers();

    const bounds = new maplibre.LngLatBounds();
    if (feature) visitGeometryCoordinates(feature.geometry.coordinates, coordinate => bounds.extend(coordinate));
    const mobile = containerElement.clientWidth < 720;
    const padding = selectOptions.padding ?? (mobile
      ? { top: 100, right: 28, bottom: 180, left: 28 }
      : { top: 105, right: Math.min(430, containerElement.clientWidth * 0.34), bottom: 145, left: 54 });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding, maxZoom: Math.min(activeDefinition.maxUsefulZoom, selectOptions.maxZoom ?? place.zoom ?? 12),
        pitch: selectOptions.pitch ?? (cinematic ? 42 : 0), bearing: selectOptions.bearing ?? 0,
        duration: options.reducedMotion ? 0 : (selectOptions.duration ?? 1450), essential: true,
      });
    } else {
      map.flyTo({ center: [longitude, latitude], zoom: Math.min(activeDefinition.maxUsefulZoom, place.zoom ?? 11),
        pitch: cinematic ? 42 : 0, bearing: 0, duration: options.reducedMotion ? 0 : 1450, essential: true });
    }
    notify('place-selected', { name: String(place.name ?? ''), approximate: feature?.properties?.approximation === true });
    return true;
  }

  function flyToHub(hubId, flyOptions = {}) {
    const hub = (options.hubs ?? []).find(item => (item.hubId ?? item.id) === hubId);
    if (!hub) return false;
    map.flyTo({ center: [hub.lon ?? hub.longitude, hub.lat ?? hub.latitude], zoom: flyOptions.zoom ?? 11, pitch: cinematic ? 58 : 0,
      bearing: flyOptions.bearing ?? trainBearing, duration: options.reducedMotion ? 0 : (flyOptions.duration ?? 2200), essential: true });
    markers.get(`hub:${hubId}`)?.getElement()?.classList.add('immersive-hub--pulse');
    setTimeout(() => markers.get(`hub:${hubId}`)?.getElement()?.classList.remove('immersive-hub--pulse'), 2600);
    return true;
  }

  function flyToAttraction(attractionId, flyOptions = {}) {
    const attraction = (options.attractions ?? []).find(item => item.id === attractionId);
    if (!attraction) return false;
    map.flyTo({ center: [attraction.lon ?? attraction.longitude, attraction.lat ?? attraction.latitude], zoom: flyOptions.zoom ?? 15, pitch: cinematic ? 48 : 0,
      bearing: flyOptions.bearing ?? 0, duration: options.reducedMotion ? 0 : (flyOptions.duration ?? 1800), essential: true });
    markers.get(`attraction:${attractionId}`)?.getElement()?.classList.add('immersive-attraction--pulse');
    setTimeout(() => markers.get(`attraction:${attractionId}`)?.getElement()?.classList.remove('immersive-attraction--pulse'), 2200);
    return true;
  }

  function playRoutePreview({ duration = 12000, onComplete } = {}) {
    cancelAnimationFrame(previewFrame);
    const total = Number(route.properties?.lengthMetres) || route.geometry.coordinates.slice(1).reduce((sum, point, index) => sum + haversineMetres(route.geometry.coordinates[index], point), 0);
    const start = performance.now();
    follow = true;
    const frame = now => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      const prefix = sliceLineAtDistance(route, total * eased);
      const point = prefix.at(-1), previous = prefix.at(-2) ?? point;
      updatePosition({ lon: point[0], lat: point[1], bearing: bearingBetween(previous, point), s: total * eased, source: 'replay' }, { duration: 250, zoom: 7.1 });
      if (progress < 1 && !destroyed) previewFrame = requestAnimationFrame(frame);
      else onComplete?.();
    };
    previewFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(previewFrame);
  }

  function addStyleControl() {
    styleControl?.remove();
    const control = document.createElement('div');
    control.className = 'immersive-style-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Map appearance');
    const status = document.createElement('p');
    status.className = 'immersive-map-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = `${styles[activeStyle].label} map active.`;
    for (const style of Object.values(styles).filter(item => item.id !== 'offline')) {
      const button = markerButton('immersive-style-button', `Use ${style.label} map`, `<span class="immersive-style-swatch immersive-style-swatch--${style.id}" aria-hidden="true"></span><span>${style.label}</span>`);
      button.dataset.mapStyle = style.id;
      button.setAttribute('aria-pressed', String(style.id === activeStyle));
      button.addEventListener('click', async () => {
        status.textContent = `Loading ${style.label} map...`;
        await setBasemap(style.id);
      });
      control.append(button);
    }
    control.append(status);
    options.controlsContainer?.append(control);
    styleControl = control;
    return control;
  }

  const onlineHandler = () => { if (activeStyle === 'offline') setBasemap(preferredOnlineStyle); };
  const offlineHandler = () => setBasemap('offline', { remember: false });
  globalThis.addEventListener?.('online', onlineHandler);
  globalThis.addEventListener?.('offline', offlineHandler);
  map.on('load', () => { addJourneyLayers(); addMarkers(); fitRoute({ duration: 0 }); notify('ready'); });
  map.on('error', () => {
    const provider = activeDefinition.style.metadata?.['shosholoza:provider'];
    if (provider === 'configured' && !providerFallbacks.has(activeStyle)) {
      providerFallbacks.add(activeStyle);
      // Provider errors can include credential-bearing URLs. Never expose the
      // raw MapLibre error to callbacks, logs, or the DOM.
      notify('provider-fallback', { requested: activeStyle, fallbackProvider: keylessStyles[activeStyle].style.metadata?.['shosholoza:provider'] });
      queueMicrotask(() => setBasemap(activeStyle, { remember: false, definition: keylessStyles[activeStyle] }));
      return;
    }
    notify('map-resource-error', { resource: activeStyle });
  });

  return {
    map,
    styles: Object.values(styles).map(({ style, ...summary }) => summary),
    addStyleControl,
    setBasemap,
    setRouteProgress,
    updatePosition,
    fitRoute,
    selectPlace,
    /** Fly to any coordinate: used by place search and by "See on map". */
    flyToPoint(longitude, latitude, flyOptions = {}) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
      follow = false;
      map.flyTo({ center: [longitude, latitude], zoom: Math.min(activeDefinition.maxUsefulZoom, flyOptions.zoom ?? 12),
        pitch: flyOptions.pitch ?? (cinematic ? 45 : 0), bearing: flyOptions.bearing ?? 0,
        duration: options.reducedMotion ? 0 : (flyOptions.duration ?? 1800), essential: true });
      return true;
    },
    flyToHub,
    flyToAttraction,
    playRoutePreview,
    setFollow(value) {
      if (Boolean(value) !== follow) {
        followCameraInitialized = false;
        lastFollowDistance = null;
      }
      follow = Boolean(value);
      if (follow) syncFollowCamera();
      else {
        delete containerElement.dataset.followCamera;
        delete containerElement.dataset.followTrainVisible;
      }
      return follow;
    },
    setCinematic(value) { cinematic = Boolean(value); map.easeTo({ pitch: cinematic && !options.reducedMotion ? 52 : 0, duration: options.reducedMotion ? 0 : 700 }); return cinematic; },
    getState() { return { basemap: activeStyle, preferredOnlineStyle, follow, cinematic, distanceMetres, bearing: trainBearing, position: lastPosition && [...lastPosition] }; },
    resize() { map.resize(); },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(previewFrame);
      cancelAnimationFrame(trainFrame);
      globalThis.removeEventListener?.('online', onlineHandler);
      globalThis.removeEventListener?.('offline', offlineHandler);
      map.remove();
    },
  };
}
