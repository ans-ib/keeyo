import { catalogModel } from '../catalog.js';
import { CATALOG } from '../data/models.js';
import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { refresh } from '../router.js';
import { STATUS_LABEL, keyById, regsForService, serviceById, state } from '../state.js';
import { tagNo } from '../ui/key-art.js';
import { fieldError, openModal } from '../ui/modal.js';
import { serviceIconHTML } from '../ui/service-icon.js';
import { toast } from '../ui/toast.js';

const COMMON_SERVICES = [
  { name: 'GitHub', url: 'github.com' }, { name: 'Google', url: 'google.com' },
  { name: 'Microsoft', url: 'microsoft.com' }, { name: 'Apple', url: 'apple.com' },
  { name: 'Amazon', url: 'amazon.com' }, { name: 'Proton', url: 'proton.me' },
  { name: 'Bitwarden', url: 'bitwarden.com' }, { name: 'Discord', url: 'discord.com' },
  { name: 'X', url: 'x.com' }, { name: 'Facebook', url: 'facebook.com' },
  { name: 'PayPal', url: 'paypal.com' }, { name: 'Cloudflare', url: 'cloudflare.com' },
];

export function registrationModal({ key, reg = null, presetKind = null, presetService = null }) {
  const model = catalogModel(key);
  const editing = !!reg;
  const initialKind = reg ? reg.kind : (presetKind === 'totp' ? 'totp' : 'passkey');
  const svcFixed = editing ? serviceById(reg.serviceId) : null;

  const totpApps = CATALOG.totpApps.map((a) => `<option value="${esc(a)}"></option>`).join('');
  const keyOptions = state.keys.map((k) =>
    `<option value="${k.id}" ${editing && k.id === reg.keyId ? 'selected' : ''}>${esc(`${tagNo(k.id)} · ${k.name}`)}</option>`).join('');

  openModal({
    title: editing ? 'Edit registration' : `Add to "${key.name}"`,
    submitLabel: editing ? 'Save changes' : 'Add',
    bodyHTML: `
      ${editing
        ? `<div class="field"><label>Service</label>
             <div class="selected-service">${serviceIconHTML(svcFixed || { name: '?' }, 'sm')}<span class="name">${esc(svcFixed ? svcFixed.name : '')}</span></div></div>
           <div class="field"><label>On key</label><select name="moveKey">${keyOptions}</select>
             </div>`
        : `<div class="field"><label>Service</label>
             <div class="combo" id="svc-combo">
               <input type="text" name="svcSearch" placeholder="Search or type a new service…" autocomplete="off">
               <div class="combo-list"></div>
             </div>
             <div class="quick-picks" id="quick-picks">
               ${COMMON_SERVICES.map((s) => `<button type="button" class="qp" data-qp="${esc(s.name)}" data-qp-url="${esc(s.url)}">${esc(s.name)}</button>`).join('')}
             </div>
             <div class="selected-service" id="svc-selected" style="display:none">
               <span class="icon-slot"></span><span class="name"></span>
               <button type="button" class="btn-icon" id="svc-clear" title="Change">${I.close}</button>
             </div>
           </div>
           <div id="new-svc-fields" style="display:none">
             <div class="field"><label>Website <span class="muted">(optional)</span></label>
               <input type="text" name="newUrl" placeholder="github.com"></div>
           </div>`}
      <div class="field"><label>Type</label>
        <div class="segmented" id="kind-seg">
          <button type="button" data-kind="passkey" class="${initialKind === 'passkey' ? 'selected' : ''}">Passkey</button>
          <button type="button" data-kind="second-factor" class="${initialKind === 'second-factor' ? 'selected' : ''}">2FA key</button>
          <button type="button" data-kind="totp" class="${initialKind === 'totp' ? 'selected' : ''}">TOTP</button>
        </div>
        <div class="hint" id="kind-hint"></div></div>
      <div class="warn-note" id="totp-warn" style="display:none">${I.warn}<span>The catalog says <b>${esc(key.model || 'this model')}</b> cannot store TOTP secrets — double-check before relying on it.</span></div>
      <div class="field"><label>Account <span class="muted">(optional)</span></label>
        <input type="text" name="account" placeholder="you@example.com or username" value="${esc(reg ? reg.account : '')}"></div>
      <div class="field" id="totp-app-field" style="display:none"><label>Read with app</label>
        <input type="text" name="totpApp" list="totp-apps" placeholder="Yubico Authenticator" value="${esc(reg ? reg.totpApp : '')}">
        <datalist id="totp-apps">${totpApps}</datalist>
        </div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label>
        <textarea name="notes">${esc(reg ? reg.notes : '')}</textarea></div>
      ${editing ? '' : '<label class="check-line"><input type="checkbox" name="addAnother"> Add another to this key after saving</label>'}`,
    onOpen: (form) => {
      let kind = initialKind;
      let selectedService = svcFixed;
      let createNew = false;

      const KIND_HINTS = {
        passkey: 'A passwordless FIDO2 credential stored on the key itself.',
        'second-factor': 'The key is used as a second step after your password (U2F / security key).',
        totp: 'A 6-digit code whose secret is stored on this key.',
      };

      function applyKind() {
        $$('#kind-seg button', form).forEach((b) => b.classList.toggle('selected', b.dataset.kind === kind));
        $('#kind-hint', form).textContent = KIND_HINTS[kind];
        $('#totp-app-field', form).style.display = kind === 'totp' ? '' : 'none';
        $('#totp-warn', form).style.display = (kind === 'totp' && model && model.totpSlots === 0) ? '' : 'none';
      }
      $$('#kind-seg button', form).forEach((b) =>
        b.addEventListener('click', () => { kind = b.dataset.kind; applyKind(); }));
      applyKind();

      if (!editing) {
        const input = form.svcSearch;
        const list = $('.combo-list', form);
        const selectedBox = $('#svc-selected', form);
        const newFields = $('#new-svc-fields', form);
        const quickPicks = $('#quick-picks', form);

        function select(svc) {
          selectedService = svc;
          createNew = false;
          input.parentElement.style.display = 'none';
          list.classList.remove('open');
          selectedBox.style.display = '';
          $('.icon-slot', selectedBox).innerHTML = serviceIconHTML(svc, 'sm');
          $('.name', selectedBox).textContent = svc.name;
          newFields.style.display = 'none';
          quickPicks.style.display = 'none';
        }

        function selectCreate(name, url = '') {
          selectedService = { name };
          createNew = true;
          input.parentElement.style.display = 'none';
          list.classList.remove('open');
          selectedBox.style.display = '';
          $('.icon-slot', selectedBox).innerHTML = serviceIconHTML({ name }, 'sm');
          $('.name', selectedBox).textContent = `${name} (new)`;
          newFields.style.display = '';
          form.newUrl.value = url;
          quickPicks.style.display = 'none';
        }

        function clearSelection() {
          selectedService = null;
          createNew = false;
          selectedBox.style.display = 'none';
          newFields.style.display = 'none';
          input.parentElement.style.display = '';
          input.value = '';
          quickPicks.style.display = '';
          list.classList.remove('open');
        }

        function renderList() {
          const q = input.value.trim().toLowerCase();
          const matches = state.services.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 8);
          const exact = q && state.services.some((s) => s.name.toLowerCase() === q);
          list.innerHTML = [
            ...matches.map((s) => {
              const n = new Set(regsForService(s.id).map((r) => r.keyId)).size;
              return `<button type="button" class="combo-item" data-id="${s.id}">
                ${serviceIconHTML(s, 'sm')}<span>${esc(s.name)}</span>
                <span class="combo-sub">${n ? `on ${n} key${n > 1 ? 's' : ''}` : 'new here'}</span></button>`;
            }),
            (q && !exact) ? `<button type="button" class="combo-item create" data-create="1">${I.plus}<span>Create “${esc(input.value.trim())}”</span></button>` : '',
          ].join('');
          list.classList.toggle('open', !!list.innerHTML);
          $$('.combo-item', list).forEach((item) =>
            item.addEventListener('click', () => {
              if (item.dataset.create) selectCreate(input.value.trim());
              else select(serviceById(Number(item.dataset.id)));
            }));
        }

        input.addEventListener('input', renderList);
        input.addEventListener('click', renderList);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = $('.combo-item', list);
            if (first) first.click();
          } else if (e.key === 'Escape' && list.classList.contains('open')) {
            e.stopPropagation();
            list.classList.remove('open');
          }
        });
        form.addEventListener('mousedown', (e) => {
          if (!e.target.closest('.combo')) list.classList.remove('open');
        });
        $('#svc-clear', form).addEventListener('click', clearSelection);

        $$('.qp', form).forEach((b) =>
          b.addEventListener('click', () => {
            const name = b.dataset.qp;
            const existing = state.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
            if (existing) select(existing);
            else selectCreate(name, b.dataset.qpUrl || '');
          }));

        if (presetService) select(presetService);

        form.resetForNext = () => {
          clearSelection();
          form.account.value = '';
          form.notes.value = '';
        };
      }

      form.getPayload = () => {
        if (!selectedService) throw fieldError('svcSearch', 'Pick a service or type a name to create one');
        const payload = {
          keyId: key.id,
          kind,
          account: form.account.value.trim(),
          totpApp: kind === 'totp' ? form.totpApp.value.trim() : '',
          notes: form.notes.value.trim(),
        };
        if (editing) return payload;
        if (createNew) payload.service = { name: selectedService.name, url: form.newUrl.value.trim(), icon: form.newUrl.value.trim() ? 'favicon' : '' };
        else payload.serviceId = selectedService.id;
        return payload;
      };
    },
    onSubmit: async (form) => {
      const payload = form.getPayload();
      if (editing) {
        payload.keyId = Number(form.moveKey.value) || reg.keyId;
        payload.revoked = reg.revoked;
        await api(`/registrations/${reg.id}`, { method: 'PUT', body: payload });
        toast(payload.keyId !== reg.keyId ? 'Moved to the other key' : 'Registration updated');
      } else {
        await api('/registrations', { body: payload });
        toast('Added to key');
        await refresh();
        if (form.addAnother && form.addAnother.checked) {
          form.keepOpen = true;
          if (form.resetForNext) form.resetForNext();
        }
        return;
      }
      refresh();
    },
  });
}

export function pickKeyModal(svc) {
  const covered = new Set(regsForService(svc.id).map((r) => r.keyId));
  const order = { active: 0, backup: 1, retired: 2, lost: 3 };
  const keys = [...state.keys].sort((a, b) =>
    (covered.has(a.id) - covered.has(b.id)) || (order[a.status] - order[b.status]));
  openModal({
    title: `Register “${svc.name}” on…`,
    submitLabel: 'Cancel',
    bodyHTML: keys.length ? `
      <div class="section" style="margin:0;box-shadow:none"><div class="row-list">
        ${keys.map((k) => `
          <button type="button" class="row clickable pick-row" data-pick="${k.id}">
            <span class="key-dot" style="background:${esc(k.color)}">${esc(k.name.charAt(0).toUpperCase())}</span>
            <div class="row-main"><div class="row-title">${esc(k.name)}
              <span class="status-badge status-${esc(k.status)}">${STATUS_LABEL[k.status]}</span>
              ${covered.has(k.id) ? '<span class="chip ok">already on it</span>' : ''}
            </div></div>
          </button>`).join('')}
      </div></div>` : '<p class="muted">No keys on file yet.</p>',
    onOpen: (form, close) => {
      $('button[type=submit]', form).classList.remove('btn-primary');
      $$('[data-pick]', form).forEach((b) =>
        b.addEventListener('click', () => {
          const k = keyById(Number(b.dataset.pick));
          close();
          if (k) registrationModal({ key: k, presetService: svc });
        }));
    },
    onSubmit: async () => {},
  });
}
