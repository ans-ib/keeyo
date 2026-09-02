import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, b64urlToBuf, bufToB64url, esc } from '../lib/dom.js';
import { render } from '../router.js';
import { loadData, state } from '../state.js';
import { authShell } from '../ui/shell.js';
import { fieldError, hideError, showError, validateRequired } from '../ui/forms.js';
import { toast } from '../ui/toast.js';

export function renderSetup() {
  authShell(`
    <p class="auth-sub">Create the first account. It becomes the administrator.</p>
    <form id="setup-form">
      <div class="form-error"></div>
      <div class="field"><label>Username</label><input type="text" name="username" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" autocomplete="new-password" required>
        <div class="hint">At least 8 characters</div></div>
      <div class="field"><label>Confirm password</label><input type="password" name="confirm" autocomplete="new-password" required></div>
      <button class="btn btn-primary" type="submit">Create account</button>
    </form>`);

  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    hideError(f);
    if (!validateRequired(f)) return;
    if (f.password.value !== f.confirm.value) {
      showError(f, fieldError('confirm', 'Passwords do not match'));
      return;
    }
    try {
      await api('/setup', { body: { username: f.username.value, password: f.password.value } });
      await loadData();
      location.hash = '#/keys';
      render();
    } catch (err) {
      showError(f, err);
    }
  });
}

export function renderLogin() {
  const sso = state.sso && state.sso.enabled;
  const pwHidden = sso && state.sso.passwordDisabled;
  authShell(`
    <p class="auth-sub">Sign in to your register.</p>
    ${pwHidden ? `
    <a class="btn btn-primary sso-btn" href="/api/oidc/login">Continue with ${esc(state.sso.name)}</a>
    <div class="form-error" id="sso-only-error"></div>
    <p class="small" style="text-align:center;margin-top:14px"><button type="button" class="link-btn" id="show-pw-login">admin sign-in</button></p>` : ''}
    <form id="login-form" ${pwHidden ? 'hidden' : ''}>
      <div class="form-error"></div>
      <div class="field"><label>Username</label><input type="text" name="username" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
      ${state.resetAvailable ? `
      <p class="small" style="text-align:center;margin-top:12px"><button type="button" class="link-btn" id="forgot-pw">Forgot password?</button></p>` : ''}
      ${sso && !pwHidden ? `
      <div class="sso-divider"><span>or</span></div>
      <a class="btn sso-btn" href="/api/oidc/login">Continue with ${esc(state.sso.name)}</a>` : ''}
    </form>`);

  const forgot = $('#forgot-pw');
  if (forgot) forgot.addEventListener('click', renderResetRequest);

  const showPw = $('#show-pw-login');
  if (showPw) showPw.addEventListener('click', () => {
    $('#login-form').hidden = false;
    showPw.parentElement.remove();
  });

  const ssoError = new URLSearchParams(location.search).get('ssoError');
  if (ssoError) {
    const box = $('#sso-only-error') || $('#login-form .form-error');
    box.textContent = ssoError;
    box.classList.add('visible');
    history.replaceState(null, '', location.pathname + location.hash);
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    hideError(f);
    if (!validateRequired(f)) return;
    try {
      const res = await api('/login', { body: { username: f.username.value, password: f.password.value } });
      if (res.mfaRequired) {
        renderMfa(res);
        return;
      }
      await loadData();
      location.hash = '#/keys';
      render();
    } catch (err) {
      showError(f, err);
    }
  });
}

function renderResetRequest() {
  authShell(`
    <p class="auth-sub">Reset your password.</p>
    <form id="reset-request-form">
      <div class="form-error"></div>
      <div class="field"><label>Username or email</label>
        <input type="text" name="identifier" autocomplete="username" required autofocus></div>
      <button class="btn btn-primary" type="submit" style="width:100%">Send reset link</button>
      <div style="text-align:center;margin-top:12px"><button type="button" class="link-btn" id="reset-back">back to sign in</button></div>
    </form>`);

  $('#reset-back').addEventListener('click', renderLogin);
  $('#reset-request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    hideError(f);
    if (!validateRequired(f)) return;
    try {
      await api('/reset/request', { body: { identifier: f.identifier.value.trim() } });
      authShell(`
        <p class="auth-sub">Check your inbox.</p>
        <p class="small" style="text-align:center">If that account has an email address, a reset link is on its way. It works for 45 minutes.</p>
        <div style="text-align:center;margin-top:14px"><button type="button" class="link-btn" id="reset-back">back to sign in</button></div>`);
      $('#reset-back').addEventListener('click', renderLogin);
    } catch (err) {
      showError(f, err);
    }
  });
}

export function renderResetComplete(token) {
  authShell(`
    <p class="auth-sub">Choose a new password.</p>
    <form id="reset-complete-form">
      <div class="form-error"></div>
      <div class="field"><label>New password</label>
        <input type="password" name="password" autocomplete="new-password" required autofocus>
        <div class="hint">At least 8 characters</div></div>
      <div class="field"><label>Confirm password</label>
        <input type="password" name="confirm" autocomplete="new-password" required></div>
      <button class="btn btn-primary" type="submit" style="width:100%">Set password</button>
    </form>`);

  $('#reset-complete-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    hideError(f);
    if (!validateRequired(f)) return;
    if (f.password.value !== f.confirm.value) {
      showError(f, fieldError('confirm', 'Passwords do not match'));
      return;
    }
    try {
      await api('/reset/complete', { body: { token, password: f.password.value } });
      history.replaceState(null, '', location.pathname);
      toast('Password changed — sign in with it now');
      renderLogin();
    } catch (err) {
      showError(f, err);
    }
  });
}

function renderMfa(mfa) {
  const m = mfa.methods || { webauthn: true, totp: false, recovery: false };
  renderMfaMethod(mfa, m.webauthn ? 'webauthn' : 'totp');
}

async function finishMfaLogin(res) {
  if (typeof res.recoveryRemaining === 'number' && res.recoveryRemaining <= 2) {
    toast(`Only ${res.recoveryRemaining} recovery code${res.recoveryRemaining === 1 ? '' : 's'} left — generate a new set in Settings`, 'error', { duration: 8000 });
  }
  await loadData();
  location.hash = '#/keys';
  render();
}

function renderMfaMethod(mfa, method) {
  const m = mfa.methods || { webauthn: true, totp: false, recovery: false };
  const alts = [];
  if (m.webauthn && method !== 'webauthn') alts.push(['webauthn', 'use a security key']);
  if (m.totp && method !== 'totp') alts.push(['totp', 'use an authenticator code']);
  if (m.recovery && method !== 'recovery') alts.push(['recovery', 'use a recovery code']);
  const altHTML = alts.map(([id, label]) =>
    `<button type="button" class="link-btn" data-mfa-alt="${id}">${label}</button>`).join(' · ');

  if (method === 'webauthn') {
    authShell(`
      <p class="auth-sub">Second step: security key.</p>
      <div class="scan-stage" style="padding-top:6px">
        <div class="scan-orb">${I.keyIcon}</div>
        <p>Insert one of the security keys enrolled for this account and touch it when it blinks.</p>
        <div class="form-error" id="mfa-error"></div>
        <button class="btn btn-primary" id="mfa-btn" style="width:100%">Use security key</button>
        <div class="mfa-alts">${altHTML}</div>
        <div><button type="button" class="link-btn" id="mfa-back">back to sign in</button></div>
      </div>`);
  } else {
    const isTotp = method === 'totp';
    authShell(`
      <p class="auth-sub">Second step: ${isTotp ? 'authenticator code' : 'recovery code'}.</p>
      <form id="mfa-code-form">
        <div class="form-error"></div>
        <div class="field"><label>${isTotp ? '6-digit code from your authenticator app' : 'Recovery code'}</label>
          <input type="text" name="code" inputmode="${isTotp ? 'numeric' : 'text'}" autocomplete="one-time-code"
            maxlength="${isTotp ? 6 : 12}" placeholder="${isTotp ? '000000' : 'XXXXX-XXXXX'}" required autofocus
            spellcheck="false" autocapitalize="characters"></div>
        <button class="btn btn-primary" type="submit" style="width:100%">Verify</button>
        <div class="mfa-alts">${altHTML}</div>
        <div style="text-align:center;margin-top:8px"><button type="button" class="link-btn" id="mfa-back">back to sign in</button></div>
      </form>`);
  }

  $('#mfa-back').addEventListener('click', renderLogin);
  $$('[data-mfa-alt]').forEach((b) =>
    b.addEventListener('click', () => renderMfaMethod(mfa, b.dataset.mfaAlt)));

  if (method !== 'webauthn') {
    const form = $('#mfa-code-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError(form);
      if (!validateRequired(form)) return;
      try {
        const value = form.code.value.trim();
        const res = await api('/login/mfa', {
          body: method === 'totp'
            ? { mfaToken: mfa.mfaToken, code: value }
            : { mfaToken: mfa.mfaToken, recoveryCode: value },
        });
        await finishMfaLogin(res);
      } catch (err) {
        showError(form, new Error(err.status === 400 ? 'Session expired — go back and sign in again.' : err.message));
        form.code.select();
      }
    });
    return;
  }

  const box = $('#mfa-error');
  const btn = $('#mfa-btn');

  async function attempt() {
    box.classList.remove('visible');
    btn.disabled = true;
    btn.textContent = 'Touch your key…';
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuf(mfa.challenge),
          allowCredentials: mfa.credentialIds.map((id) => ({ type: 'public-key', id: b64urlToBuf(id) })),
          userVerification: 'preferred',
          timeout: 60000,
        },
      });
      const r = assertion.response;
      const res = await api('/login/mfa', {
        body: {
          mfaToken: mfa.mfaToken,
          credentialId: assertion.id,
          clientDataJSON: bufToB64url(r.clientDataJSON),
          authenticatorData: bufToB64url(r.authenticatorData),
          signature: bufToB64url(r.signature),
        },
      });
      await finishMfaLogin(res);
    } catch (err) {
      box.textContent = err.name === 'NotAllowedError'
        ? 'Cancelled or timed out — try again.'
        : (err.status === 400 ? 'Challenge expired — go back and sign in again.' : err.message);
      box.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Use security key';
    }
  }

  btn.addEventListener('click', attempt);
  attempt();
}
