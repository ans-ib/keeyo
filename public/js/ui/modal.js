import { I } from '../icons.js';
import { $, $$, esc } from '../lib/dom.js';
import { bindValidation, hideError, showError, validateRequired } from './forms.js';

export { fieldError } from './forms.js';

export function openModal({ title, bodyHTML, submitLabel = 'Save', danger = false, extraFootHTML = '', wide = false, onOpen, onSubmit }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <form class="modal ${wide ? 'modal-wide' : ''}" novalidate>
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="btn-icon" data-close aria-label="Close">${I.close}</button>
        </div>
        <div class="modal-body"><div class="form-error"></div>${bodyHTML}</div>
        <div class="modal-foot">
          ${extraFootHTML}
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>
        </div>
      </form>
    </div>`;

  const overlay = $('.modal-overlay', root);
  const form = $('form.modal', root);
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-label', title);
  const prevFocus = document.activeElement;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('closing');
    if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
    setTimeout(() => {
      if (root.firstElementChild === overlay) root.innerHTML = '';
      else overlay.remove();
    }, 170);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]', form)
        .filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  $$('[data-close]', form).forEach((b) => b.addEventListener('click', close));
  bindValidation(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(form);
    if (!validateRequired(form)) return;
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await onSubmit(form, close);
      if (form.keepOpen) form.keepOpen = false;
      else close();
    } catch (err) {
      showError(form, err);
    } finally {
      if (!closed) btn.disabled = false;
    }
  });

  if (onOpen) onOpen(form, close);
  const first = $('input, select, textarea', form);
  if (first) first.focus();
  return { form, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const { form } = openModal({
      title,
      bodyHTML: `<p class="confirm-text">${message}</p>`,
      submitLabel: confirmLabel,
      danger,
      onSubmit: async () => { confirmed = true; },
    });
    const observer = new MutationObserver(() => {
      if (!document.contains(form)) {
        observer.disconnect();
        resolve(confirmed);
      }
    });
    observer.observe($('#modal-root'), { childList: true });
  });
}
