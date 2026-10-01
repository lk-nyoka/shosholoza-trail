import { supabase } from './supabase';

// Attaches the current Supabase session token so the Worker can verify who's
// calling and what role they have. Guests never had a Supabase session, so
// this silently falls back to a plain fetch for them - it never blocks a
// request just because no one is signed in.
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
