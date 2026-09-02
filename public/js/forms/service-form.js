import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, domainOf, esc } from '../lib/dom.js';
import { refresh } from '../router.js';
import { fieldError, openModal } from '../ui/modal.js';
import { serviceIconHTML } from '../ui/service-icon.js';
import { toast } from '../ui/toast.js';

const SOURCES = [['selfhst', 'selfh.st'], ['dashboard', 'Dashboard Icons'], ['duckduckgo', 'DuckDuckGo']];
const UPLOAD_SIZE = 96;
const MAX_SVG_BYTES = 60000;

function iconResult(r) {
  return `<button type="button" class="icon-result" data-icon="${esc(r.url)}" title="${esc(r.name)}"><img src="${esc(r.url)}" alt="" loading="lazy"><span>${esc(r.name)}</span></button>`;
}

function readUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    if (file.type === 'image/svg+xml') {
      if (file.size > MAX_SVG_BYTES) { reject(new Error('SVG icons must be under 60 KB')); return; }
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const scale = Math.min(1, UPLOAD_SIZE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function serviceModal(existing = null, onSaved = null) {
  const s = existing || { name: '', url: '', icon: '', notes: '' };

  openModal({
    title: existing ? 'Edit service' : 'Add service',
    submitLabel: existing ? 'Save changes' : 'Add service',
    bodyHTML: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" required placeholder="e.g. GitHub, Google, Proton" value="${esc(s.name)}"></div>
      <div class="field"><label>Website <span class="muted">(optional)</span></label>
        <input type="text" name="url" placeholder="github.com" value="${esc(s.url)}"></div>
      <div class="field"><label>Icon</label>
        <div class="icon-picker">
          <span class="icon-preview" id="icon-preview">${serviceIconHTML({ name: s.name || '?', url: s.url, icon: s.icon })}</span>
          <div class="icon-actions">
            <button type="button" class="btn btn-sm" id="icon-search-btn">${I.search} Search</button>
            <button type="button" class="btn btn-sm" id="icon-upload-btn">${I.upload} Upload</button>
            <input type="file" id="icon-file" accept="image/*" hidden>
          </div>
        </div>
        <div class="icon-search" id="icon-search" hidden>
          <div class="segmented" id="icon-source">
            ${SOURCES.map(([id, label], i) => `<button type="button" data-source="${id}" class="${i === 0 ? 'selected' : ''}">${label}</button>`).join('')}
          </div>
          <input type="text" id="icon-query" placeholder="Search icons…" autocomplete="off" spellcheck="false">
          <div class="icon-results" id="icon-results"></div>
        </div>
      </div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label>
        <textarea name="notes">${esc(s.notes)}</textarea></div>`,
    onOpen: (form) => {
      let icon = s.icon || '';
      let source = SOURCES[0][0];
      let timer = null;
      let seq = 0;
      const nameInput = form.elements.namedItem('name');
      const urlInput = form.url;
      const preview = $('#icon-preview', form);
      const panel = $('#icon-search', form);
      const query = $('#icon-query', form);
      const results = $('#icon-results', form);

      const setIcon = (value) => {
        icon = value;
        preview.innerHTML = serviceIconHTML({ name: nameInput.value || '?', url: urlInput.value, icon });
        $$('.icon-result', results).forEach((b) => b.classList.toggle('on', b.dataset.icon === icon));
      };
      nameInput.addEventListener('input', () => setIcon(icon));
      urlInput.addEventListener('input', () => setIcon(icon));

      const suggestion = () => {
        const domain = domainOf(urlInput.value.trim());
        if (domain) return domain.replace(/^www\./, '').split('.')[0];
        return nameInput.value.trim().toLowerCase();
      };

      function bindResults() {
        $$('.icon-result', results).forEach((b) =>
          b.addEventListener('click', () => {
            setIcon(b.dataset.icon);
            panel.hidden = true;
          }));
      }

      async function runSearch() {
        const q = query.value.trim();
        const id = ++seq;
        if (source === 'duckduckgo') {
          const domain = domainOf(q || urlInput.value.trim());
          results.innerHTML = domain
            ? iconResult({ name: domain, url: `https://icons.duckduckgo.com/ip3/${domain}.ico` })
            : '<div class="icon-empty">Type a domain, e.g. github.com</div>';
          bindResults();
          return;
        }
        if (q.length < 2) {
          results.innerHTML = '<div class="icon-empty">Type at least two characters</div>';
          return;
        }
        results.innerHTML = '<div class="icon-empty">Searching…</div>';
        try {
          const r = await api(`/icons/search?source=${source}&q=${encodeURIComponent(q)}`);
          if (id !== seq) return;
          results.innerHTML = r.results.length ? r.results.map(iconResult).join('') : '<div class="icon-empty">No icons match</div>';
          bindResults();
          setIcon(icon);
        } catch (err) {
          if (id === seq) results.innerHTML = `<div class="icon-empty">${esc(err.message)}</div>`;
        }
      }

      $('#icon-search-btn', form).addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        if (panel.hidden) return;
        if (!query.value) query.value = suggestion();
        query.focus();
        runSearch();
      });
      $$('#icon-source button', form).forEach((b) =>
        b.addEventListener('click', () => {
          source = b.dataset.source;
          $$('#icon-source button', form).forEach((x) => x.classList.toggle('selected', x === b));
          runSearch();
        }));
      query.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(runSearch, 250);
      });
      query.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
      });

      const fileInput = $('#icon-file', form);
      $('#icon-upload-btn', form).addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          setIcon(await readUpload(file));
          panel.hidden = true;
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      form.getIcon = () => icon;
    },
    onSubmit: async (form) => {
      const body = {
        name: form.elements.namedItem('name').value.trim(),
        url: form.url.value.trim(),
        icon: form.getIcon(),
        notes: form.notes.value.trim(),
      };
      if (!body.name) throw fieldError('name', 'Give the service a name');
      let saved;
      if (existing) {
        saved = await api(`/services/${existing.id}`, { method: 'PUT', body });
        toast('Service updated');
      } else {
        saved = await api('/services', { body });
        toast('Service added');
      }
      await refresh();
      if (onSaved) onSaved(saved);
    },
  });
}
