import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AUTH_DESTINATION, GUEST_STORAGE_KEY, authReturnUrl, supabase } from './supabase';
import { logAuthEvent } from './activity';

type Mode = 'signin' | 'signup' | 'forgot';

// UX feedback only - the real enforcement is Supabase's own server-side
// password policy (Authentication settings, configured in the dashboard),
// which checks this regardless of whether the client bothers to.
function passwordChecks(value: string) {
  return {
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
}

function returnedAuthError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return query.get('error_description') || hash.get('error_description') || '';
}

export function AuthStart() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(returnedAuthError);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const finish = (signedIn: boolean) => {
      if (!active) return;
      if (signedIn) localStorage.removeItem(GUEST_STORAGE_KEY);
      navigate(AUTH_DESTINATION, { replace: true });
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) finish(true);
      else if (localStorage.getItem(GUEST_STORAGE_KEY) === '1') finish(false);
      else setChecking(false);
    }).catch(() => active && setChecking(false));
    const { data: listener } = supabase.auth.onAuthStateChange((authEvent, session) => {
      if (session?.user) {
        // Only a real sign-in (not the passive initial session check, and not
        // a token refresh) should count as a login event.
        if (authEvent === 'SIGNED_IN') void logAuthEvent('login', session.user.email);
        finish(true);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  function chooseMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError('');
    setNotice('');
    localStorage.removeItem(GUEST_STORAGE_KEY);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authReturnUrl() },
    });
    if (authError) {
      setError(authError.message || 'Google sign-in could not start. Please try again.');
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (authError) throw authError;
        void logAuthEvent('password-reset-requested', email.trim());
        setNotice('Check your email for a link to reset your password.');
        return;
      }
      if (mode === 'signup') {
        const checks = passwordChecks(password);
        if (!Object.values(checks).every(Boolean)) {
          setError('Your password does not yet meet all the requirements below.');
          return;
        }
      }
      localStorage.removeItem(GUEST_STORAGE_KEY);
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authReturnUrl(),
            data: { full_name: name.trim() },
          },
        });
        if (authError) throw authError;
        void logAuthEvent('signup', email.trim());
        if (data.session?.user) navigate(AUTH_DESTINATION, { replace: true });
        else setNotice('Account created. Check your email to confirm it, then you will return to the home page.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        navigate(AUTH_DESTINATION, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function continueAsGuest() {
    localStorage.setItem(GUEST_STORAGE_KEY, '1');
    navigate(AUTH_DESTINATION, { replace: true });
  }

  return <main className="auth-start" data-auth-checking={checking}>
    <div className="auth-start-photo" aria-hidden="true"><img src="/assets/photos/hero-train.webp" alt="" /></div>
    <div className="auth-start-shade" />
    <section className="auth-start-story" aria-labelledby="auth-title">
      <a className="auth-start-brand" href="/" aria-label="Shosholoza Trail home"><span>ST</span>Shosholoza Trail</a>
      <div className="auth-start-copy">
        <p className="eyebrow">Pretoria → Cape Town · Eight connected places</p>
        <h1 id="auth-title">Travel the line.<br/><em>Keep the moments.</em></h1>
        <p>Follow the train across South Africa through animated places, changing landscapes and stories discovered along the route.</p>
        <ol aria-label="Featured journey stops"><li><b>01</b>Pretoria</li><li><b>02</b>Kimberley</li><li><b>03</b>Karoo</li><li><b>04</b>Cape Town</li></ol>
      </div>
    </section>
    <section className="auth-start-card" aria-label="Shosholoza Trail account">
      {checking ? <div className="auth-checking" role="status">Checking your journey…</div> : <>
        <p className="eyebrow">Start your journey</p>
        <h2>{mode === 'signup' ? 'Create your account.' : mode === 'forgot' ? 'Reset your password.' : 'Welcome aboard.'}</h2>
        <p className="auth-start-intro">{mode === 'signup' ? 'Create a traveller identity and return here after confirming your email.' : mode === 'forgot' ? "Enter your email and we'll send a link to reset your password." : 'Sign in to explore the journey from your home page.'}</p>
        {mode !== 'forgot' && <div className="auth-mode" role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => chooseMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => chooseMode('signup')}>Create account</button>
        </div>}
        {mode !== 'forgot' && <>
          <button className="auth-google" type="button" disabled={busy} onClick={() => void continueWithGoogle()}><span aria-hidden="true">G</span>Continue with Google</button>
          <div className="auth-divider"><span>or use email</span></div>
        </>}
        <form onSubmit={event => void submit(event)}>
          {mode === 'signup' && <div className="auth-field"><label htmlFor="auth-name"><UserRound/>Your name</label><input id="auth-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required placeholder="Traveller name" /></div>}
          <div className="auth-field"><label htmlFor="auth-email"><Mail/>Email address</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" /></div>
          {mode !== 'forgot' && <div className="auth-field"><label htmlFor="auth-password"><LockKeyhole/>Password</label><div className="auth-password"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={event => setPassword(event.target.value)} required placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff/> : <Eye/>}</button></div>
            {mode === 'signup' && <ul className="password-checklist" aria-label="Password requirements">
              {Object.entries(passwordChecks(password)).map(([key, met]) => <li key={key} data-met={met}><Check/>{{ length: 'At least 8 characters', upper: 'An uppercase letter', lower: 'A lowercase letter', number: 'A number', symbol: 'A symbol (e.g. ! ? # @)' }[key]}</li>)}
            </ul>}
          </div>}
          {mode === 'signin' && <button type="button" className="auth-forgot-link" onClick={() => chooseMode('forgot')}>Forgot your password?</button>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? <>Create account <ArrowRight/></> : mode === 'forgot' ? <>Send reset link <ArrowRight/></> : <>Sign in <ArrowRight/></>}</button>
        </form>
        {notice && <p className="auth-notice" role="status"><Check/>{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {mode === 'forgot' ? <button type="button" className="auth-forgot-link" onClick={() => chooseMode('signin')}>Back to sign in</button> : <>
          <div className="auth-divider"><span>or</span></div>
          <button className="auth-guest" type="button" disabled={busy} onClick={continueAsGuest}>Explore as guest</button>
          <p className="auth-privacy">Guest progress stays on this device. Authentication is handled securely by Supabase; Shosholoza Trail never receives your Google password.</p>
        </>}
      </>}
    </section>
  </main>;
}
