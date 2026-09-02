import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, b64urlToBuf, bufToB64, bufToB64url, esc, formatDate } from '../lib/dom.js';
import { state } from '../state.js';
import { bindCopyFields, copyField } from '../ui/copy-field.js';
import { qrSVG } from '../ui/key-art.js';
import { confirmDialog, fieldError, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export async function loadLoginKeys() {
  const box = $('#login-key-list');
  if (!box) return;
  const keys = await api('/login-keys');
  if (!$('#login-key-list')) return;
  $('#login-key-list').innerHTML = keys.length
    ? `
      <div class="table-head"><span class="grow">Name</span><span class="col-date">Added</span><span class="col-actions"></span></div>
      ${keys.map((k) => `
      <div class="row">
        <span class="svc-icon sm">${I.keyIcon}</span>
        <div class="row-main"><div class="row-title">${esc(k.name)}</div></div>
        <span class="col-date">${esc(formatDate(k.createdAt))}</span>
        <span class="col-actions"><button class="btn-icon danger" data-del-lk="${k.id}" data-lk-name="${esc(k.name)}" title="Remove">${I.trash}</button></span>
      </div>`).join('')}`
    : '<div class="section-empty">No sign-in keys enrolled.</div>';
  $$('[data-del-lk]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Remove "${b.dataset.lkName}"?`,
        message: 'It will no longer be usable to sign in. If it was the last one, sign-in falls back to password only.',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      await api(`/login-keys/${b.dataset.delLk}`, { method: 'DELETE' });
      toast('Sign-in key removed');
      loadLoginKeys();
      loadMfaStatus();
    }));
}

export async function loadMfaStatus() {
  if (!$('#totp-status')) return;
  const s = await api('/account/mfa');
  const totpBox = $('#totp-status');
  const recBox = $('#recovery-status');
  if (!totpBox || !recBox) return;

  totpBox.innerHTML = s.totpEnabled
    ? `<div class="status-line"><span class="chip ok">Enabled</span><span class="muted small">Codes from your app are accepted at sign-in.</span><button class="btn btn-sm" id="totp-off">Turn off</button></div>`
    : `<div class="status-line"><span class="chip">Off</span><button class="btn btn-sm" id="totp-setup">Set up</button></div>`;

  const hasFactor = s.totpEnabled || s.loginKeys > 0;
  const recCard = $('#recovery-card');
  if (recCard) recCard.hidden = !hasFactor;
  if (hasFactor) {
    const st = s.recovery;
    recBox.innerHTML = `<div class="status-line">
        ${st.total ? `<span class="chip ${st.remaining <= 2 ? 'warn' : 'ok'}">${st.remaining} of ${st.total} left</span>` : '<span class="chip">None</span>'}
        <span class="muted small">${st.total ? (st.remaining <= 2 ? 'Running low. Generate a new set.' : 'Each code works once.') : 'No codes generated yet.'}</span>
        <button class="btn btn-sm" id="gen-recovery">${st.total ? 'Regenerate' : 'Generate codes'}</button>
      </div>`;
  }

  const setupBtn = $('#totp-setup');
  if (setupBtn) setupBtn.addEventListener('click', totpSetupModal);
  const offBtn = $('#totp-off');
  if (offBtn) offBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Turn off the authenticator app?',
      message: 'Codes from the app will stop working for sign-in. If it was your only second factor, your recovery codes are wiped too and sign-in falls back to password only.',
      confirmLabel: 'Turn off',
    });
    if (!ok) return;
    await api('/account/totp', { method: 'DELETE' });
    toast('Authenticator app turned off');
    loadMfaStatus();
  });
  const genBtn = $('#gen-recovery');
  if (genBtn) genBtn.addEventListener('click', async () => {
    if (s.recovery.total) {
      const ok = await confirmDialog({
        title: 'Generate a new set?',
        message: 'All of your current recovery codes stop working immediately and are replaced by ten new ones.',
        confirmLabel: 'Regenerate',
      });
      if (!ok) return;
    }
    const { codes } = await api('/account/recovery-codes', { method: 'POST', body: {} });
    showRecoveryCodes(codes);
    loadMfaStatus();
  });
}

export async function loadSsoConfig() {
  const box = $('#sso-config');
  if (!box) return;
  const s = await api('/admin/sso');
  if (!$('#sso-config')) return;

  if (s.envLocked) {
    box.innerHTML = `<div class="env-locked">${I.lock}<span class="grow">Configured through environment variables (<code>KEEYO_OIDC_*</code>) and locked here.</span><span class="chip ok">Enabled</span></div>`;
    return;
  }

  const check = (name, label, on) => `
    <label class="check-line"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`;

  box.innerHTML = `
    <form id="sso-form">
      <div class="form-error"></div>
      ${check('enabled', '<b>Enable OIDC / OAuth sign-in</b>', s.enabled)}
      <div class="field"><label>Provider name</label>
        <input type="text" name="name" maxlength="40" value="${esc(s.name)}" placeholder="SSO"></div>
      <div class="field"><label>Client ID</label>
        <input type="text" name="clientId" value="${esc(s.clientId)}" autocomplete="off"></div>
      <div class="field"><label>Client secret</label>
        <input type="password" name="clientSecret" autocomplete="new-password" placeholder="${s.hasSecret ? '(unchanged)' : ''}"></div>
      <div class="field"><label>Issuer URL</label>
        <input type="url" name="issuer" placeholder="https://auth.example.com/application/o/keeyo/" value="${esc(s.issuer)}"></div>
      <div class="field"><label>Scopes</label>
        <input type="text" name="scopes" value="${esc(s.scopes)}" placeholder="openid profile email"></div>
      <div class="field"><label>User identifier field</label>
        <input type="text" name="usernameClaim" value="${esc(s.usernameClaim)}" placeholder="preferred_username"></div>
      <div class="field"><label>Auth URL</label>
        <input type="url" name="authUrl" value="${esc(s.authUrl)}" placeholder="auto-discovered from the issuer"></div>
      <div class="field"><label>Token URL</label>
        <input type="url" name="tokenUrl" value="${esc(s.tokenUrl)}" placeholder="auto-discovered from the issuer"></div>
      <div class="field"><label>Logout URL</label>
        <input type="url" name="logoutUrl" value="${esc(s.logoutUrl)}"></div>
      <div class="field"><label>Redirect URL</label>
        <input type="text" value="${esc(location.origin)}/api/oidc/callback" readonly></div>
      ${check('autoCreate', 'Create users automatically on first sign-in', s.autoCreate)}
      ${check('disablePassword', 'Disable password login', s.disablePassword)}
      ${check('requireVerified', 'Require a verified email for new accounts', s.requireVerified)}
      <div class="settings-actions top">
        <button class="btn" type="submit">Save</button>
        <button class="btn btn-sm btn-ghost" type="button" id="sso-clear">Clear configuration</button>
        <div class="grow"></div>
        ${s.configured ? '<span class="chip ok">Enabled</span>' : '<span class="chip">Off</span>'}
      </div>
    </form>`;

  $('#sso-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errBox = $('.form-error', f);
    errBox.classList.remove('visible');
    try {
      const r = await api('/admin/sso', {
        method: 'PUT',
        body: {
          enabled: f.enabled.checked,
          name: f.name.value.trim(),
          clientId: f.clientId.value.trim(),
          clientSecret: f.clientSecret.value,
          issuer: f.issuer.value.trim(),
          scopes: f.scopes.value.trim(),
          usernameClaim: f.usernameClaim.value.trim(),
          authUrl: f.authUrl.value.trim(),
          tokenUrl: f.tokenUrl.value.trim(),
          logoutUrl: f.logoutUrl.value.trim(),
          autoCreate: f.autoCreate.checked,
          disablePassword: f.disablePassword.checked,
          requireVerified: f.requireVerified.checked,
        },
      });
      toast(r.configured ? 'SSO enabled — the sign-in page now shows the button' : 'Saved (SSO is off)');
      loadSsoConfig();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('visible');
    }
  });
  $('#sso-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear the SSO configuration?',
      message: 'Turns SSO off and forgets the client secret and every field.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    await api('/admin/sso', { method: 'PUT', body: { clear: true } });
    toast('SSO configuration cleared');
    loadSsoConfig();
  });
}

export async function loadSmtpConfig() {
  const box = $('#smtp-config');
  if (!box) return;
  const s = await api('/admin/smtp');
  if (!$('#smtp-config')) return;

  if (s.envLocked) {
    box.innerHTML = `<div class="env-locked">${I.lock}<span class="grow">Configured through environment variables (<code>KEEYO_SMTP_*</code>) and locked here.</span><span class="chip ok">Enabled</span></div>`;
    return;
  }

  const sec = (value, label) => `<option value="${value}" ${s.security === value ? 'selected' : ''}>${label}</option>`;

  box.innerHTML = `
    <form id="smtp-form">
      <div class="form-error"></div>
      <label class="check-line"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}><span><b>Enable email</b></span></label>
      <div class="field"><label>Host</label>
        <input type="text" name="host" value="${esc(s.host)}" placeholder="smtp.example.com"></div>
      <div class="field-row">
        <div class="field"><label>Port</label>
          <input type="number" name="port" value="${s.port}" min="1" max="65535"></div>
        <div class="field"><label>Security</label>
          <select name="security">${sec('tls', 'TLS')}${sec('starttls', 'STARTTLS')}${sec('none', 'None')}</select></div>
      </div>
      <div class="field"><label>Username</label>
        <input type="text" name="user" value="${esc(s.user)}" autocomplete="off"></div>
      <div class="field"><label>Password</label>
        <input type="password" name="pass" autocomplete="new-password" placeholder="${s.hasPass ? '(unchanged)' : ''}"></div>
      <div class="field"><label>From address</label>
        <input type="email" name="from" value="${esc(s.from)}" placeholder="keeyo@example.com"></div>
      <div class="field"><label>From name</label>
        <input type="text" name="fromName" maxlength="80" value="${esc(s.fromName)}"></div>
      <div class="settings-actions top">
        <button class="btn" type="submit">Save</button>
        <button class="btn btn-sm" type="button" id="smtp-test">Send test</button>
        <button class="btn btn-sm btn-ghost" type="button" id="smtp-clear">Clear</button>
        <div class="grow"></div>
        ${s.configured ? '<span class="chip ok">Enabled</span>' : '<span class="chip">Off</span>'}
      </div>
    </form>`;

  $('#smtp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errBox = $('.form-error', f);
    errBox.classList.remove('visible');
    try {
      const r = await api('/admin/smtp', {
        method: 'PUT',
        body: {
          enabled: f.enabled.checked,
          host: f.host.value.trim(),
          port: Number(f.port.value),
          security: f.security.value,
          user: f.user.value.trim(),
          pass: f.pass.value,
          from: f.from.value.trim(),
          fromName: f.fromName.value.trim(),
        },
      });
      toast(r.configured ? 'Email enabled' : 'Saved (email is off)');
      loadSmtpConfig();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('visible');
    }
  });
  $('#smtp-test').addEventListener('click', async () => {
    try {
      await api('/admin/smtp/test', { method: 'POST', body: {} });
      toast(`Test email sent to ${state.me.email || 'your address'}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#smtp-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear the SMTP configuration?',
      message: 'Turns email off and forgets the password and every field.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    await api('/admin/smtp', { method: 'PUT', body: { clear: true } });
    toast('SMTP configuration cleared');
    loadSmtpConfig();
  });
}

async function totpSetupModal() {
  let setup;
  try {
    setup = await api('/account/totp/setup', { method: 'POST', body: {} });
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  openModal({
    title: 'Set up authenticator app',
    submitLabel: 'Verify & enable',
    bodyHTML: `
      <div class="totp-setup-row">
        <div class="totp-qr">${qrSVG(setup.otpauth)}</div>
        <div class="totp-secret">
          <span class="muted small">Manual entry secret</span>
          ${copyField(setup.secret, { display: setup.secret.match(/.{1,4}/g).join(' ') })}
        </div>
      </div>
      <div class="field"><label>Code from the app</label>
        <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required></div>`,
    onOpen: (form) => bindCopyFields(form),
    onSubmit: async (form) => {
      await api('/account/totp/confirm', { body: { code: form.code.value.trim() } });
      toast('Authenticator app enabled');
      loadMfaStatus();
    },
  });
}

function showRecoveryCodes(codes) {
  openModal({
    title: 'Your recovery codes',
    submitLabel: 'I saved them',
    bodyHTML: `
      <p class="small" style="margin-top:0">Each code signs you in <b>once</b> if your second factor is lost or unavailable.
        This is the only time they are shown — keep them in your password manager or print them.</p>
      <div class="recovery-grid">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
      <button type="button" class="btn btn-sm" id="copy-codes" style="margin-top:12px">Copy all</button>`,
    onOpen: (form) => {
      $('#copy-codes', form).addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codes.join('\n'));
          toast('Copied — paste them somewhere safe');
        } catch {
          toast('Copy failed — select them by hand', 'error');
        }
      });
    },
    onSubmit: async (form, close) => close(),
  });
}

export function loginKeyModal() {
  openModal({
    title: 'Enroll a sign-in key',
    submitLabel: 'Enroll — touch key',
    bodyHTML: `
      <div class="field"><label>Name</label>
        <input type="text" name="lkName" required maxlength="80" placeholder="e.g. Daily driver, Desk backup"></div>`,
    onSubmit: async (form) => {
      const name = form.lkName.value.trim();
      if (!name) throw fieldError('lkName', 'Give the key a name');
      const { token, challenge } = await api('/login-keys/challenge', { method: 'POST', body: {} });
      let cred;
      try {
        cred = await navigator.credentials.create({
          publicKey: {
            challenge: b64urlToBuf(challenge),
            rp: { name: 'Keeyo' },
            user: {
              id: crypto.getRandomValues(new Uint8Array(16)),
              name: state.me.username,
              displayName: state.me.username,
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'discouraged', userVerification: 'preferred' },
            attestation: 'none',
            timeout: 60000,
          },
        });
      } catch (err) {
        throw new Error(err.name === 'NotAllowedError' ? 'Cancelled or timed out — try again.' : err.message);
      }
      const spki = typeof cred.response.getPublicKey === 'function' ? cred.response.getPublicKey() : null;
      if (!spki) throw new Error('This browser cannot export the credential — try a current Chrome/Brave/Firefox.');
      await api('/login-keys', {
        body: {
          token,
          name,
          credentialId: cred.id,
          publicKey: bufToB64(spki),
          alg: typeof cred.response.getPublicKeyAlgorithm === 'function' ? cred.response.getPublicKeyAlgorithm() : -7,
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        },
      });
      toast('Sign-in key enrolled');
      loadLoginKeys();
      loadMfaStatus();
    },
  });
}
