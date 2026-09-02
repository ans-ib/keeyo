import { identifyModal } from '../forms/identify.js';
import { keyModal } from '../forms/key-form.js';
import { I } from '../icons.js';
import { $, $$, esc } from '../lib/dom.js';
import { STALE_DAYS, STATUS_LABEL, regsForKey, serviceById, staleKeys, state } from '../state.js';
import { keyArt, keyVisual, tagNo } from '../ui/key-art.js';

const FILTERS = ['all', 'active', 'backup', 'lost', 'retired'];

function keyMatchesSearch(key, q) {
  if (!q) return { match: true };
  const hay = `${key.name} ${key.vendor} ${key.model} ${key.serial}`.toLowerCase();
  if (hay.includes(q)) return { match: true };
  const svcHit = regsForKey(key.id)
    .map((r) => serviceById(r.serviceId))
    .find((s) => s && s.name.toLowerCase().includes(q));
  if (svcHit) return { match: true, via: svcHit.name };
  return { match: false };
}

function visibleKeys() {
  const q = state.keySearch.trim().toLowerCase();
  let pool = state.keys;
  if (state.keyStatusFilter !== 'all') pool = pool.filter((k) => k.status === state.keyStatusFilter);
  if (state.keySort === 'name') pool = [...pool].sort((a, b) => a.name.localeCompare(b.name));
  else if (state.keySort === 'vendor') pool = [...pool].sort((a, b) => (a.vendor + a.model).localeCompare(b.vendor + b.model));
  else pool = [...pool].reverse();
  return pool.map((k) => ({ key: k, ...keyMatchesSearch(k, q) })).filter((m) => m.match);
}

function cardHTML({ key, via }, idx) {
  const regs = regsForKey(key.id);
  const nPass = regs.filter((r) => r.kind === 'passkey').length;
  const n2fa = regs.filter((r) => r.kind === 'second-factor').length;
  const nTotp = regs.filter((r) => r.kind === 'totp').length;
  const inactive = key.status === 'lost' || key.status === 'retired';
  return `
    <div class="key-card ${inactive ? 'is-inactive' : ''}" data-key-id="${key.id}" style="--key-color:${esc(key.color)};--i:${Math.min(idx, 12)}">
      <div class="key-card-top">
        <span class="key-color"></span>
        <span class="tag-no">${tagNo(key.id)}</span>
        <span class="grow"></span>
        <span class="status-badge status-${esc(key.status)}">${STATUS_LABEL[key.status]}</span>
      </div>
      <div class="key-art-wrap">${keyVisual(key, 92)}</div>
      <h3>${esc(key.name)}</h3>
      <div class="key-model">${esc([key.vendor, key.model].filter(Boolean).join(' / ') || 'Model unknown')}</div>
      <div class="chips">
        ${nPass ? `<span class="chip accent">${nPass} PK</span>` : ''}
        ${n2fa ? `<span class="chip info">${n2fa} 2FA</span>` : ''}
        ${nTotp ? `<span class="chip warn">${nTotp} TOTP</span>` : ''}
        ${regs.length === 0 ? '<span class="chip">empty</span>' : ''}
        ${via ? `<span class="chip ok">has ${esc(via)}</span>` : ''}
      </div>
    </div>`;
}

function gridHTML() {
  if (state.keys.length === 0) {
    return `
      <div class="empty-state">
        <div class="art">${keyArt({ color: 'var(--accent)', formFactor: 'usb-a' }, 120)}</div>
        <h2>No keys on file</h2>
        <button class="btn btn-primary" data-add-key>${I.plus} Register first key</button>
      </div>`;
  }
  const matches = visibleKeys();
  return `
    <div class="key-grid">
      ${matches.map(cardHTML).join('')}
      <div class="key-card add-card" data-add-key style="--i:${Math.min(matches.length, 13)}">${I.plus}<span>Register new key</span></div>
    </div>
    ${matches.length === 0 ? '<div class="empty-state"><p>No keys match.</p></div>' : ''}`;
}

function bannersHTML() {
  let banner = '';
  const lostPending = state.keys
    .filter((k) => k.status === 'lost')
    .map((k) => ({ k, n: regsForKey(k.id).filter((r) => !r.revoked).length }))
    .filter((x) => x.n > 0);
  if (lostPending.length) {
    banner += `<div class="notice-strip danger-strip">${I.warn}
      <span>Lost ${lostPending.map((x) => `${tagNo(x.k.id)} “${esc(x.k.name)}” still trusted by ${x.n} service${x.n > 1 ? 's' : ''}`).join(' · ')}</span>
      <a href="#/keys/${lostPending[0].k.id}">Open checklist</a></div>`;
  }
  const stale = staleKeys();
  if (stale.length) {
    banner += `<div class="notice-strip">${I.warn}
      <span>${stale.length === 1 ? `${tagNo(stale[0].id)} “${esc(stale[0].name)}” hasn't` : `${stale.length} keys haven't`} been tested in ${STALE_DAYS / 30}+ months — plug in and confirm ${stale.length === 1 ? 'it still works' : 'they still work'}</span>
      <a href="#/keys/${stale[0].id}">Open key</a></div>`;
  }
  return banner;
}

export function viewKeys() {
  const toolbar = state.keys.length ? `
    <div class="grid-toolbar">
      <div class="filter-chips">
        ${FILTERS.map((s) => `<button class="fchip ${state.keyStatusFilter === s ? 'on' : ''}" data-filter="${s}">${s === 'all' ? 'All' : STATUS_LABEL[s]}</button>`).join('')}
      </div>
      <div class="grow"></div>
      <select id="key-sort" class="sort-select" title="Sort">
        <option value="newest" ${state.keySort === 'newest' ? 'selected' : ''}>Newest first</option>
        <option value="name" ${state.keySort === 'name' ? 'selected' : ''}>By name</option>
        <option value="vendor" ${state.keySort === 'vendor' ? 'selected' : ''}>By vendor</option>
      </select>
    </div>` : '';

  return `
    <div class="page-head">
      <h1>Keys</h1>
      <div class="grow"></div>
      <div class="search-box">${I.search}<input id="key-search" type="text" placeholder="Search" value="${esc(state.keySearch)}"></div>
      ${state.keys.length ? `<button class="btn" id="identify-key-btn" title="Plug a key in, tap it, and Keeyo names it">${I.scan} Identify key</button>` : ''}
      <button class="btn btn-primary" data-add-key>${I.plus} Register key</button>
    </div>
    ${toolbar}
    ${bannersHTML()}
    <div id="key-grid-host" class="grid-host">${gridHTML()}</div>
    ${state.keys.length ? `<p class="list-total">${state.keys.length} key${state.keys.length === 1 ? '' : 's'} total</p>` : ''}`;
}

function bindGrid(host) {
  $$('[data-add-key]', host).forEach((b) => b.addEventListener('click', () => keyModal()));
  $$('[data-key-id]', host).forEach((card) =>
    card.addEventListener('click', () => { location.hash = `#/keys/${card.dataset.keyId}`; }));
}

function renderGrid() {
  const host = $('#key-grid-host');
  if (!host) return;
  host.classList.remove('swap');
  host.innerHTML = gridHTML();
  void host.offsetWidth;
  host.classList.add('swap');
  bindGrid(host);
}

export function bindKeys() {
  $$('.page-head [data-add-key]').forEach((b) => b.addEventListener('click', () => keyModal()));
  bindGrid($('#key-grid-host'));

  $$('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      if (state.keyStatusFilter === b.dataset.filter) return;
      state.keyStatusFilter = b.dataset.filter;
      $$('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      renderGrid();
    }));

  const sortSel = $('#key-sort');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      state.keySort = sortSel.value;
      renderGrid();
    });
  }

  const identifyBtn = $('#identify-key-btn');
  if (identifyBtn) identifyBtn.addEventListener('click', identifyModal);

  const search = $('#key-search');
  if (search) {
    search.addEventListener('input', () => {
      state.keySearch = search.value;
      renderGrid();
    });
  }
}
