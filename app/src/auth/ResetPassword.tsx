import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AUTH_DESTINATION, supabase } from './supabase';
import { logAuthEvent } from './activity';

export function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session?.user));
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      void logAuthEvent('password-reset-completed', data.user?.email);
      navigate(AUTH_DESTINATION, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-start" data-auth-checking={checking}>
    <div className="auth-start-photo" aria-hidden="true"><img src="/assets/photos/hero-train.webp" alt="" /></div>
    <div className="auth-start-shade" />
    <section className="auth-start-story" aria-labelledby="reset-title">
      <a className="auth-start-brand" href="/" aria-label="Shosholoza Trail home"><span>ST</span>Shosholoza Trail</a>
      <div className="auth-start-copy">
        <p className="eyebrow">Pretoria → Cape Town · Eight connected places</p>
        <h1 id="reset-title">Travel the line.<br/><em>Keep the moments.</em></h1>
      </div>
    </section>
    <section className="auth-start-card" aria-label="Set a new password">
      {checking ? <div className="auth-checking" role="status">Checking your link…</div> : !hasSession ? <>
        <p className="eyebrow">Reset your password</p>
        <h2>This link has expired.</h2>
        <p className="auth-start-intro">Request a new password reset link from the sign-in page.</p>
        <a className="auth-submit" href="/login">Back to sign in</a>
      </> : <>
        <p className="eyebrow">Reset your password</p>
        <h2>Choose a new password.</h2>
        <p className="auth-start-intro">This replaces your current password immediately.</p>
        <form onSubmit={event => void submit(event)}>
          <div className="auth-field"><label htmlFor="reset-password"><LockKeyhole/>New password</label><div className="auth-password"><input id="reset-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></div>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : <>Set new password <ArrowRight/></>}</button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </>}
    </section>
  </main>;
}
