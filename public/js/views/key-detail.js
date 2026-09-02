import { allFormFactors, catalogModel } from '../catalog.js';
import { keyModal } from '../forms/key-form.js';
import { registrationModal } from '../forms/registration-form.js';
import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc, formatDate, formatSize } from '../lib/dom.js';
import { revealSecret } from '../lib/secret-notes.js';
import { printTag } from '../print-export.js';
import { refresh } from '../router.js';
import { KIND_CHIP, KIND_LABEL, STATUS_LABEL, attachmentsForKey, keyById, regsForKey, serviceById, state } from '../state.js';
import { keyVisual, tagNo } from '../ui/key-art.js';
import { confirmDialog } from '../ui/modal.js';
import { serviceIconHTML } from '../ui/service-icon.js';
import { toast } from '../ui/toast.js';
import { deleteWithUndo } from '../ui/undo.js';
import { serviceDetailModal } from './services.js';

function regRow(reg, { showKey = false } = {}) {
  const svc = serviceById(reg.serviceId) || { name: '(deleted service)' };
  const key = keyById(reg.keyId);
  const subParts = [];
  if (reg.account) subParts.push(reg.account);
  if (reg.kind === 'totp' && reg.totpApp) subParts.push(`in ${reg.totpApp}`);
  if (reg.notes) subParts.push(reg.notes);
  return `
    <div class="row clickable" data-reg-id="${reg.id}" data-svc-id="${svc.id || ''}" title="View service">
      ${serviceIconHTML(svc)}
      <div class="row-main">
        <div class="row-title">
          ${esc(svc.name)}
          <span class="chip ${KIND_CHIP[reg.kind]}">${KIND_LABEL[reg.kind]}</span>
          ${reg.revoked ? '<span class="chip danger">Revoked</span>' : ''}
          ${showKey && key ? `<span class="chip"><span class="key-dot" style="background:${esc(key.color)};width:12px;height:12px;border-width:0;box-shadow:none"></span>${esc(key.name)}</span>` : ''}
        </div>
        ${subParts.length ? `<div class="row-sub">${esc(subParts.join(' · '))}</div>` : ''}
      </div>
      <div class="row-actions">
        <button class="btn-icon" data-edit-reg="${reg.id}" title="Edit">${I.edit}</button>
        <button class="btn-icon danger" data-del-reg="${reg.id}" title="Remove">${I.trash}</button>
      </div>
    </div>`;
}

function capacityHTML(used, total, color) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  return `<span class="cap-inline"><span class="cap-text">${used} / ${total}</span><span class="cap-bar"><span class="cap-fill" style="width:${pct}%;background:${color}"></span></span></span>`;
}

function fileRow(f) {
  return `
    <div class="row">
      <span class="svc-icon sm">${I.file}</span>
      <div class="row-main">
        <div class="row-title">${esc(f.name)}</div>
        <div class="row-sub">${formatSize(f.size)} · ${esc(formatDate(f.createdAt))}</div>
      </div>
      <div class="row-actions">
        <a class="btn-icon" href="/api/attachments/${f.id}" title="Download">${I.download}</a>
        <button class="btn-icon danger" data-del-att="${f.id}" data-att-name="${esc(f.name)}" title="Delete">${I.trash}</button>
      </div>
    </div>`;
}

function checklistHTML(regs) {
  const done = regs.filter((r) => r.revoked).length;
  return `
    <section class="section checklist-section">
      <div class="section-head">
        <h2>Revocation checklist</h2>
        <span class="count">${done}/${regs.length} revoked</span>
      </div>
      <div class="checklist-note">This key is marked <b>lost</b>. Remove its access at each service below, then tick it off.</div>
      <div class="row-list">
        ${regs.map((r) => {
          const svc = serviceById(r.serviceId) || { name: '(deleted service)' };
          return `
          <label class="row check-row ${r.revoked ? 'is-revoked' : ''}">
            <input type="checkbox" data-revoke="${r.id}" ${r.revoked ? 'checked' : ''}>
            ${serviceIconHTML(svc, 'sm')}
            <div class="row-main">
              <div class="row-title">${esc(svc.name)} <span class="chip ${KIND_CHIP[r.kind]}">${KIND_LABEL[r.kind]}</span></div>
              ${r.account ? `<div class="row-sub">${esc(r.account)}</div>` : ''}
            </div>
            <span class="chip ${r.revoked ? 'ok' : 'danger'}">${r.revoked ? 'revoked' : 'still active'}</span>
          </label>`;
        }).join('')}
      </div>
    </section>`;
}

export function viewKeyDetail(key) {
  const regs = regsForKey(key.id);
  const signIns = regs.filter((r) => r.kind !== 'totp');
  const totps = regs.filter((r) => r.kind === 'totp');
  const files = attachmentsForKey(key.id);
  const model = catalogModel(key);
  const formFactor = allFormFactors().find((f) => f.id === key.formFactor);
  const totpSupported = !(model && model.totpSlots === 0);
  const unknown = '<span class="muted">Unknown</span>';
  const none = '<span class="muted">—</span>';

  const facts = [
    ['Vendor', key.vendor ? esc(key.vendor) : unknown],
    ['Model', key.model ? esc(key.model) : unknown],
    ['Form factor', esc(formFactor ? formFactor.name : key.formFactor)],
    ['Serial', key.serial ? `<code>${esc(key.serial)}</code>` : none],
    ['Purchased', key.purchasedAt ? esc(formatDate(key.purchasedAt)) : none],
    ['Last tested', key.verifiedAt ? esc(formatDate(key.verifiedAt)) : '<span class="muted">Never</span>'],
  ];
  if (model && model.passkeySlots) {
    facts.push(['Passkeys', capacityHTML(signIns.filter((r) => r.kind === 'passkey').length, model.passkeySlots, 'var(--accent)')]);
  }
  if (model && model.totpSlots) facts.push(['TOTP slots', capacityHTML(totps.length, model.totpSlots, 'var(--warn)')]);
  else if (!totpSupported) facts.push(['TOTP', '<span class="muted">Not supported</span>']);
  facts.push(['Pairing', key.credentialId
    ? `<span class="chip ok">Paired</span>${key.prfEnabled ? '<span class="chip" title="Supports end-to-end encrypted notes">PRF</span>' : ''}`
    : '<span class="muted">Not paired</span>']);
  if (key.hasSecret && key.credentialId) {
    facts.push(['Secret note', `<span class="secret-inline">${key.secretEncrypted
      ? '<span class="chip ok" title="Encrypted in your browser with a key only this hardware can derive">E2E</span>'
      : '<span class="chip warn" title="Stored unencrypted on the server. Re-pair and re-save the note to upgrade">Server-stored</span>'}<button class="btn btn-sm" id="reveal-btn">Tap key to reveal</button></span>`]);
  }

  return `
    <a class="back-link" href="#/keys">${I.back} All keys</a>
    <div class="key-page">
      <div class="key-main">
        <div class="key-hero" style="--key-color:${esc(key.color)}">
          <div class="key-art-wrap">${keyVisual(key, 96)}</div>
          <div class="hero-info">
            <h1>${esc(key.name)} <span class="status-badge status-${esc(key.status)}">${STATUS_LABEL[key.status]}</span></h1>
            <div class="meta">
              <span class="tag-no">${tagNo(key.id)}</span>
              <span class="dot"></span>
              <span>${esc([key.vendor, key.model].filter(Boolean).join(' ') || 'Model unknown')}</span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn btn-sm" data-edit-key>${I.edit} Edit</button>
            <button class="btn btn-sm" data-verify-key title="Confirm this key still works">${I.check} Tested</button>
            <button class="btn btn-sm" data-print-tag title="Print an asset tag">${I.print} Print</button>
            <span class="hero-actions-gap"></span>
            <button class="btn btn-sm btn-danger" data-del-key title="Delete key">${I.trash} Delete</button>
          </div>
        </div>

        ${key.status === 'lost' && regs.length ? checklistHTML(regs) : ''}

        <section class="section">
          <div class="section-head">
            <h2>Registrations</h2><span class="count">${regs.length || ''}</span>
            <div class="grow"></div>
            <button class="btn btn-sm" data-add-reg="passkey">${I.plus} Sign-in</button>
            ${totpSupported ? `<button class="btn btn-sm" data-add-reg="totp">${I.plus} TOTP</button>` : ''}
          </div>
          <div class="row-list">
            ${regs.length
              ? [...signIns, ...totps].map((r) => regRow(r)).join('')
              : '<div class="section-empty">Nothing registered on this key yet.</div>'}
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>Logbook</h2></div>
          <div class="ledger" id="ledger"><div class="section-empty">Loading…</div></div>
        </section>
      </div>

      <aside class="key-side">
        <section class="section">
          <div class="section-head"><h2>Details</h2></div>
          <dl class="facts">${facts.map(([label, value]) => `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
          <div class="facts-secret"><code class="secret-value" id="secret-value" style="display:none"></code></div>
          ${key.notes ? `<p class="facts-notes">${esc(key.notes)}</p>` : ''}
          ${model && model.note ? `<p class="facts-notes muted">${esc(model.note)}</p>` : ''}
        </section>

        <section class="section">
          <div class="section-head">
            <h2>Files</h2><span class="count">${files.length || ''}</span>
            <div class="grow"></div>
            <button class="btn btn-sm" id="attach-btn">${I.plus} Add</button>
            <input type="file" id="attach-file" hidden>
          </div>
          <div class="row-list">
            ${files.length ? files.map(fileRow).join('') : '<div class="section-empty">No files. Up to 10, 5 MB each.</div>'}
          </div>
        </section>
      </aside>
    </div>`;
}

const EVENT_LABEL = {
  created: 'REG', status: 'STAT', 'registration-added': 'ADD', 'registration-removed': 'DEL',
  revoked: 'REVK', unrevoked: 'UNRV', 'secret-set': 'LOCK', 'secret-cleared': 'CLR',
  paired: 'PAIR', 'attachment-added': 'FILE', 'attachment-removed': 'FILE', verified: 'TEST',
};

export function bindKeyDetail(key) {
  $('[data-edit-key]').addEventListener('click', () => keyModal(key));

  api(`/keys/${key.id}/events`).then((rows) => {
    const box = $('#ledger');
    if (!box) return;
    box.innerHTML = rows.length
      ? rows.map((ev) => `
        <div class="ledger-row">
          <span class="ledger-date">${esc(formatDate(ev.createdAt))}</span>
          <span class="ledger-kind">${esc(EVENT_LABEL[ev.kind] || ev.kind)}</span>
          <span class="ledger-detail">${esc(ev.detail)}</span>
        </div>`).join('')
      : '<div class="section-empty">No entries yet.</div>';
  }).catch(() => {
    const box = $('#ledger');
    if (box) box.innerHTML = '<div class="section-empty">Could not load the logbook.</div>';
  });

  $('[data-verify-key]').addEventListener('click', async () => {
    await api(`/keys/${key.id}/verify`, { method: 'POST', body: {} });
    toast('Marked as tested today');
    refresh();
  });

  $('[data-print-tag]').addEventListener('click', () => printTag(key));

  const revealBtn = $('#reveal-btn');
  if (revealBtn) {
    let hideTimer = null;
    revealBtn.addEventListener('click', async () => {
      const valueEl = $('#secret-value');
      if (valueEl.style.display !== 'none') {
        valueEl.style.display = 'none';
        valueEl.textContent = '';
        revealBtn.textContent = 'Tap key to reveal';
        clearTimeout(hideTimer);
        return;
      }
      revealBtn.disabled = true;
      revealBtn.textContent = 'Touch your key…';
      try {
        const secret = await revealSecret(key);
        valueEl.textContent = secret;
        valueEl.style.display = '';
        revealBtn.textContent = 'Hide';
        hideTimer = setTimeout(() => {
          valueEl.style.display = 'none';
          valueEl.textContent = '';
          revealBtn.textContent = 'Tap key to reveal';
        }, 30000);
      } catch (err) {
        toast(err.name === 'NotAllowedError' ? 'Cancelled or timed out' : err.message, 'error');
        revealBtn.textContent = 'Tap key to reveal';
      } finally {
        revealBtn.disabled = false;
      }
    });
  }

  const attachBtn = $('#attach-btn');
  if (attachBtn) {
    attachBtn.addEventListener('click', () => $('#attach-file').click());
    $('#attach-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast('Files can be at most 5 MB', 'error');
        return;
      }
      try {
        const dataUrl = await new Promise((ok, bad) => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result);
          fr.onerror = bad;
          fr.readAsDataURL(file);
        });
        await api(`/keys/${key.id}/attachments`, {
          body: { name: file.name, mime: file.type || 'application/octet-stream', data: String(dataUrl).split(',')[1] || '' },
        });
        toast('File added');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
  $$('[data-revoke]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const reg = state.registrations.find((r) => r.id === Number(cb.dataset.revoke));
      if (!reg) return;
      try {
        await api(`/registrations/${reg.id}`, { method: 'PUT', body: { ...reg, revoked: cb.checked } });
        refresh();
      } catch (err) {
        toast(err.message, 'error');
        cb.checked = !cb.checked;
      }
    }));

  $$('[data-del-att]').forEach((b) =>
    b.addEventListener('click', () => {
      const att = state.attachments.find((a) => a.id === Number(b.dataset.delAtt));
      if (!att) return;
      deleteWithUndo({
        label: `Deleted ${att.name}`,
        apply: () => { state.attachments = state.attachments.filter((a) => a.id !== att.id); },
        revert: () => { state.attachments.push(att); },
        commit: (o) => api(`/attachments/${att.id}`, { method: 'DELETE', ...o }),
      });
    }));
  $('[data-del-key]').addEventListener('click', async () => {
    const n = regsForKey(key.id).length;
    const ok = await confirmDialog({
      title: `Delete "${key.name}"?`,
      message: n
        ? `This key has <b>${n}</b> tracked registration${n > 1 ? 's' : ''}. They will be removed too. The services themselves stay in your list.`
        : 'This cannot be undone.',
    });
    if (!ok) return;
    await api(`/keys/${key.id}`, { method: 'DELETE' });
    toast('Key deleted');
    location.hash = '#/keys';
    refresh();
  });
  $$('[data-add-reg]').forEach((b) =>
    b.addEventListener('click', () => registrationModal({ key, presetKind: b.dataset.addReg })));
  $$('.row[data-svc-id]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-actions')) return;
      const sid = Number(row.dataset.svcId);
      if (sid) serviceDetailModal(sid);
    }));
  $$('[data-edit-reg]').forEach((b) =>
    b.addEventListener('click', () => {
      const reg = state.registrations.find((r) => r.id === Number(b.dataset.editReg));
      if (reg) registrationModal({ key: keyById(reg.keyId), reg });
    }));
  $$('[data-del-reg]').forEach((b) =>
    b.addEventListener('click', () => {
      const reg = state.registrations.find((r) => r.id === Number(b.dataset.delReg));
      if (!reg) return;
      const svc = serviceById(reg.serviceId);
      deleteWithUndo({
        label: `Removed ${svc ? svc.name : 'registration'}`,
        apply: () => { state.registrations = state.registrations.filter((r) => r.id !== reg.id); },
        revert: () => { state.registrations.push(reg); },
        commit: (o) => api(`/registrations/${reg.id}`, { method: 'DELETE', ...o }),
      });
    }));
}
