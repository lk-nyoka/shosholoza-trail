import test from 'node:test';
import assert from 'node:assert/strict';
import {readJourneyPreferences,DEFAULT_PREFERENCES,routePositionFromSearch} from '../app/src/animation/JourneyPreferences.ts';
test('preferences reject corrupt values and never auto-enable audio or motion',()=>{for(const raw of ['bad','null','[]','{"view":"teleport","time":"noon","quality":"ultra","side":8}'])assert.deepEqual(readJourneyPreferences(raw),DEFAULT_PREFERENCES);});
test('valid view preferences survive reload',()=>{const prefs={view:'window',time:'night',quality:'light',side:1,labels:false};assert.deepEqual(readJourneyPreferences(JSON.stringify(prefs)),prefs);});
test('shared route position is finite and clamped to the actual scene',()=>{assert.equal(routePositionFromSearch('?position=420',6300),420);assert.equal(routePositionFromSearch('?position=-12',6300),0);assert.equal(routePositionFromSearch('?position=9000',6300),6300);for(const q of ['','?position=','?position=NaN','?position=Infinity'])assert.equal(routePositionFromSearch(q,6300),null);});
