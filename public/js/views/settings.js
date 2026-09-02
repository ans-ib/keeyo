import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { exportCSV, printRegister } from '../print-export.js';
import { boot, refresh } from '../router.js';
import { state } from '../state.js';
import { confirmDialog, fieldError, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { bindCatalogSection, viewCatalogSection } from './settings-catalog.js';
import { loadLoginKeys, loadMfaStatus, loadSmtpConfig, loadSsoConfig, loginKeyModal } from './settings-security.js';
import { bindTokens, viewTokens } from './settings-tokens.js';

const GROUPS = [
  { label: 'Basic', items: [['account', 'Account', 'user'], ['security', 'Security', 'shield'], ['tokens', 'Access tokens', 'keyIcon'], ['catalog', 'Catalog', 'tag']] },
  { label: 'Admin', admin: true, items: [['users', 'Users', 'users'], ['sso', 'Single sign-on', 'link'], ['email', 'Email', 'mail']] },
];

const TITLES = { account: 'Account', security: 'Security', tokens: 'Access tokens', catalog: 'Catalog', users: 'Users', sso: 'Single sign-on', email: 'Email' };

function sectionHTML(section) {
  const views = { account: viewAccount, security: viewSecurity, tokens: viewTokens, catalog: viewCatalogSection, users: viewUsers, sso: viewSso, email: viewEmail };
  return `<h1 class="settings-title">${TITLES[section]}</h1>${views[section]()}`;
}

export function viewSettings(section) {
  const nav = GROUPS.filter((g) => !g.admin || state.me.isAdmin).map((g) => `
    <div class="settings-group">
      <div class="settings-group-label">${g.label}</div>
      ${g.items.map(([id, label, icon]) => `
      <a class="settings-link ${id === section ? 'on' : ''}" href="#/settings/${id}" ${id === section ? 'aria-current="page"' : ''}>${I[icon]}<span>${label}</span></a>`).join('')}
    </div>`).join('');

  return `
    <div class="settings">
      <aside class="settings-nav"><h1>Settings</h1>${nav}</aside>
      <div class="settings-main">${sectionHTML(section)}</div>
    </div>`;
}

export function swapSettingsSection(section) {
  $$('.settings-link').forEach((link) => {
    const on = link.getAttribute('href') === `#/settings/${section}`;
    link.classList.toggle('on', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const main = $('.settings-main');
  main.classList.remove('swap');
  main.innerHTML = sectionHTML(section);
  void main.offsetWidth;
  main.classList.add('swap');
}

function profileHTML() {
  const me = state.me;
  return `
    <span class="avatar">${esc(me.username.charAt(0).toUpperCase())}</span>
    <div>
      <b>${esc(me.username)}</b><span class="handle">${me.isAdmin ? 'Administrator' : 'Member'}</span>
      <div class="muted small">${me.email ? esc(me.email) : 'No email address'}</div>
    </div>`;
}

function viewAccount() {
  const me = state.me;
  const sso = state.sso && state.sso.enabled;
  return `
    <section class="settings-section">
      <div class="section-title-row">
        <div><h2>Account information</h2></div>
        <div class="settings-actions">
          <button type="button" class="btn" id="edit-profile-btn">${I.edit} Edit</button>
          ${me.sso ? '' : `<button type="button" class="btn" id="change-pw-btn">${I.keyIcon} Change password</button>`}
        </div>
      </div>
      <div class="profile-row" id="profile-row">${profileHTML()}</div>
    </section>
    ${sso ? `
    <section class="settings-section">
      <h2>SSO accounts</h2>
      <div class="table">
        <div class="table-head"><span class="grow">Provider</span><span class="col-wide">Account</span></div>
        <div class="row">
          <div class="row-main"><div class="row-title">${esc(state.sso.name)}<span class="chip">OIDC</span></div></div>
          <span class="col-wide">${me.sso ? '<span class="chip ok">Linked</span>' : '<span class="chip">Password account</span>'}</span>
        </div>
      </div>
    </section>` : ''}
    <section class="settings-section">
      <h2>Backup</h2>
      <div class="settings-actions">
        <a class="btn" href="/api/export">${I.download} Export JSON</a>
        <button class="btn" id="csv-btn">${I.download} Export CSV</button>
        <button class="btn" id="pdf-btn" title="Opens the print dialog — choose Save as PDF">${I.print} Export PDF</button>
      </div>
    </section>
    <section class="settings-section">
      <h2>Danger area</h2>
      <div class="danger-area">
        <span class="icon">${I.warn}</span>
        <div class="text"><b>Import a backup</b><p>Replaces every key, service and registration with the contents of the file. Attachments are not part of backups and will be deleted.</p></div>
        <button class="btn btn-danger" id="import-btn">Import backup…</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <div class="danger-area">
        <span class="icon">${I.warn}</span>
        <div class="text"><b>Delete account</b><p>Permanently removes this account with its keys, services, registrations, files and tokens. This cannot be undone.</p></div>
        <button class="btn btn-danger" id="delete-account-btn">Delete account</button>
      </div>
    </section>`;
}

function viewSecurity() {
  return `
    <section class="settings-section">
      <div class="section-title-row"><div><h2>Security keys</h2></div><button class="btn" id="add-login-key">${I.plus} Enroll a key</button></div>
      <div id="login-key-list" class="table"><div class="section-empty">Loading…</div></div>
    </section>
    <section class="settings-section">
      <h2>Authenticator app</h2>
      <div id="totp-status"><p class="muted small">Loading…</p></div>
    </section>
    <section class="settings-section" id="recovery-card" hidden>
      <h2>Recovery codes</h2>
      <p class="section-desc">Single-use codes that sign you in when your second step is unavailable.</p>
      <div id="recovery-status"><p class="muted small">Loading…</p></div>
    </section>`;
}

function viewUsers() {
  return `
    <section class="settings-section">
      <div class="section-title-row">
        <div><h2>Members</h2><p class="section-desc">Everyone with an account on this instance. Each member keeps a private register.</p></div>
        <button class="btn" id="add-user-btn">${I.plus} Add user</button>
      </div>
      <div id="user-list" class="table"><div class="section-empty">Loading…</div></div>
    </section>`;
}

function viewSso() {
  return `
    <section class="settings-section">
      <h2>OpenID Connect</h2>
      <p class="section-desc">Sign in through Authentik, Authelia, Keycloak or any other OIDC provider. Accounts are matched by username.</p>
      <div id="sso-config"><p class="muted small">Loading…</p></div>
    </section>`;
}

function viewEmail() {
  return `
    <section class="settings-section">
      <h2>SMTP</h2>
      <p class="section-desc">Outgoing mail for password-reset links.</p>
      <div id="smtp-config"><p class="muted small">Loading…</p></div>
    </section>`;
}

function editProfileModal() {
  const me = state.me;
  openModal({
    title: 'Edit account',
    submitLabel: 'Save changes',
    bodyHTML: `
      <div class="field"><label>Username</label>
        <input type="text" name="username" value="${esc(me.username)}" maxlength="40" autocomplete="username" ${me.sso ? 'readonly' : 'required'}>
        ${me.sso ? '<div class="hint">Managed by your identity provider.</div>' : ''}</div>
      <div class="field"><label>Email</label>
        <input type="email" name="email" value="${esc(me.email || '')}" autocomplete="email" placeholder="you@example.com">
        <div class="hint">Used for password-reset links once email is configured.</div></div>`,
    onSubmit: async (form) => {
      const r = await api('/me/profile', {
        method: 'PUT',
        body: { username: form.username.value.trim(), email: form.email.value.trim() },
      });
      state.me.username = r.username;
      state.me.email = r.email;
      const row = $('#profile-row');
      if (row) row.innerHTML = profileHTML();
      const head = $('.popover-head b');
      if (head) head.textContent = r.username;
      toast('Account updated');
    },
  });
}

function changePasswordModal() {
  openModal({
    title: 'Change password',
    submitLabel: 'Change password',
    bodyHTML: `
      <div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password" required></div>
      <div class="field"><label>New password</label><input type="password" name="next" autocomplete="new-password" required minlength="8">
        <div class="hint">At least 8 characters. Every other session is signed out.</div></div>
      <div class="field"><label>Confirm new password</label><input type="password" name="confirm" autocomplete="new-password" required></div>`,
    onSubmit: async (form) => {
      if (form.next.value !== form.confirm.value) throw fieldError('confirm', 'Passwords do not match');
      await api('/me/password', { method: 'PUT', body: { current: form.current.value, next: form.next.value } });
      toast('Password changed');
    },
  });
}

async function deleteAccountModal() {
  const me = state.me;
  let others = 0;
  if (me.isAdmin) {
    try { others = (await api('/users')).filter((u) => u.id !== me.id).length; } catch {}
  }
  openModal({
    title: 'Delete account',
    submitLabel: 'Delete account',
    danger: true,
    bodyHTML: `
      <p class="small">This removes <b>${esc(me.username)}</b> together with every key, service, registration, file and access token on it. There is no undo.</p>
      ${me.isAdmin && others ? `
      <label class="check-line"><input type="checkbox" name="deleteMembers"><span>Also delete the ${others} other member${others === 1 ? '' : 's'} and their registers</span></label>
      <div class="hint">Leave this unchecked only if another administrator exists. Otherwise nobody could manage this instance.</div>` : ''}
      ${me.sso
        ? '<div class="field field-gap"><label>Type your username to confirm</label><input type="text" name="confirm" autocomplete="off" required></div>'
        : '<div class="field field-gap"><label>Your password</label><input type="password" name="password" autocomplete="current-password" required></div>'}`,
    onSubmit: async (form) => {
      await api('/me', {
        method: 'DELETE',
        body: {
          password: form.password ? form.password.value : undefined,
          confirm: form.confirm ? form.confirm.value : undefined,
          deleteMembers: !!(form.deleteMembers && form.deleteMembers.checked),
        },
      });
      toast('Account deleted');
      state.me = null;
      boot();
    },
  });
}

export function bindSettings(section) {
  if (section === 'catalog') {
    bindCatalogSection();
    return;
  }

  if (section === 'account') {
    $('#edit-profile-btn').addEventListener('click', editProfileModal);
    const pwBtn = $('#change-pw-btn');
    if (pwBtn) pwBtn.addEventListener('click', changePasswordModal);
    $('#delete-account-btn').addEventListener('click', deleteAccountModal);
    $('#csv-btn').addEventListener('click', exportCSV);
    $('#pdf-btn').addEventListener('click', printRegister);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        toast('That file is not valid JSON', 'error');
        return;
      }
      const ok = await confirmDialog({
        title: 'Import backup?',
        message: `This will <b>replace</b> all your current keys, services and registrations with the contents of <b>${esc(file.name)}</b>.<br><br>
          File attachments are not part of JSON backups — <b>your current attachments will be deleted</b>.`,
        confirmLabel: 'Replace my data',
      });
      if (!ok) return;
      try {
        await api('/import', { body: { data } });
        toast('Backup imported');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  if (section === 'security') {
    loadLoginKeys();
    loadMfaStatus();
    $('#add-login-key').addEventListener('click', () => loginKeyModal());
  }

  if (section === 'tokens') bindTokens();

  if (section === 'users' && state.me.isAdmin) {
    loadUsers();
    $('#add-user-btn').addEventListener('click', () => userModal());
  }

  if (section === 'sso') loadSsoConfig();
  if (section === 'email') loadSmtpConfig();
}

async function loadUsers() {
  const box = $('#user-list');
  if (!box) return;
  const users = await api('/users');
  if (!$('#user-list')) return;
  box.innerHTML = `
    <div class="table-head"><span class="grow">Username</span><span class="col-role">Role</span><span class="col-actions"></span></div>
    ${users.map((u) => `
    <div class="row">
      <span class="avatar sm">${esc(u.username.charAt(0).toUpperCase())}</span>
      <div class="row-main"><div class="row-title">${esc(u.username)}${u.id === state.me.id ? '<span class="muted small">you</span>' : ''}</div></div>
      <span class="col-role">${u.isAdmin ? '<span class="chip accent">Admin</span>' : '<span class="chip">Member</span>'}</span>
      <span class="col-actions">${u.id !== state.me.id ? `<button class="btn-icon danger" data-del-user="${u.id}" data-del-name="${esc(u.username)}" title="Delete user">${I.trash}</button>` : ''}</span>
    </div>`).join('')}`;
  $$('[data-del-user]', box).forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Delete user "${b.dataset.delName}"?`,
        message: 'Their entire key inventory will be permanently deleted.',
      });
      if (!ok) return;
      await api(`/users/${b.dataset.delUser}`, { method: 'DELETE' });
      toast('User deleted');
      loadUsers();
    }));
}

function userModal() {
  openModal({
    title: 'Add user',
    submitLabel: 'Create user',
    bodyHTML: `
      <div class="field"><label>Username</label><input type="text" name="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" required>
        <div class="hint">At least 8 characters</div></div>
      <label class="check-line"><input type="checkbox" name="isAdmin"><span>Administrator</span></label>`,
    onSubmit: async (form) => {
      await api('/users', {
        body: { username: form.username.value, password: form.password.value, isAdmin: form.isAdmin.checked },
      });
      toast('User created');
      loadUsers();
    },
  });
}
