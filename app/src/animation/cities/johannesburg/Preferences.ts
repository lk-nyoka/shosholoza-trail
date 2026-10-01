export type CityPreferences = { quality: 'balanced' | 'light'; night: boolean };
const KEY = 'shosholoza-johannesburg-view-v1';
export function readPreferences(storage: Pick<Storage, 'getItem'>): CityPreferences {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '{}');
    return { quality: value?.quality === 'light' ? 'light' : 'balanced', night: value?.night === true };
  } catch { return { quality: 'balanced', night: false }; }
}
export function savePreferences(storage: Pick<Storage, 'setItem'>, value: CityPreferences) {
  try { storage.setItem(KEY, JSON.stringify(value)); } catch { /* Private storage must not break the scene. */ }
}
