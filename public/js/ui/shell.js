import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { boot } from '../router.js';
import { state } from '../state.js';
import { THEMES, applyTheme, currentTheme } from '../theme.js';
import { bindValidation } from './forms.js';

export const app = $('#app');

const THEME_ICON = { light: 'sun', dark: 'moon', system: 'monitor' };
const POPOVER_OUT_MS = 130;

function themeOptions() {
  const current = currentTheme();
  return THEMES.map((t) => `
    <button type="button" class="popover-item ${t.id === current ? 'on' : ''}" data-theme-pick="${t.id}" role="menuitemradio" aria-checked="${t.id === current}">
      ${I[THEME_ICON[t.id]]}<span>${t.name}</span><span class="check">${I.check}</span>
    </button>`).join('');
}

function railLink(id, href, label, icon, active) {
  return `<a class="rail-item ${active === id ? 'on' : ''}" href="${href}" data-rail="${id}" title="${label}" aria-label="${label}" ${active === id ? 'aria-current="page"' : ''}>${icon}</a>`;
}

function setRailActive(active) {
  $$('[data-rail]').forEach((el) => {
    const on = el.dataset.rail === active;
    el.classList.toggle('on', on);
    if (el.tagName === 'A') {
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  });
}

function setThemeMenu(open) {
  const btn = $('#theme-menu-btn');
  const sub = $('#theme-menu');
  if (!btn || !sub) return;
  sub.classList.toggle('open', open);
  sub.inert = !open;
  btn.setAttribute('aria-expanded', String(open));
}

function openUserMenu() {
  const menu = $('#user-menu');
  const btn = $('#user-menu-btn');
  if (!menu || !btn) return;
  clearTimeout(menu.closeTimer);
  menu.classList.remove('closing');
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function closeUserMenu({ focusButton = false } = {}) {
  const menu = $('#user-menu');
  const btn = $('#user-menu-btn');
  if (!menu || menu.hidden || menu.classList.contains('closing')) return;
  menu.classList.add('closing');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    if (focusButton) btn.focus();
  }
  menu.closeTimer = setTimeout(() => {
    menu.hidden = true;
    menu.classList.remove('closing');
    setThemeMenu(false);
  }, POPOVER_OUT_MS);
}

export function shell(content, active, anim = false) {
  const main = $('main.page');
  if (main && $('.rail') && app.dataset.user === state.me.username) {
    main.className = `page${anim ? ' anim' : ''}`;
    main.innerHTML = content;
    setRailActive(active);
    return;
  }
  app.className = 'app-root has-rail';
  app.dataset.user = state.me.username;
  app.innerHTML = `
    <aside class="rail">
      <a class="rail-logo" href="#/keys" aria-label="Keeyo">${I.mark}</a>
      <nav class="rail-nav" aria-label="Main">
        ${railLink('keys', '#/keys', 'Keys', I.keyIcon, active)}
        ${railLink('services', '#/services', 'Services', I.globe, active)}
      </nav>
      <div class="rail-user">
        <button type="button" class="rail-item ${active === 'settings' ? 'on' : ''}" id="user-menu-btn" data-rail="settings" title="Account" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false">${I.user}</button>
        <div class="popover" id="user-menu" role="menu" hidden>
          <div class="popover-head"><b>${esc(state.me.username)}</b><span>${state.me.isAdmin ? 'Administrator' : 'Member'}</span></div>
          <a class="popover-item" href="#/settings" role="menuitem">${I.gear}<span>Settings</span></a>
          <button type="button" class="popover-item" id="theme-menu-btn" aria-expanded="false" aria-controls="theme-menu">${I[THEME_ICON[currentTheme()]]}<span>Theme</span><span class="caret">${I.chevronRight}</span></button>
          <div class="popover-sub" id="theme-menu" inert><div class="popover-sub-inner">${themeOptions()}</div></div>
          <button type="button" class="popover-item" id="logout-btn" role="menuitem">${I.logout}<span>Sign out</span></button>
        </div>
      </div>
    </aside>
    <main class="page${anim ? ' anim' : ''}">${content}</main>`;

  const menu = $('#user-menu');
  $('#user-menu-btn').addEventListener('click', () => {
    if (menu.hidden || menu.classList.contains('closing')) openUserMenu();
    else closeUserMenu();
  });
  $('a', menu).addEventListener('click', () => closeUserMenu());

  const themeBtn = $('#theme-menu-btn');
  themeBtn.addEventListener('click', () => setThemeMenu(themeBtn.getAttribute('aria-expanded') !== 'true'));
  $$('[data-theme-pick]', menu).forEach((b) =>
    b.addEventListener('click', () => {
      applyTheme(b.dataset.themePick);
      $$('[data-theme-pick]', menu).forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      themeBtn.firstElementChild.outerHTML = I[THEME_ICON[b.dataset.themePick]];
    }));

  $('#logout-btn').addEventListener('click', async () => {
    closeUserMenu();
    const r = await api('/logout', { method: 'POST', body: {} });
    if (r.redirect) {
      location.href = r.redirect;
      return;
    }
    state.me = null;
    boot();
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.rail-user')) closeUserMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserMenu({ focusButton: true });
});

export function authShell(inner) {
  app.className = 'app-root';
  delete app.dataset.user;
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">${I.mark}<span>Keeyo</span></div>
        ${inner}
      </div>
    </div>`;
  $$('form', app).forEach(bindValidation);
}
