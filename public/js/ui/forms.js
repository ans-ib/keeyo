import { $$ } from '../lib/dom.js';

const NOTE_OUT_MS = 200;

export function fieldError(field, message) {
  const err = new Error(message);
  err.field = field;
  return err;
}

function fieldOf(control) {
  return control.closest('.field') || control.parentElement;
}

function labelFor(control) {
  const label = fieldOf(control).querySelector('label');
  const text = label ? label.textContent.replace(/\(optional\)/i, '').trim() : '';
  return text || 'This field';
}

export function markInvalid(control, message) {
  control.classList.add('invalid');
  control.setAttribute('aria-invalid', 'true');
  const field = fieldOf(control);
  let note = field.querySelector('.field-error');
  if (!note) {
    note = document.createElement('div');
    note.className = 'field-error';
    note.innerHTML = '<span></span>';
    field.appendChild(note);
    void note.offsetHeight;
  }
  clearTimeout(note.removeTimer);
  note.firstElementChild.textContent = message;
  note.classList.add('open');
}

export function clearInvalid(control) {
  control.classList.remove('invalid');
  control.removeAttribute('aria-invalid');
  const note = fieldOf(control).querySelector('.field-error');
  if (!note) return;
  note.classList.remove('open');
  note.removeTimer = setTimeout(() => note.remove(), NOTE_OUT_MS);
}

export function bindValidation(form) {
  form.setAttribute('novalidate', '');
  const clearOnEdit = (e) => {
    if (e.target.classList && e.target.classList.contains('invalid')) clearInvalid(e.target);
  };
  form.addEventListener('input', clearOnEdit);
  form.addEventListener('change', clearOnEdit);
}

export function validateRequired(form) {
  const missing = $$('[required]', form).filter((c) => !c.disabled && c.offsetParent !== null && !String(c.value || '').trim());
  if (!missing.length) return true;
  missing.forEach((c) => markInvalid(c, `${labelFor(c)} is required`));
  missing[0].focus();
  return false;
}

export function hideError(form) {
  const box = form.querySelector('.form-error');
  if (box) box.classList.remove('visible');
}

export function showError(form, err) {
  const control = err && err.field ? form.elements.namedItem(err.field) : null;
  if (control && typeof control.focus === 'function') {
    markInvalid(control, err.message);
    control.focus();
    return;
  }
  const box = form.querySelector('.form-error');
  if (!box) return;
  box.textContent = (err && err.message) || 'Something went wrong';
  box.classList.add('visible');
}
