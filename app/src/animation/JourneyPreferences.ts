export type JourneyPreferences = { view: 'side' | 'follow' | 'wide' | 'window'; time: 'dawn' | 'day' | 'dusk' | 'night'; quality: 'balanced' | 'light'; side: -1 | 1; labels: boolean };
export const PREFERENCES_KEY = 'shosholoza.pretoria.view.v1';
export const DEFAULT_PREFERENCES: JourneyPreferences = { view: 'side', time: 'day', quality: 'balanced', side: -1, labels: true };
export function readJourneyPreferences(raw: string | null): JourneyPreferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES };
    return { view: ['side','follow','wide','window'].includes(value.view) ? value.view : 'side', time: ['dawn','day','dusk','night'].includes(value.time) ? value.time : 'day', quality: value.quality === 'light' ? 'light' : 'balanced', side: value.side === 1 ? 1 : -1, labels: value.labels !== false };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function routePositionFromSearch(search: string, end: number): number | null {
  const raw = new URLSearchParams(search).get('position');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(end, value)) : null;
}
