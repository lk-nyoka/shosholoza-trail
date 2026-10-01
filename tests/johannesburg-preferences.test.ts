import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, savePreferences } from '../app/src/animation/cities/johannesburg/Preferences.ts';
test('view preferences validate saved values and survive inaccessible storage', () => {
  assert.deepEqual(readPreferences({ getItem: () => '{"quality":"light","night":true}' }), { quality: 'light', night: true });
  for (const value of ['null', '{', '{"quality":"ultra","night":"true"}']) assert.deepEqual(readPreferences({ getItem: () => value }), { quality: 'balanced', night: false });
  assert.doesNotThrow(() => savePreferences({ setItem() { throw new Error('blocked'); } }, { quality: 'light', night: false }));
});
