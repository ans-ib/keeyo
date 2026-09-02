import { I } from '../icons.js';
import { $, $$, esc } from '../lib/dom.js';
import { toast } from './toast.js';

const COPIED_MS = 1600;

export function copyField(value, { display = value, id = '' } = {}) {
  return `
    <button type="button" class="copy-field" ${id ? `id="${id}"` : ''} data-copy="${esc(value)}" title="Copy to clipboard">
      <code>${esc(display)}</code>
      <span class="copy-hint">${I.copy}<span>Copy</span></span>
    </button>`;
}

export function bindCopyFields(root = document) {
  $$('[data-copy]', root).forEach((field) => {
    const hint = $('.copy-hint span', field);
    let timer = null;
    field.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(field.dataset.copy);
      } catch {
        toast('Copy failed — select it by hand', 'error');
        return;
      }
      field.classList.add('copied');
      hint.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => {
        field.classList.remove('copied');
        hint.textContent = 'Copy';
      }, COPIED_MS);
    });
  });
}
