import { keyModal } from './forms/key-form.js';
import { $ } from './lib/dom.js';
import { boot, parseRoute } from './router.js';
import { state } from './state.js';

document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.classList.contains('fav')) t.remove();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if ($('#modal-root').firstElementChild) return;
  if (!state.me) return;
  if (e.key === '/') {
    const s = $('#key-search') || $('#svc-search');
    if (s) {
      e.preventDefault();
      s.focus();
    }
  } else if (e.key.toLowerCase() === 'n' && parseRoute().page === 'keys') {
    e.preventDefault();
    keyModal();
  }
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
    hadController = true;
  });
  navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
}

document.addEventListener('keeyo:signed-out', boot);
boot();
