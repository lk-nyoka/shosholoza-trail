import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { authedFetch } from '../auth/apiFetch';
import './Admin.css';

type Me = { sub: string; email: string | null; role: string };
type Contribution = { id: string; title: string; text: string; source_url: string; credit: string; status: string };
type ActivityEvent = { id: string; event: string; actor: string | null; created_at: number };

export function Admin() {
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'forbidden' | 'ready'>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<Contribution[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    const meResponse = await authedFetch('/api/me');
    if (meResponse.status === 401) { setStatus('unauthenticated'); return; }
    const meData = await meResponse.json() as Me;
    setMe(meData);
    if (meData.role !== 'admin') { setStatus('forbidden'); return; }
    const [queueResponse, activityResponse] = await Promise.all([authedFetch('/api/moderation'), authedFetch('/api/moderation/activity')]);
    if (queueResponse.ok) setPending((await queueResponse.json() as { contributions: Contribution[] }).contributions.filter(c => c.status === 'pending'));
    if (activityResponse.ok) setActivity((await activityResponse.json() as { events: ActivityEvent[] }).events);
    setStatus('ready');
  }

  useEffect(() => { void load(); }, []);

  async function review(id: string, decision: 'approve' | 'reject') {
    setError('');
    if (decision === 'approve' && !confirm('Confirm the source and permission/rights have been verified before approving.')) return;
    setBusyId(id);
    try {
      const response = await authedFetch('/api/moderation/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, reviewNote: decision === 'approve' ? 'Approved via admin page.' : 'Rejected via admin page.', rightsConfirmed: decision === 'approve' }),
      });
      if (!response.ok) throw new Error((await response.json() as { error: string }).error);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this contribution.');
    } finally {
      setBusyId('');
    }
  }

  async function publish() {
    setError('');
    try {
      const response = await authedFetch('/api/moderation/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error((await response.json() as { error: string }).error);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not publish.');
    }
  }

  if (status === 'loading') return <main className="admin-page light-page"><SiteHeader/><p className="admin-status">Checking your access…</p></main>;
  if (status === 'unauthenticated') return <main className="admin-page light-page"><SiteHeader/><div className="admin-status"><p>Sign in to continue.</p><Link className="primary-btn" to="/login">Sign in</Link></div></main>;
  if (status === 'forbidden') return <main className="admin-page light-page"><SiteHeader/><div className="admin-status"><p>This page is for admins only.</p><Link className="text-link" to="/home">Back to home</Link></div></main>;

  return <main className="admin-page light-page">
    <SiteHeader/>
    <div className="content-page narrow">
      <p className="eyebrow">Signed in as {me?.email ?? me?.sub}</p>
      <h1>Admin</h1>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <section>
        <h2>Moderation queue · {pending.length} pending</h2>
        {pending.length === 0 && <p className="intro">Nothing waiting for review.</p>}
        <ul className="admin-list">
          {pending.map(c => <li key={c.id}>
            <div>
              <strong>{c.title}</strong>
              <p>{c.text}</p>
              <small><a href={c.source_url} target="_blank" rel="noreferrer">{c.source_url}</a> · {c.credit}</small>
            </div>
            <div className="admin-actions">
              <button className="primary-btn" disabled={busyId === c.id} onClick={() => void review(c.id, 'approve')}>Approve</button>
              <button className="ghost-btn" disabled={busyId === c.id} onClick={() => void review(c.id, 'reject')}>Reject</button>
            </div>
          </li>)}
        </ul>
        <button className="text-link" type="button" onClick={() => void publish()}>Publish approved supplement</button>
      </section>
      <section>
        <h2>Audit log</h2>
        <ul className="admin-list admin-activity">
          {activity.map(event => <li key={event.id}>
            <strong>{event.event}</strong>
            <span>{event.actor ?? '—'}</span>
            <small>{new Date(event.created_at).toLocaleString()}</small>
          </li>)}
        </ul>
      </section>
    </div>
  </main>;
}
