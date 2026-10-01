import { ApiError, bearerJwt, type BackendEnv } from './backend.ts';

export interface VerifiedSession { sub: string; email: string | null; role: string }

interface Jwk { kid?: string; kty: string; [key: string]: unknown }

const INVALID = () => new ApiError(401, 'A valid session is required');

function base64UrlToBytes(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlToJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

// Supabase's own public signing key rarely rotates; caching it avoids a
// network round-trip on every authenticated request. Per-isolate only -
// Workers don't share memory across isolates, so this is a latency
// optimization, not something correctness depends on.
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(env: BackendEnv, upstream: typeof fetch): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  if (!env.SUPABASE_URL) throw new ApiError(503, 'Sign-in verification is not configured.');
  const response = await upstream(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!response.ok) throw new ApiError(503, 'Sign-in verification is temporarily unavailable.');
  const data = await response.json() as { keys: Jwk[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

// Verifies a Supabase-issued session JWT directly against Supabase's own
// public key (ES256) - no shared secret to configure, leak, or rotate.
// Supabase remains the source of truth for identity and role
// (app_metadata.role, settable only via the Supabase dashboard/Admin API,
// never by the client); this only confirms the token is genuinely theirs
// and reads the role out of it.
export async function verifySupabaseSession(request: Request, env: BackendEnv, upstream: typeof fetch = fetch): Promise<VerifiedSession> {
  const token = bearerJwt(request);
  const [headerSeg, payloadSeg, signatureSeg] = token.split('.');
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = base64UrlToJson(headerSeg);
    payload = base64UrlToJson(payloadSeg);
  } catch { throw INVALID(); }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') throw INVALID();

  const keys = await fetchJwks(env, upstream);
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw INVALID();

  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { throw INVALID(); }

  // Web Crypto's ECDSA signatures are raw r||s bytes - exactly the format
  // JWS ES256 uses, so no DER conversion is needed here.
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64UrlToBytes(signatureSeg) as BufferSource,
    new TextEncoder().encode(`${headerSeg}.${payloadSeg}`) as BufferSource,
  );
  if (!valid) throw INVALID();

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  if (payload.aud !== 'authenticated') throw INVALID();
  if (payload.iss !== `${env.SUPABASE_URL}/auth/v1`) throw INVALID();
  if (typeof payload.sub !== 'string') throw INVALID();

  const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
  const role = typeof appMetadata?.role === 'string' ? appMetadata.role : 'passenger';
  return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : null, role };
}

export async function requireAdmin(request: Request, env: BackendEnv, upstream: typeof fetch = fetch): Promise<VerifiedSession> {
  const session = await verifySupabaseSession(request, env, upstream);
  if (session.role !== 'admin') throw new ApiError(403, 'Admin role required');
  return session;
}
