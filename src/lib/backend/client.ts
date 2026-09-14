/**
 * The connection to the backend, and the decision not to need one.
 *
 * This app was built to work on a train in the Karoo, which means the network
 * is a bonus and never a dependency. So the rule here is absolute: if no
 * backend is configured, or it cannot be reached, every screen must behave
 * exactly as it did before one existed. Nothing in the ride, the map, the
 * walking times or the saved trip may wait on a request.
 *
 * The client is imported dynamically so that a build with no backend
 * configured does not carry the library at all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Whether this build has somewhere to talk to. The anon key is a public,
 * row-level-security-scoped credential and belongs in the bundle; the service
 * role key must never appear in this repository at all.
 */
export const backendConfigured = Boolean(URL && KEY);

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function backend(): Promise<SupabaseClient | null> {
  if (!backendConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(URL!, KEY!, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: "st.auth.v1",
          },
          global: { headers: { "x-application-name": "shosholoza-trail" } },
        }),
      )
      .catch(() => null);
  }
  return clientPromise;
}

/**
 * Run something against the backend, and shrug if it is not there.
 *
 * Every call site in this app is written as "try this, carry on regardless",
 * which is the only shape that survives a tunnel.
 */
export async function withBackend<T>(
  fn: (db: SupabaseClient) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const db = await backend();
    if (!db) return fallback;
    return await fn(db);
  } catch {
    return fallback;
  }
}

export const online = (): boolean =>
  typeof navigator === "undefined" ? true : navigator.onLine !== false;
