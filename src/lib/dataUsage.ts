/**
 * How much this ride has actually cost in data.
 *
 * Half a gigabyte went out of somebody's account before anyone noticed, on a
 * product whose entire premise is that the people using it are crossing places
 * where data is expensive. A number nobody can see is a number nobody can
 * manage, so the scene reports every tile it fetches and the ride can show the
 * total and act on it.
 */

let bytes = 0;
let listeners = new Set<(mb: number) => void>();

/** Called by the tile loaders. Cheap on purpose. */
export function countBytes(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  bytes += n;
  const mb = Math.round((bytes / 1024 / 1024) * 10) / 10;
  for (const listener of listeners) listener(mb);
}

export const usedMb = (): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

export function onUsage(listener: (mb: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether to start in low-data mode.
 *
 * `saveData` is the browser telling us the person has asked their phone to be
 * careful with data, which is as close to consent as this gets. A 2g/3g
 * effectiveType says the same thing in a different way.
 */
export function shouldStartLowData(): boolean {
  try {
    const connection = (navigator as unknown as {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (!connection) return false;
    if (connection.saveData) return true;
    return connection.effectiveType === "2g" || connection.effectiveType === "slow-2g";
  } catch {
    return false;
  }
}

/** Above this the ride offers to drop the sharp rings by itself. */
export const NUDGE_AT_MB = 120;
