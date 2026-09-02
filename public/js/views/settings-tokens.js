import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc, formatDate } from '../lib/dom.js';
import { bindCopyFields, copyField } from '../ui/copy-field.js';
import { openModal } from '../ui/modal.js';
import { collapseRow, expandRow } from '../ui/rows.js';
import { toast } from '../ui/toast.js';
import { deleteWithUndo } from '../ui/undo.js';

const SCOPES = [['read', 'Read only'], ['write', 'Read & write']];
const EXPIRIES = [[0, 'Never'], [30, '30 days'], [90, '90 days'], [365, '1 year']];

let tokens = [];

function scopeChip(scope) {
  return scope === 'write' ? '<span class="chip accent">Read &amp; write</span>' : '<span class="chip">Read only</span>';
}

function expiryText(token) {
  if (!token.expiresAt) return 'Never';
  return new Date(token.expiresAt) < new Date() ? 'Expired' : formatDate(token.expiresAt);
}

function tableHTML() {
  if (!tokens.length) return '<div class="section-empty">No access tokens yet.</div>';
  return `
    <div class="table-head"><span class="grow">Name</span><span class="col-source">Scope</span><span class="col-date">Expires</span><span class="col-date">Last used</span><span class="col-actions"></span></div>
    ${tokens.map((t) => `
    <div class="row" data-token-row="${t.id}">
      <div class="row-main"><div class="row-title">${esc(t.name)}</div><div class="row-sub"><code>${esc(t.prefix)}…</code></div></div>
      <span class="col-source">${scopeChip(t.scope)}</span>
      <span class="col-date">${esc(expiryText(t))}</span>
      <span class="col-date">${t.lastUsedAt ? esc(formatDate(t.lastUsedAt)) : 'Never'}</span>
      <span class="col-actions"><button type="button" class="btn-icon danger" data-revoke-token="${t.id}" title="Revoke">${I.trash}</button></span>
    </div>`).join('')}`;
}

function renderTokens(mark = null) {
  const host = $('#token-list');
  if (!host) return;
  host.innerHTML = tableHTML();
  $$('[data-revoke-token]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const token = tokens.find((t) => t.id === Number(b.dataset.revokeToken));
      if (!token) return;
      const row = b.closest('.row');
      b.disabled = true;
      collapseRow(row).then(() => {
        deleteWithUndo({
          label: `Revoked ${token.name}`,
          apply: () => { tokens = tokens.filter((t) => t.id !== token.id); },
          revert: () => { tokens.push(token); },
          commit: (o) => api(`/tokens/${token.id}`, { method: 'DELETE', ...o }),
          rerender: () => renderTokens({ highlightId: token.id }),
        });
      });
    }));
  if (mark && mark.highlightId) expandRow($(`[data-token-row="${mark.highlightId}"]`, host));
}

async function loadTokens(mark = null) {
  tokens = await api('/tokens');
  renderTokens(mark);
}

export function viewTokens() {
  return `
    <section class="settings-section">
      <div class="section-title-row">
        <div><h2>Personal access tokens</h2></div>
        <button type="button" class="btn" id="new-token-btn">${I.plus} New token</button>
      </div>
      <div id="token-list" class="table"><div class="section-empty">Loading…</div></div>
    </section>`;
}

function newTokenModal() {
  openModal({
    title: 'New access token',
    submitLabel: 'Create token',
    bodyHTML: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" required maxlength="80" placeholder="e.g. Backup script, Home Assistant"></div>
      <div class="field"><label>Access</label>
        <div class="segmented" id="token-scope">
          ${SCOPES.map(([id, label], i) => `<button type="button" data-scope="${id}" class="${i === 0 ? 'selected' : ''}">${label}</button>`).join('')}
        </div></div>
      <div class="field"><label>Expires</label>
        <select name="expiresInDays">${EXPIRIES.map(([days, label]) => `<option value="${days}">${label}</option>`).join('')}</select></div>`,
    onOpen: (form) => {
      let scope = 'read';
      $$('#token-scope button', form).forEach((b) =>
        b.addEventListener('click', () => {
          scope = b.dataset.scope;
          $$('#token-scope button', form).forEach((x) => x.classList.toggle('selected', x === b));
        }));
      form.getScope = () => scope;
    },
    onSubmit: async (form) => {
      const created = await api('/tokens', {
        body: {
          name: form.elements.namedItem('name').value.trim(),
          scope: form.getScope(),
          expiresInDays: Number(form.expiresInDays.value),
        },
      });
      await loadTokens({ highlightId: created.id });
      showTokenModal(created);
    },
  });
}

function showTokenModal(created) {
  const example = `curl -H "Authorization: Bearer ${created.token}" ${location.origin}/api/data`;
  openModal({
    title: 'Token created',
    submitLabel: 'Done',
    bodyHTML: `
      <p class="small">Copy it now. Keeyo stores only a hash and cannot show it again.</p>
      <div class="field"><label>${esc(created.name)}</label>${copyField(created.token)}</div>
      <div class="field"><label>Example</label>${copyField(example, { display: example })}</div>`,
    onOpen: (form) => bindCopyFields(form),
    onSubmit: async () => {},
  });
}

export function bindTokens() {
  loadTokens();
  $('#new-token-btn').addEventListener('click', newTokenModal);
}
