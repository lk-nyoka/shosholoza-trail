import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearingBetween, createBasemapStyles, haversineMetres, selectionAreaFeature, sliceLineAtDistance, smoothBearing } from '../public/map/immersive-map.js';

const route = {
  type: 'Feature',
  properties: { lengthMetres: 222390 },
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] },
};

test('slices route at an engine distance without changing the source geometry', () => {
  const before = structuredClone(route);
  const result = sliceLineAtDistance(route, route.properties.lengthMetres / 2);
  assert.deepEqual(result[0], [0, 0]);
  assert.ok(Math.abs(result.at(-1)[0] - 1) < 0.01);
  assert.deepEqual(route, before);
});

test('bearing follows movement and smoothing crosses north by the short path', () => {
  assert.ok(Math.abs(bearingBetween([0, 0], [1, 0]) - 90) < 0.001);
  const value = smoothBearing(350, 10, 0.5);
  assert.ok(value < 1 || value > 359);
});

test('haversine distance is realistic for one degree at the equator', () => {
  assert.ok(Math.abs(haversineMetres([0, 0], [1, 0]) - 111195) < 100);
});

test('selected places only outline real polygon geometry', () => {
  const geometry = { type: 'Polygon', coordinates: [[[28, -26], [28.2, -26], [28.2, -25.8], [28, -26]]] };
  const exact = selectionAreaFeature({ name: 'Johannesburg', lon: 28.05, lat: -26.2, geometry });
  assert.deepEqual(exact.geometry, geometry);
  assert.equal(exact.properties.approximation, false);

  const bbox = selectionAreaFeature({ name: 'Kimberley', lon: 24.76, lat: -28.74, bbox: [24.6, -28.9, 24.9, -28.6] });
  assert.equal(bbox, null);
  assert.equal(selectionAreaFeature({ name: 'De Aar', lon: 24.01, lat: -30.65, stop: true }), null);
});

test('every rail stop ships an irregular sourced boundary instead of a generated circle', () => {
  const collection = JSON.parse(readFileSync(new URL('../public/data/location-boundaries.geojson', import.meta.url), 'utf8'));
  assert.deepEqual(collection.features.map(feature => feature.properties.id), [
    'pretoria', 'johannesburg', 'kimberley', 'de-aar', 'beaufort-west', 'matjiesfontein', 'worcester', 'cape-town',
  ]);
  for (const feature of collection.features) {
    assert.match(feature.properties.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/);
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
    const points = JSON.stringify(feature.geometry.coordinates).match(/\[-?\d/g)?.length ?? 0;
    assert.ok(points > 8, `${feature.properties.name} boundary was not detailed`);
  }
});

test('all requested basemaps exist and offline has no remote sources', () => {
  const styles = createBasemapStyles();
  assert.deepEqual(Object.keys(styles), ['streets', 'outdoor', 'satellite', 'hybrid', 'offline']);
  assert.deepEqual(styles.offline.style.sources, {});
  assert.match(styles.satellite.style.sources.base.tiles[0], /services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.equal(styles.satellite.maxUsefulZoom, 19);
  assert.equal(styles.satellite.style.metadata['shosholoza:provider'], 'esri-world-imagery');
  assert.match(styles.satellite.style.sources.base.attribution, /Esri.*Maxar.*GIS User Community/);
  assert.equal(styles.hybrid.style.sources.labels.url, 'https://tiles.openfreemap.org/planet');
  assert.match(styles.hybrid.style.glyphs, /tiles\.openfreemap\.org\/fonts/);
  assert.equal(styles.hybrid.style.layers.find(layer => layer.id === 'hybrid-imagery').paint['raster-saturation'], -0.32);
  assert.equal(styles.hybrid.style.layers.find(layer => layer.id === 'hybrid-place-labels').paint['text-opacity'], 0.72);
  assert.match(styles.streets.style.sources.base.attribution, /OpenStreetMap/);
});

test('the map has no Night style', () => {
  const styles = createBasemapStyles();
  assert.equal('dark' in styles, false);
  assert.equal(Object.values(styles).some(style => style.label === 'Night'), false);
});

test('runtime satellite config replaces the keyless fallback without embedding a key', () => {
  const styles = createBasemapStyles({ satelliteTiles: ['https://tiles.example/{z}/{x}/{y}.jpg'], satelliteAttribution: 'Example', satelliteMaxZoom: 16 });
  assert.deepEqual(styles.satellite.style.sources.base.tiles, ['https://tiles.example/{z}/{x}/{y}.jpg']);
  assert.equal(styles.satellite.maxUsefulZoom, 16);
  assert.equal(JSON.stringify(styles).includes('GEMINI'), false);
});

test('configured MapTiler tiles receive required provider attribution without persisting a credential', () => {
  const browserKey = ['public', 'browser', 'value'].join('-');
  const styles = createBasemapStyles({
    satelliteTiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${browserKey}`],
  });
  assert.match(styles.satellite.style.sources.base.attribution, /MapTiler/);
  assert.equal(styles.satellite.style.metadata['shosholoza:provider'], 'configured');
  assert.equal(styles.hybrid.style.layers.find(layer => layer.id === 'hybrid-place-labels').paint['text-opacity'], 0.72);
});
