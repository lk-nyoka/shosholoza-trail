/**
 * Who the passenger is, without asking them who they are.
 *
 * Signing in is the fastest way to lose someone who just wants to know when
 * the train gets to Beaufort West. So the passenger is signed in anonymously:
 * the database gets a real user row to hang a trip and a reservation off, and
 * the passenger gets no form, no password and no email. If they later want
 * their journey on a second phone, that same anonymous account can be upgraded
 * to a real one without losing anything.
 *
 * Anonymous sign-in must be enabled in the Supabase dashboard under
 * Authentication → Sign In / Providers. If it is not, this fails quietly and
 * the app stays device-local, which is exactly what it did before.
 */
import { backend, online } from "./client";

let inFlight: Promise<string | null> | null = null;
let cachedId: string | null = null;

export function currentUserId(): string | null {
  return cachedId;
}

export async function ensureSession(): Promise<string | null> {
  if (cachedId) return cachedId;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const db = await backend();
    if (!db) return null;

    const { data: existing } = await db.auth.getSession();
    if (existing.session?.user?.id) {
      cachedId = existing.session.user.id;
      return cachedId;
    }

    // No point attempting a round trip we know will fail.
    if (!online()) return null;

    const { data, error } = await db.auth.signInAnonymously();
    if (error || !data.user) return null;
    cachedId = data.user.id;
    return cachedId;
  })()
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
