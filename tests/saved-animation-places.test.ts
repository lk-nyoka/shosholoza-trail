import test from 'node:test';
import assert from 'node:assert/strict';
import { itineraryGeoJSON, readSavedPlaces, itineraryText, savePlace } from '../app/src/animation/SavedPlaces.ts';
const place = {name:'Pretoria',kind:'Station',lon:28.18,lat:-25.75,alongMetres:0,offsetMetres:20,side:1};
test('saved places survive serialization without duplicate entries',()=>{const list=savePlace(savePlace([],place),{...place});assert.equal(list.length,1);assert.deepEqual(readSavedPlaces(JSON.stringify(list)),list);});
test('invalid or incompatible storage is discarded without breaking the scene',()=>{for(const raw of ['bad','null','{}','[null]',JSON.stringify([{...place,lat:100}])]) assert.deepEqual(readSavedPlaces(raw),[]);});
test('saved places are bounded to fifty records',()=>{let list=[] as typeof place[];for(let i=0;i<60;i++)list=savePlace(list,{...place,name:String(i)});assert.equal(list.length,50);assert.equal(list[0].name,'10');});

test('itinerary orders places by route distance without changing saved order',()=>{const later={...place,name:'Later',alongMetres:2000};const original=[later,place];const text=itineraryText(original);assert.ok(text.indexOf('1. Pretoria') < text.indexOf('2. Later'));assert.ok(text.includes('Coordinates: -25.75, 28.18'));assert.ok(text.includes('not a record of physical visits'));assert.equal(original[0],later);});

test('GeoJSON exports longitude before latitude and preserves source attribution',()=>{const data=itineraryGeoJSON([place]);assert.equal(data.type,'FeatureCollection');assert.deepEqual(data.features[0].geometry.coordinates,[28.18,-25.75]);assert.equal(data.features[0].properties.name,'Pretoria');assert.ok(data.attribution.includes('OpenStreetMap'));});
