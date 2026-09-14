/**
 * Deleting everything this app has put on the phone.
 *
 * POPIA gives a person the right to have their information deleted. In a build
 * where everything lives on their own device, honouring that right should be a
 * button, not an email — telling somebody to "clear the site data in your
 * browser settings" is technically an answer and practically a refusal.
 *
 * This removes the trip, the passenger details, the reservations, the consent
 * record, the pending outbox and every cached photograph and map tile. It is
 * not reversible and it does not ask twice after the confirmation, because a
 * deletion control that leaves something behind is worse than none.
 */

/** Everything this app writes under its own key prefix. */
const PREFIXES = ["st."];

export interface EraseResult {
  keysRemoved: number;
  cachesRemoved: number;
  storageFreedMb: number | null;
}

async function usedMb(): Promise<number | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage } = await navigator.storage.estimate();
    return usage ? Math.round((usage / 1024 / 1024) * 10) / 10 : 0;
  } catch {
    return null;
  }
}

export async function eraseEverything(): Promise<EraseResult> {
  const before = await usedMb();
  let keysRemoved = 0;
  let cachesRemoved = 0;

  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of Object.keys(store)) {
        if (PREFIXES.some(prefix => key.startsWith(prefix))) {
          store.removeItem(key);
          keysRemoved += 1;
        }
      }
    } catch {
      /* a browser with storage blocked has nothing to erase */
    }
  }

  try {
    if ("caches" in window) {
      for (const name of await caches.keys()) {
        if (await caches.delete(name)) cachesRemoved += 1;
      }
    }
  } catch {
    /* best effort */
  }

  const after = await usedMb();
  return {
    keysRemoved,
    cachesRemoved,
    storageFreedMb: before !== null && after !== null ? Math.max(0, Math.round((before - after) * 10) / 10) : null,
  };
}
