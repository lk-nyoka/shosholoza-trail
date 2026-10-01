// Imhof-style relief treatment for the ride.
//
// Raw satellite at grazing angle is visual noise: a 200 km Karoo transit reads as
// smeared mud and the terrain has no form. The Swiss shaded-relief tradition
// (Eduard Imhof) solves exactly this — warm hillshading over a desaturated ground,
// with an atmospheric colour shift by elevation.
//
// The hypsometric ramp below is built from this corridor's real elevations, so the
// colour of the haze tells a passenger where in South Africa they are.

import SunCalc from 'suncalc';

type PaintMap = {
  getLayer(id: string): unknown;
  setPaintProperty(layer: string, name: string, value: unknown): void;
  addLayer(layer: Record<string, unknown>, beforeId?: string): void;
  getSource(id: string): unknown;
  setSky(sky: Record<string, unknown>): void;
};

const RELIEF_LAYER = 'imhof-relief';

/** South African hypsometric bands for the Pretoria–Cape Town corridor. */
const BANDS = [
  { maxMetres: 200, name: 'Cape lowlands', sky: '#7fa8cf', horizon: '#cfd8bd', fog: '#aebb9c' },
  { maxMetres: 500, name: 'Breede valley', sky: '#84acc9', horizon: '#d6d3a9', fog: '#a8ac86' },
  { maxMetres: 1000, name: 'Karoo approach', sky: '#8fb4cc', horizon: '#e6c79a', fog: '#c2a179' },
  { maxMetres: 1400, name: 'Karoo plateau', sky: '#93b6c6', horizon: '#eec189', fog: '#c9976a' },
  { maxMetres: 1700, name: 'Highveld', sky: '#9dbcd0', horizon: '#e8cb95', fog: '#c9a86a' },
  { maxMetres: Infinity, name: 'Escarpment', sky: '#8fb0c8', horizon: '#dcbe93', fog: '#a88a63' },
];

export function bandForElevation(metres: number) {
  return BANDS.find(b => metres <= b.maxMetres) ?? BANDS[BANDS.length - 1];
}

const GROUND_RAMP = ['#6b7f5e', '#8a9463', '#b08a5c', '#c08a5a', '#c9a86a', '#8c6b4a'];

/** The 1.5 km approach resolves into unfiltered imagery at the 4 km hub boundary. */
export function satelliteOpacity(distanceToHubMetres: number) {
  const fraction = Math.max(0, Math.min(1, (5500 - distanceToHubMetres) / 1500));
  return fraction * fraction * (3 - 2 * fraction);
}

/** SunCalc's south-origin radians become MapLibre's north-origin compass degrees. */
export function sunAzimuthAt(latitude: number, longitude: number, date: Date) {
  return (SunCalc.getPosition(date, latitude, longitude).azimuth * 180 / Math.PI + 180 + 360) % 360;
}

/** Golden-hour time is computed for the actual coordinate and today's date. */
export function sunlightAt(latitude: number, longitude: number, period = 'dusk', date = new Date()) {
  const times = SunCalc.getTimes(date, latitude, longitude);
  const instant = period === 'dawn' ? times.goldenHourEnd : period === 'midday' ? times.solarNoon
    : period === 'night' ? times.night : times.goldenHour;
  return sunAzimuthAt(latitude, longitude, Number.isFinite(instant?.getTime()) ? instant : date);
}

export function applySatelliteZone(map: PaintMap, distanceToHubMetres: number) {
  const opacity = satelliteOpacity(distanceToHubMetres);
  for (const id of ['satellite-raster', 'hybrid-imagery']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'raster-opacity', opacity);
    map.setPaintProperty(id, 'raster-opacity-transition', { duration: 700 });
    map.setPaintProperty(id, 'raster-saturation', opacity === 1 ? 0 : -0.32 * (1 - opacity));
  }
  // In transit, readable cartographic landcover replaces grazing-angle photography.
  for (const id of ['ride-landuse', 'ride-landcover']) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', 0.5 - opacity * 0.37);
  }
  return opacity;
}

/**
 * Desaturate the imagery so landform, the gold route and 3D objects read, then lay
 * warm hillshading over it. Safe to call before every layer exists.
 */
export function applyImhofRelief(map: PaintMap) {
  // Pull the colour out of the ground. The route line becomes the brightest thing.
  for (const id of ['satellite-raster', 'hybrid-imagery', 'streets-raster', 'outdoor-raster']) {
    if (!map.getLayer(id)) continue;
    try {
      map.setPaintProperty(id, 'raster-saturation', -0.32);
      map.setPaintProperty(id, 'raster-contrast', 0.04);
      map.setPaintProperty(id, 'raster-brightness-max', 1);
    } catch { /* Style may still be settling; relief still applies. */ }
  }

  if (map.getLayer(RELIEF_LAYER) || !map.getSource('elevation')) return;

  try {
    map.addLayer({
      id: RELIEF_LAYER,
      type: 'hillshade',
      source: 'elevation',
      paint: {
        // Warm shadow, never grey — this is the whole Imhof trick.
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': '#4a3b2a',
        'hillshade-highlight-color': '#fff2d8',
        'hillshade-accent-color': '#8a6f4e',
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map',
      },
    }, map.getLayer('ride-track') ? 'ride-track' : undefined);
  } catch { /* Hillshade is an enhancement, never a hard dependency. */ }
}

/**
 * Shift the atmosphere to the hypsometric band for the camera's current ground
 * height, and swing the hillshade sun with the time of day.
 */
export function applyElevationPalette(map: PaintMap, elevationMetres: number, sunAzimuth?: number, period = 'dusk') {
  const band = bandForElevation(Number.isFinite(elevationMetres) ? elevationMetres : 1200);
  if (map.getLayer('canvas')) map.setPaintProperty('canvas', 'background-color', GROUND_RAMP[BANDS.indexOf(band)]);
  try {
    map.setSky({
      'sky-color': period === 'night' ? '#070d18' : period === 'dusk' || period === 'dawn' ? '#7893a7' : band.sky,
      'sky-horizon-blend': 0.62,
      'horizon-color': period === 'night' ? '#16202f' : band.horizon,
      'horizon-fog-blend': 0.58,
      'fog-color': period === 'night' ? '#0d1420' : band.fog,
      // Karoo haze: enough distance to feel like air, not enough to hide the track.
      'fog-ground-blend': 0.24,
    });
  } catch { /* setSky is unavailable on very old styles. */ }

  if (Number.isFinite(sunAzimuth) && map.getLayer(RELIEF_LAYER)) {
    try {
      map.setPaintProperty(RELIEF_LAYER, 'hillshade-illumination-direction', sunAzimuth);
    } catch { /* Non-fatal. */ }
  }
  return band;
}
