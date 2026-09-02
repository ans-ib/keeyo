import { $ } from '../lib/dom.js';

export function toast(message, type = 'success', { actionLabel, onAction, duration = 2800 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      el.remove();
      if (onAction) onAction();
    });
    el.appendChild(btn);
  }
  $('#toast-root').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, duration);
  return el;
}
