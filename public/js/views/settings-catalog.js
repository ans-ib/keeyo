import { SWATCHES, allFormFactors, allVendors, customCatalog, ensureCatalogItem, updateCatalogItem } from '../catalog.js';
import { CATALOG } from '../data/models.js';
import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { syncData } from '../router.js';
import { state } from '../state.js';
import { fieldError, openModal } from '../ui/modal.js';
import { collapseRow, expandRow } from '../ui/rows.js';
import { toast } from '../ui/toast.js';
import { deleteWithUndo } from '../ui/undo.js';

const TYPES = ['vendor', 'model', 'form-factor', 'color'];
const LABELS = { vendor: 'vendor', model: 'model', 'form-factor': 'form factor', color: 'color' };
const TITLES = { vendor: 'Vendors', model: 'Models', 'form-factor': 'Form factors', color: 'Colors' };

function formFactorName(id) {
  const match = allFormFactors().find((f) => f.id === id);
  return match ? match.name : id;
}

function sourceChip(builtin) {
  return builtin ? '<span class="chip">Built-in</span>' : '<span class="chip accent">Custom</span>';
}

function rowClass(item, mark) {
  if (!item || !mark) return 'row';
  if (mark.flashId === item.id) return 'row row-flash';
  return 'row';
}

function rowActions(item) {
  if (!item) return '<span class="col-actions-2"></span>';
  return `<span class="col-actions-2">
    <button type="button" class="btn-icon" data-edit-cat="${item.id}" title="Edit">${I.edit}</button>
    <button type="button" class="btn-icon danger" data-del-cat="${item.id}" title="Remove">${I.trash}</button>
  </span>`;
}

function simpleTable(builtins, customs, mark, { swatch = false } = {}) {
  const rows = [
    ...builtins.map((name) => ({ name, builtin: true })),
    ...customs.map((c) => ({ name: c.value, builtin: false, item: c })),
  ];
  return `
    <div class="table">
      <div class="table-head"><span class="grow">Name</span><span class="col-source">Source</span><span class="col-actions-2"></span></div>
      ${rows.map((r) => `
      <div class="${rowClass(r.item, mark)}" ${r.item ? `data-cat-row="${r.item.id}"` : ''}>
        <div class="row-main"><div class="row-title">${swatch ? `<span class="color-dot" style="background:${esc(r.name)}"></span>` : ''}${esc(r.name)}</div></div>
        <span class="col-source">${sourceChip(r.builtin)}</span>
        ${rowActions(r.item)}
      </div>`).join('')}
    </div>`;
}

function modelsTable(mark) {
  const customs = customCatalog('model');
  if (!customs.length) {
    return '<div class="table"><div class="section-empty">No custom models yet. Built-in models ship with Keeyo and are picked from the key form.</div></div>';
  }
  return `
    <div class="table">
      <div class="table-head"><span class="grow">Model</span><span class="col-wide">Vendor</span><span class="col-wide">Form factor</span><span class="col-source">Fingerprint</span><span class="col-actions-2"></span></div>
      ${customs.map((c) => `
      <div class="${rowClass(c, mark)}" data-cat-row="${c.id}">
        <div class="row-main"><div class="row-title">${esc(c.value)}${c.extra.nfc ? '<span class="chip">NFC</span>' : ''}</div></div>
        <span class="col-wide">${esc(c.extra.vendor || '—')}</span>
        <span class="col-wide">${esc(formFactorName(c.extra.formFactor || 'other'))}</span>
        <span class="col-source">${c.extra.aaguid ? '<span class="chip ok">Learned</span>' : '<span class="chip">None</span>'}</span>
        ${rowActions(c)}
      </div>`).join('')}
    </div>`;
}

function tableHTML(type, mark) {
  if (type === 'vendor') return simpleTable(CATALOG.vendors.map((v) => v.name), customCatalog('vendor'), mark);
  if (type === 'model') return modelsTable(mark);
  if (type === 'form-factor') return simpleTable(CATALOG.formFactors.map((f) => f.name), customCatalog('form-factor'), mark);
  return simpleTable(SWATCHES, customCatalog('color'), mark, { swatch: true });
}

function renderTable(type, mark = null) {
  const host = $(`[data-cat-table="${type}"]`);
  if (!host) return;
  host.innerHTML = tableHTML(type, mark);
  bindTable(host);
  if (mark && mark.highlightId) expandRow($(`[data-cat-row="${mark.highlightId}"]`, host));
}

function bindTable(host) {
  $$('[data-edit-cat]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const item = state.catalog.find((c) => c.id === Number(b.dataset.editCat));
      if (item) catalogModal(item.type, item);
    }));

  $$('[data-del-cat]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const item = state.catalog.find((c) => c.id === Number(b.dataset.delCat));
      if (!item) return;
      const row = b.closest('.row');
      $$('button', row).forEach((x) => { x.disabled = true; });
      collapseRow(row).then(() => {
        deleteWithUndo({
          label: `Removed ${item.value}`,
          apply: () => { state.catalog = state.catalog.filter((c) => c.id !== item.id); },
          revert: () => { state.catalog.push(item); },
          commit: (o) => api(`/catalog/${item.id}`, { method: 'DELETE', ...o }),
          rerender: () => renderTable(item.type, { highlightId: item.id }),
        });
      });
    }));
}

function sectionHead(type) {
  return `
    <div class="section-title-row">
      <div><h2>${TITLES[type]}</h2></div>
      <button type="button" class="btn" data-add-cat="${type}">${I.plus} Add ${LABELS[type]}</button>
    </div>`;
}

export function viewCatalogSection() {
  return `
    ${TYPES.map((type) => `
    <section class="settings-section">
      ${sectionHead(type)}
      <div data-cat-table="${type}">${tableHTML(type)}</div>
    </section>`).join('')}
    <section class="settings-section">
      <h2>Device recognition</h2>
      <div id="registry-status" class="muted small">Checking…</div>
      ${state.me.isAdmin ? `<div class="settings-actions top"><button class="btn" id="registry-refresh">${I.scan} Refresh now</button></div>` : ''}
    </section>`;
}

function catalogModal(type, existing = null) {
  const item = existing || { value: type === 'color' ? '#8b5cf6' : '', extra: {} };
  const label = LABELS[type];
  let body;
  if (type === 'model') {
    const vendorOpts = allVendors().map((v) =>
      `<option value="${esc(v.id)}" ${v.id === (item.extra.vendor || '') ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    const ffOpts = allFormFactors().map((f) =>
      `<option value="${esc(f.id)}" ${f.id === (item.extra.formFactor || 'usb-a') ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    body = `
      <div class="field"><label>Vendor</label><select name="vendor">${vendorOpts}</select></div>
      <div class="field"><label>Model name</label><input type="text" name="value" required maxlength="60" value="${esc(item.value)}" placeholder="e.g. YubiKey 5C NFC"></div>
      <div class="field"><label>Form factor</label><select name="formFactor">${ffOpts}</select></div>
      <label class="check-line"><input type="checkbox" name="nfc" ${item.extra.nfc ? 'checked' : ''}><span>Has NFC</span></label>
      ${item.extra.aaguid ? `<div class="field field-gap"><label>Learned fingerprint</label><input type="text" value="${esc(item.extra.aaguid)}" readonly></div>` : ''}`;
  } else if (type === 'color') {
    body = `
      <div class="field"><label>Color</label>
        <div class="color-pick"><input type="color" name="value" value="${esc(item.value)}"><code class="color-hex">${esc(item.value)}</code></div></div>`;
  } else {
    body = `
      <div class="field"><label>Name</label>
        <input type="text" name="value" required maxlength="60" value="${esc(item.value)}" placeholder="${type === 'vendor' ? 'e.g. HyperFIDO' : 'e.g. Keychain fob'}"></div>`;
  }

  openModal({
    title: existing ? `Edit ${label}` : `Add ${label}`,
    submitLabel: existing ? 'Save changes' : 'Add',
    bodyHTML: body,
    onOpen: (form) => {
      if (type !== 'color') return;
      const input = form.elements.namedItem('value');
      input.addEventListener('input', () => { $('.color-hex', form).textContent = input.value; });
    },
    onSubmit: async (form) => {
      let value = form.elements.namedItem('value').value.trim();
      if (type === 'color') value = value.toLowerCase();
      if (!value) throw fieldError('value', `Enter a ${label}`);
      const extra = type === 'model'
        ? { vendor: form.vendor.value, formFactor: form.formFactor.value, nfc: form.nfc.checked, aaguid: item.extra.aaguid || '' }
        : {};
      if (existing) {
        await updateCatalogItem(existing.id, value, extra);
        try { await syncData(); } catch {}
        for (const t of TYPES) renderTable(t, t === type ? { flashId: existing.id } : null);
        toast('Saved');
        return;
      }
      const created = await ensureCatalogItem(type, value, extra);
      if (!created) throw new Error('Already in the list');
      renderTable(type, { highlightId: created.id });
      toast('Added');
    },
  });
}

async function loadRegistryStatus() {
  const box = $('#registry-status');
  if (!box) return;
  try {
    const s = await api('/registry');
    if (!$('#registry-status')) return;
    if (s.offline) {
      $('#registry-status').textContent = 'Updates disabled (KEEYO_OFFLINE) — using the bundled fingerprints and your learned catalog.';
      return;
    }
    if (!s.count) {
      $('#registry-status').textContent = s.refreshing
        ? 'Downloading the registry for the first time…'
        : 'Not downloaded yet — it fetches automatically, or refresh now.';
      return;
    }
    $('#registry-status').innerHTML = `<span class="chips">${(s.sources || []).map((src) => `<span class="chip">${esc(src)}</span>`).join('')}${s.refreshing ? '<span class="chip">refreshing…</span>' : (s.stale ? '<span class="chip warn">stale</span>' : '')}</span>`;
  } catch {
    if ($('#registry-status')) $('#registry-status').textContent = 'Could not read registry status.';
  }
}

export function bindCatalogSection() {
  loadRegistryStatus();
  const refreshBtn = $('#registry-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing…';
      try {
        const s = await api('/registry/refresh', { method: 'POST', body: {} });
        toast(`Registry updated — ${s.count} devices`);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if ($('#registry-refresh')) {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = `${I.scan} Refresh now`;
        }
        loadRegistryStatus();
      }
    });
  }

  $$('[data-add-cat]').forEach((b) => b.addEventListener('click', () => catalogModal(b.dataset.addCat)));
  $$('[data-cat-table]').forEach(bindTable);
}
