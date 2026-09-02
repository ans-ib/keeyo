import { pickKeyModal } from '../forms/registration-form.js';
import { serviceModal } from '../forms/service-form.js';
import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { KIND_CHIP, KIND_LABEL, STATUS_LABEL, keyById, regsForService, serviceById, state } from '../state.js';
import { openModal } from '../ui/modal.js';
import { serviceIconHTML } from '../ui/service-icon.js';
import { deleteWithUndo } from '../ui/undo.js';

const MAX_PILLS = 3;

function serviceCoverage(svcId) {
  const regs = regsForService(svcId);
  const keys = [...new Set(regs.map((r) => r.keyId))].map(keyById).filter(Boolean);
  const usable = keys.filter((k) => k.status === 'active' || k.status === 'backup');
  return { regs, keys, usable };
}

function listHTML() {
  const q = state.svcSearch.trim().toLowerCase();
  const services = state.services.filter((s) =>
    !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));

  let list;
  if (state.services.length === 0) {
    list = `
      <div class="empty-state" style="padding:46px 20px">
        <h2>No services on file</h2>
        <button class="btn btn-primary" data-add-svc>${I.plus} Add a service</button>
      </div>`;
  } else {
    const cards = services.map((svc) => {
      const { keys } = serviceCoverage(svc.id);
      const open = state.svcOpen === svc.id;
      const shown = keys.slice(0, MAX_PILLS);
      const keyPills = shown.map((k) =>
        `<span class="key-pill ${k.status === 'lost' || k.status === 'retired' ? 'lost' : ''}"
          title="${STATUS_LABEL[k.status]}" data-goto-key="${k.id}">
          <span class="kp-dot" style="background:${esc(k.color)}"></span>${esc(k.name)}</span>`).join('')
        + (keys.length > MAX_PILLS ? `<span class="key-pill more">+${keys.length - MAX_PILLS}</span>` : '');
      return `
        <article class="svc-card ${open ? 'open' : ''}">
          <div class="svc-head" role="button" tabindex="0" data-svc-toggle="${svc.id}" aria-expanded="${open}">
            <div class="svc-head-main">
              ${serviceIconHTML(svc)}
              <div class="row-title">${esc(svc.name)}</div>
              <span class="svc-caret">${I.chevron}</span>
            </div>
            <div class="svc-keys">${keyPills || '<span class="muted small">No keys yet</span>'}</div>
          </div>
          <div class="svc-body"><div class="svc-body-inner">
            <div class="row-list">
              ${svcKeyRows(svc.id) || '<div class="section-empty">Not registered on any key yet.</div>'}
            </div>
            ${svc.notes ? `<p class="small muted" style="white-space:pre-wrap;margin:10px 0 0">${esc(svc.notes)}</p>` : ''}
            <div class="svc-actions">
              <button type="button" class="btn btn-sm" data-edit-svc="${svc.id}">Edit</button>
              <button type="button" class="btn btn-sm" data-reg-more="${svc.id}">${I.plus} Another key</button>
              <div class="grow"></div>
              <button type="button" class="btn btn-sm btn-danger" data-del-svc="${svc.id}">${I.trash} Delete</button>
            </div>
          </div></div>
        </article>`;
    }).join('');

    list = `
      <div class="svc-grid">
        ${cards || '<div class="section-empty">No services match.</div>'}
      </div>`;
  }
  return list;
}

export function viewServicesHome() {
  return `
    <div class="page-head">
      <h1>Services</h1>
      <div class="grow"></div>
      ${state.services.length ? `<div class="search-box">${I.search}<input id="svc-search" type="text" placeholder="Search" value="${esc(state.svcSearch)}"></div>` : ''}
      <button class="btn btn-primary" data-add-svc>${I.plus} Add service</button>
    </div>
    <div id="svc-list-host" class="grid-host">${listHTML()}</div>
    ${state.services.length ? `<p class="list-total">${state.services.length} service${state.services.length === 1 ? '' : 's'} total</p>` : ''}`;
}

function renderList() {
  const host = $('#svc-list-host');
  if (!host) return;
  host.classList.remove('swap');
  host.innerHTML = listHTML();
  void host.offsetWidth;
  host.classList.add('swap');
  bindList(host);
}

export function bindServicesSection() {
  $$('.page-head [data-add-svc]').forEach((b) => b.addEventListener('click', () => serviceModal()));
  bindList($('#svc-list-host'));

  const search = $('#svc-search');
  if (search) {
    search.addEventListener('input', () => {
      state.svcSearch = search.value;
      renderList();
    });
  }
}

function bindList(host) {
  $$('[data-add-svc]', host).forEach((b) => b.addEventListener('click', () => serviceModal()));

  $$('[data-svc-toggle]', host).forEach((head) => {
    const toggle = () => {
      const card = head.closest('.svc-card');
      const wasOpen = card.classList.contains('open');
      $$('.svc-card.open').forEach((c) => {
        c.classList.remove('open');
        const h = $('[data-svc-toggle]', c);
        if (h) h.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        card.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
        state.svcOpen = Number(head.dataset.svcToggle);
      } else {
        state.svcOpen = null;
      }
    };
    head.addEventListener('click', (e) => {
      if (e.target.closest('[data-goto-key]')) return;
      toggle();
    });
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  $$('[data-goto-key]', host).forEach((dot) =>
    dot.addEventListener('click', () => { location.hash = `#/keys/${dot.dataset.gotoKey}`; }));
  $$('[data-goto]', host).forEach((b) =>
    b.addEventListener('click', () => { location.hash = `#/keys/${b.dataset.goto}`; }));
  $$('[data-edit-svc]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const svc = serviceById(Number(b.dataset.editSvc));
      if (svc) serviceModal(svc);
    }));
  $$('[data-reg-more]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const svc = serviceById(Number(b.dataset.regMore));
      if (svc) pickKeyModal(svc);
    }));
  $$('[data-del-svc]', host).forEach((b) =>
    b.addEventListener('click', () => {
      const svc = serviceById(Number(b.dataset.delSvc));
      if (!svc) return;
      const svcRegs = regsForService(svc.id);
      state.svcOpen = null;
      deleteWithUndo({
        label: `Deleted ${svc.name}`,
        apply: () => {
          state.services = state.services.filter((s) => s.id !== svc.id);
          state.registrations = state.registrations.filter((r) => r.serviceId !== svc.id);
        },
        revert: () => {
          state.services.push(svc);
          state.registrations.push(...svcRegs);
        },
        commit: (o) => api(`/services/${svc.id}`, { method: 'DELETE', ...o }),
        rerender: renderList,
      });
    }));
}

function svcKeyRows(svcId) {
  const { regs } = serviceCoverage(svcId);
  const byKey = new Map();
  for (const r of regs) {
    if (!byKey.has(r.keyId)) byKey.set(r.keyId, []);
    byKey.get(r.keyId).push(r);
  }
  return [...byKey.entries()].map(([kid, keyRegs]) => {
    const k = keyById(kid);
    const chips = keyRegs.map((r) =>
      `<span class="chip ${KIND_CHIP[r.kind]}">${KIND_LABEL[r.kind]}${r.revoked ? ' · revoked' : ''}</span>`).join(' ');
    const subParts = [
      ...new Set(keyRegs.map((r) => r.account).filter(Boolean)),
      ...new Set(keyRegs.filter((r) => r.kind === 'totp' && r.totpApp).map((r) => `TOTP in ${r.totpApp}`)),
    ];
    return `
      <div class="row">
        <span class="key-dot" style="background:${esc(k ? k.color : '#888')}">${esc(k ? k.name.charAt(0).toUpperCase() : '?')}</span>
        <div class="row-main">
          <div class="row-title">${esc(k ? k.name : '(deleted key)')}
            ${chips}
            ${k && (k.status === 'lost' || k.status === 'retired') ? `<span class="status-badge status-${esc(k.status)}">${STATUS_LABEL[k.status]}</span>` : ''}
          </div>
          ${subParts.length ? `<div class="row-sub">${esc(subParts.join(' · '))}</div>` : ''}
        </div>
        ${k ? `<button type="button" class="btn btn-sm btn-ghost" data-goto="${k.id}">Open key</button>` : ''}
      </div>`;
  }).join('');
}

export function serviceDetailModal(svcId) {
  const svc = serviceById(svcId);
  if (!svc) return;
  const regRows = svcKeyRows(svcId);

  openModal({
    title: svc.name,
    submitLabel: 'Edit service',
    bodyHTML: `
      ${svc.url ? `<p class="small" style="margin-top:0"><a href="${esc(/^https?:\/\//i.test(svc.url) ? svc.url : 'https://' + svc.url)}" target="_blank" rel="noopener">${esc(svc.url)}</a></p>` : ''}
      ${svc.notes ? `<p class="small muted" style="white-space:pre-wrap">${esc(svc.notes)}</p>` : ''}
      <div class="section" style="margin:0"><div class="row-list">
        ${regRows || '<div class="section-empty">Not registered on any key yet.</div>'}
      </div></div>`,
    extraFootHTML: `<button type="button" class="btn btn-sm btn-danger left" data-del-svc>Delete</button>
      <button type="button" class="btn btn-sm" data-reg-more>${I.plus} Another key</button>`,
    onOpen: (form, close) => {
      $$('[data-goto]', form).forEach((b) =>
        b.addEventListener('click', () => { close(); location.hash = `#/keys/${b.dataset.goto}`; }));
      $('[data-reg-more]', form).addEventListener('click', () => {
        close();
        pickKeyModal(svc);
      });
      $('[data-del-svc]', form).addEventListener('click', () => {
        close();
        const svcRegs = regsForService(svc.id);
        deleteWithUndo({
          label: `Deleted ${svc.name}`,
          apply: () => {
            state.services = state.services.filter((s) => s.id !== svc.id);
            state.registrations = state.registrations.filter((r) => r.serviceId !== svc.id);
          },
          revert: () => {
            state.services.push(svc);
            state.registrations.push(...svcRegs);
          },
          commit: (o) => api(`/services/${svc.id}`, { method: 'DELETE', ...o }),
        });
      });
    },
    onSubmit: async (form, close) => {
      close();
      serviceModal(svc);
    },
  });
}
