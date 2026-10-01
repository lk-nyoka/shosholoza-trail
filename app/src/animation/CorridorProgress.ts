export const CORRIDOR_PROGRESS_KEY = 'shosholoza:gauteng-progress:v1';
export type CorridorProgress = { distance: number; rate: number };

export function readCorridorProgress(storage: Pick<Storage, 'getItem'>, search = ''): CorridorProgress {
  let saved: Partial<CorridorProgress> = {};
  try { saved = JSON.parse(storage.getItem(CORRIDOR_PROGRESS_KEY) ?? '{}') ?? {}; } catch { /* Storage is optional. */ }
  const position = new URLSearchParams(search).get('position');
  const candidate = position !== null ? Number(position) : saved.distance;
  return {
    distance: typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(0, Math.min(100000, candidate)) : 0,
    rate: [1, 4, 16].includes(saved.rate ?? 0) ? saved.rate! : 1,
  };
}

export function saveCorridorProgress(storage: Pick<Storage, 'setItem'>, progress: CorridorProgress) {
  try { storage.setItem(CORRIDOR_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Private browsing and full storage must not stop travel. */ }
}

export function corridorPhase(distance: number, length: number) {
  if (distance >= length - .1) return 'Arrived at Park Station';
  if (distance < 500) return 'Leaving Pretoria';
  if (length - distance < 1800) return 'Approaching Johannesburg';
  return 'Travelling to Johannesburg';
}
