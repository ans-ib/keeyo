import { api } from './lib/api.js';
import { $, esc } from './lib/dom.js';
import { keyById, loadData, state } from './state.js';
import { app, shell } from './ui/shell.js';
import { renderLogin, renderResetComplete, renderSetup } from './views/auth.js';
import { bindKeyDetail, viewKeyDetail } from './views/key-detail.js';
import { bindKeys, viewKeys } from './views/keys.js';
import { bindServicesSection, viewServicesHome } from './views/services.js';
import { bindSettings, swapSettingsSection, viewSettings } from './views/settings.js';

export async function boot() {
  try {
    const status = await api('/status');
    state.sso = status.sso || { enabled: false };
    state.resetAvailable = !!status.resetAvailable;
    const resetMatch = location.hash.match(/^#\/reset\/([A-Za-z0-9_-]{20,100})$/);
    if (resetMatch) return renderResetComplete(resetMatch[1]);
    if (status.needsSetup) return renderSetup();
    if (!status.authenticated) return renderLogin();
    await loadData();
    render();
  } catch (err) {
    app.innerHTML = `<div class="boot-splash"><p>Could not reach the Keeyo server.<br><span class="muted small">${esc(err.message)}</span></p>
      <button class="btn" id="boot-retry">Retry</button></div>`;
    $('#boot-retry').addEventListener('click', () => location.reload());
  }
}

const SETTINGS_SECTIONS = ['account', 'security', 'tokens', 'catalog', 'users', 'sso', 'email'];
const ADMIN_SECTIONS = ['users', 'sso', 'email'];

export function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, id] = hash.split('/');
  if (page === 'keys' && id) return { page: 'key', id: Number(id) };
  if (page === 'services') return { page: 'services' };
  if (page === 'settings' && id === 'services') return { page: 'services' };
  if (page === 'settings') return { page: 'settings', section: id || 'account' };
  return { page: 'keys' };
}

let lastRouteKey = '';

export function render() {
  if (!state.me) return;
  const route = parseRoute();
  if (route.page === 'settings' && (route.section === 'data' || route.section === 'appearance')) route.section = 'account';
  if (route.page === 'settings' &&
      (!SETTINGS_SECTIONS.includes(route.section) || (ADMIN_SECTIONS.includes(route.section) && !state.me.isAdmin))) {
    route.section = 'account';
  }
  const routeKey = `${route.page}:${route.id || route.section || ''}`;
  const previous = lastRouteKey;
  const anim = routeKey !== previous;
  lastRouteKey = routeKey;

  if (route.page === 'key') {
    const key = keyById(route.id);
    if (!key) { location.hash = '#/keys'; return; }
    shell(viewKeyDetail(key), 'keys', anim);
    bindKeyDetail(key);
  } else if (route.page === 'settings') {
    if (previous.startsWith('settings:') && $('.settings-main')) swapSettingsSection(route.section);
    else shell(viewSettings(route.section), 'settings', anim);
    bindSettings(route.section);
  } else if (route.page === 'services') {
    shell(viewServicesHome(), 'services', anim);
    bindServicesSection();
  } else {
    shell(viewKeys(), 'keys', anim);
    bindKeys();
  }
}

window.addEventListener('hashchange', render);

export async function syncData() {
  const data = await api('/data');
  state.keys = data.keys;
  state.services = data.services;
  state.registrations = data.registrations;
  state.catalog = data.catalog || [];
  state.attachments = data.attachments || [];
}

export async function refresh() {
  await syncData();
  render();
}
