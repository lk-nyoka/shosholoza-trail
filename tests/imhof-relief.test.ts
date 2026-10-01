import test from 'node:test';
import assert from 'node:assert/strict';
import { satelliteOpacity, sunlightAt, applySatelliteZone, bandForElevation } from '../app/src/imhof-relief.ts';
// @ts-expect-error The shared browser module is intentionally authored as ESM JavaScript.
import { createBasemapStyles } from '../public/map/immersive-map.js';

type StyleDefinition = {
  online: boolean;
  style: {
    sources: Record<string, { type?: string }>;
    layers: Array<{ id: string; type?: string; paint: Record<string, unknown> }>;
  };
};

test('satellite resolves at hubs and disappears across a continuous 1.5 km approach', () => {
  assert.equal(satelliteOpacity(4000), 1);
  assert.equal(satelliteOpacity(5500), 0);
  assert.equal(satelliteOpacity(4750), 0.5);
  assert.equal(satelliteOpacity(200000), 0);
  const paints = new Map();
  const map = { getLayer: () => true, setPaintProperty: (id: string, name: string, value: unknown) => paints.set(`${id}:${name}`, value) };
  applySatelliteZone(map as never, 2000);
  assert.equal(paints.get('satellite-raster:raster-saturation'), 0);
  applySatelliteZone(map as never, 15000);
  assert.equal(paints.get('satellite-raster:raster-opacity'), 0);
});

test('solar illumination uses real golden-hour compass direction for the corridor', () => {
  const date = new Date('2026-09-08T12:00:00Z');
  for (const [lat, lon] of [[-25.75, 28.2], [-33.92, 18.42]]) {
    const evening = sunlightAt(lat, lon, 'dusk', date);
    const morning = sunlightAt(lat, lon, 'dawn', date);
    assert.ok(evening > 240 && evening < 300, `${evening} should point west`);
    assert.ok(morning > 60 && morning < 120, `${morning} should point east`);
  }
  assert.equal(bandForElevation(1300).name, 'Karoo plateau');
  assert.equal(bandForElevation(80).name, 'Cape lowlands');
});

test('every online basemap includes warm DEM relief and satellite has vector ground underneath', () => {
  const styles = createBasemapStyles() as Record<string, StyleDefinition>;
  for (const definition of Object.values(styles)) {
    if (!definition.online) continue;
    assert.equal(definition.style.sources.elevation.type, 'raster-dem');
    const relief = definition.style.layers.find(layer => layer.id === 'imhof-relief');
    if (!relief) throw new Error('online basemap is missing Imhof relief');
    assert.equal(relief.paint['hillshade-shadow-color'], '#4a3b2a');
    assert.equal(relief.paint['hillshade-illumination-anchor'], 'map');
  }
  const ids = styles.satellite.style.layers.map(layer => layer.id);
  assert.ok(ids.indexOf('relief-landcover') < ids.indexOf('satellite-raster'));
});
