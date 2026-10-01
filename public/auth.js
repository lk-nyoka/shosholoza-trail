(() => {
  const SUPABASE_URL = 'https://qchbcokqfsclivvchquj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pejVtkb2GZlifbS1FGr_5g_Qbb4d2jg';
  const GUEST_KEY = 'shosholoza_guest';

  const gate = document.getElementById('auth-gate');
  const shell = document.getElementById('app-shell');
  const googleButton = document.getElementById('google-sign-in');
  const guestButton = document.getElementById('guest-sign-in');
  const authError = document.getElementById('auth-error');
  const accountControl = document.getElementById('account-control');

  let client = null;

  function setError(message = '') {
    if (authError) authError.textContent = message;
  }

  function displayName(user) {
    return user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || user?.email?.split('@')[0]
      || 'Traveller';
  }

  function initialFor(value) {
    return String(value || 'T').trim().charAt(0).toUpperCase() || 'T';
  }

  function renderAccount({ user = null, guest = false } = {}) {
    if (!accountControl) return;
    accountControl.replaceChildren();

    const chip = document.createElement('div');
    chip.className = 'account-chip';

    const avatar = document.createElement('span');
    avatar.className = 'account-avatar';

    const copy = document.createElement('span');
    copy.className = 'account-copy';

    const name = document.createElement('strong');
    const detail = document.createElement('small');

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'account-action secondary';

    if (user) {
      const label = displayName(user);
      avatar.textContent = initialFor(label);
      name.textContent = label;
      detail.textContent = user.email || 'Signed in';
      action.textContent = 'Sign out';
      action.addEventListener('click', async () => {
        action.disabled = true;
        try {
          const { error } = await client.auth.signOut();
          if (error) throw error;
          localStorage.removeItem(GUEST_KEY);
          showGate();
        } catch (error) {
          action.disabled = false;
          setError(error?.message || 'Could not sign out. Please try again.');
        }
      });
    } else if (guest) {
      avatar.textContent = 'G';
      name.textContent = 'Guest';
      detail.textContent = 'Progress stays on this device';
      action.textContent = 'Sign in';
      action.addEventListener('click', () => {
        localStorage.removeItem(GUEST_KEY);
        showGate();
      });
    }

    copy.append(name, detail);
    chip.append(avatar, copy, action);
    accountControl.append(chip);
  }

  function showApp({ user = null, guest = false } = {}) {
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    document.body.classList.remove('auth-pending');
    document.documentElement.dataset.authReady = 'true';
    renderAccount({ user, guest });
    setError();
  }

  function showGate() {
    if (gate) gate.hidden = false;
    if (shell) shell.hidden = true;
    document.body.classList.remove('low-power');
    document.body.classList.add('auth-pending');
    document.documentElement.dataset.authReady = 'true';
    setError();
    googleButton?.focus({ preventScroll: true });
  }

  async function signInWithGoogle() {
    setError();
    if (!navigator.onLine) {
      setError('Google sign-in needs an internet connection. You can still explore as a guest.');
      return;
    }
    if (!client) {
      setError('Sign-in is temporarily unavailable. You can still explore as a guest.');
      return;
    }

    googleButton.disabled = true;
    const original = googleButton.textContent;
    googleButton.textContent = 'Opening Google…';

    try {
      localStorage.removeItem(GUEST_KEY);
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (error) {
      googleButton.disabled = false;
      googleButton.textContent = original;
      setError(error?.message || 'Google sign-in could not start. Please try again.');
    }
  }

  function continueAsGuest() {
    localStorage.setItem(GUEST_KEY, '1');
    showApp({ guest: true });
  }

  async function initialise() {
    googleButton?.addEventListener('click', signInWithGoogle);
    guestButton?.addEventListener('click', continueAsGuest);

    if (!window.supabase?.createClient) {
      if (localStorage.getItem(GUEST_KEY) === '1') showApp({ guest: true });
      else {
        showGate();
        setError(navigator.onLine
          ? 'Account sign-in is temporarily unavailable. Guest exploration still works.'
          : 'You are offline. Guest exploration still works with an installed journey pack.');
      }
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        localStorage.removeItem(GUEST_KEY);
        showApp({ user: data.session.user });
      } else if (localStorage.getItem(GUEST_KEY) === '1') {
        showApp({ guest: true });
      } else {
        showGate();
      }

      client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          localStorage.removeItem(GUEST_KEY);
          showApp({ user: session.user });
        }
      });
    } catch (error) {
      if (localStorage.getItem(GUEST_KEY) === '1') showApp({ guest: true });
      else {
        showGate();
        setError('We could not check your account session. You can continue as a guest.');
      }
    }
  }

  window.ShosholozaAuth = {
    getClient: () => client,
    isGuest: () => localStorage.getItem(GUEST_KEY) === '1',
    showGate,
  };

  initialise();
})();