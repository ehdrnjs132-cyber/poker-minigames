// Google sign-in (Google Identity Services). Shown only when the server has a
// GOOGLE_CLIENT_ID. Signing in links this browser's profile to the Google
// account; signing in on another device opens that same profile and records.
(() => {
  const { socket, toast } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const $ = (s) => document.querySelector(s);
  const row = $('#googleRow');
  if (!row) return;
  let clientId = null;
  let gisReady = false;

  fetch('/config.json')
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg.googleClientId) return;
      clientId = cfg.googleClientId;
      row.hidden = false;
      const lg = document.getElementById('loginGoogle');
      if (lg) lg.hidden = false;
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => {
        google.accounts.id.initialize({ client_id: clientId, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
        gisReady = true;
        render();
      };
      document.head.appendChild(s);
    })
    .catch(() => {});

  function renderLoginButton() {
    const b = document.getElementById('loginGBtn');
    if (!b || !gisReady || b._rendered) return;
    b._rendered = true;
    google.accounts.id.renderButton(b, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', width: 280, locale: I18N.lang === 'ko' ? 'ko' : 'en' });
  }

  function render() {
    if (!clientId) return;
    renderLoginButton();
    const me = HA.profile();
    const status = $('#gStatus');
    const btn = $('#gBtn');
    if (me?.google) {
      status.innerHTML = `<span class="g-on">✓ ${t('me.googleOn')}</span><button class="btn ghost" id="gLogout">${t('me.googleLogout')}</button>`;
      btn.hidden = true;
      $('#gLogout').addEventListener('click', logout);
    } else {
      status.innerHTML = `<span class="g-hint">${t('me.googleHint')}</span>`;
      btn.hidden = false;
      if (gisReady && !btn._rendered) {
        btn._rendered = true;
        google.accounts.id.renderButton(btn, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: I18N.lang === 'ko' ? 'ko' : 'en' });
      }
    }
  }

  function onCredential(resp) {
    socket.emit('google:login', { credential: resp.credential }, (res) => {
      if (!res?.ok) return toast(t('me.googleFail'), 3500);
      if (res.token) HA.useCredentials(res.uid, res.token);
      HA.setProfile(res.user);
      toast(res.switched ? t('me.googleSwitched') : t('me.googleLinked'), 3000);
      // Another profile opened: reload so rooms, plaza and names all use it.
      if (res.switched) setTimeout(() => location.reload(), 900);
      else { render(); HA.loginDone?.(); }
    });
  }

  function logout() {
    try { google.accounts.id.disableAutoSelect(); } catch {}
    // Forget this browser's credentials; a fresh guest profile is made on reload.
    HA.useCredentials('', '');
    toast(t('me.googleOut'), 2000);
    setTimeout(() => location.reload(), 700);
  }

  // Refresh the row whenever the settings panel opens or the language changes.
  $('#setBtn')?.addEventListener('click', () => setTimeout(render, 50));
  I18N.onChange(() => {
    for (const id of ['gBtn', 'loginGBtn']) { const b = document.getElementById(id); if (b) { b._rendered = false; b.innerHTML = ''; } }
    render();
  });
})();
