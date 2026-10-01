import { ApiError, body, database, field, hash, json, logActivity, method, quota, type BackendEnv } from '../backend.ts';

const EVENTS = new Set(['signup', 'login', 'password-reset-requested', 'password-reset-completed', 'verification-resent']);

// The client self-reports these events after a Supabase auth call succeeds.
// Supabase remains the real auth authority; this is an audit trail, not an
// access-control mechanism, so a forged entry here cannot grant real access.
export async function authActivity(request: Request, env: BackendEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/auth/activity') throw new ApiError(404, 'Endpoint not found');
  method(request, 'POST');
  const db = database(env);
  const ipHash = await hash(request.headers.get('CF-Connecting-IP') || 'local-unidentified');
  await quota(db, `auth-activity:${ipHash}`, 30, 300);
  const data = await body(request, ['event', 'email']);
  const event = field(data.event, 'event', 40);
  if (!EVENTS.has(event)) throw new ApiError(400, 'Unknown event');
  const email = typeof data.email === 'string' && data.email.trim() ? field(data.email, 'email', 200) : null;
  await logActivity(db, event, email, null, null, ipHash);
  return json({ logged: true });
}
