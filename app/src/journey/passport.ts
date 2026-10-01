// The Rail Passport: which chapters the traveller has actually finished.
//
// Kept apart from ChapterNavigation, which records only the last chapter
// opened: opening a chapter is not finishing it. A chapter calls
// markChapterComplete() when its own story ends; the Journey and Passport
// pages read the stamps. Stored per browser; nothing leaves the device.

export const PASSPORT_KEY = 'shosholoza:passport:v1';
/** The key ChapterNavigation writes when a chapter is opened. */
export const LAST_OPENED_KEY = 'shosholoza:chapter-navigation:v1';

export type Stamp = { id: string; at: string };

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function readStamps(store: Store | null = defaultStore()): Stamp[] {
  try {
    const parsed = JSON.parse(store?.getItem(PASSPORT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is Stamp => typeof s?.id === 'string' && typeof s?.at === 'string') : [];
  } catch {
    return [];
  }
}

/** Record a finished chapter. Idempotent: the first stamp's date is kept. */
export function markChapterComplete(id: string, store: Store | null = defaultStore(), now = new Date()): Stamp[] {
  const stamps = readStamps(store);
  if (stamps.some(stamp => stamp.id === id)) return stamps;
  const next = [...stamps, { id, at: now.toISOString() }];
  try { store?.setItem(PASSPORT_KEY, JSON.stringify(next)); } catch { /* private mode: the stamp lasts this page only */ }
  try { globalThis.dispatchEvent?.(new CustomEvent('shosholoza:passport', { detail: next })); } catch { /* no DOM */ }
  return next;
}

export function hasStamp(id: string, store: Store | null = defaultStore()) {
  return readStamps(store).some(stamp => stamp.id === id);
}

/** The id of the chapter opened most recently, if any. */
export function lastOpenedChapter(store: Store | null = defaultStore()): string | null {
  try {
    const parsed = JSON.parse(store?.getItem(LAST_OPENED_KEY) ?? 'null');
    return typeof parsed?.last === 'string' ? parsed.last : null;
  } catch {
    return null;
  }
}
