// Best-effort only: a logging failure must never block the real auth flow,
// which is fully handled by Supabase regardless of whether this call succeeds.
export async function logAuthEvent(event: string, email: string | null | undefined) {
  try {
    await fetch('/api/auth/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, email: email ?? null }),
    });
  } catch {
    // ignored
  }
}
