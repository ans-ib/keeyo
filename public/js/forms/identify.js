import { lookupAaguid } from '../catalog.js';
import { I } from '../icons.js';
import { $, esc } from '../lib/dom.js';
import { detectKey, identifyAssertion } from '../lib/webauthn.js';
import { STATUS_LABEL, regsForKey, state } from '../state.js';
import { keyVisual, tagNo } from '../ui/key-art.js';
import { openModal } from '../ui/modal.js';

export function identifyModal() {
  const pairedCount = state.keys.filter((k) => k.credentialId).length;
  openModal({
    title: 'Which key is this?',
    submitLabel: 'Close',
    bodyHTML: `
      <div class="scan-stage">
        <div class="scan-orb">${I.search}</div>
        <p>Plug in the mystery key and touch it when it blinks.
          Several keys plugged in at once is fine — <b>the one you touch is the one identified</b>.</p>
        ${pairedCount
          ? `<button type="button" class="btn btn-primary btn-lg" id="identify-btn">${I.scan}<span>Identify key</span></button>`
          : `<div class="hint" style="margin:0 auto 14px;max-width:330px">None of your keys are paired yet, so exact identification isn't possible —
             pair them by scanning when registering, or via “Pair” in a key's edit form. You can still read the model:</div>`}
        <div class="detect-result" id="identify-result"></div>
        <div><button type="button" class="link-btn" id="id-model-btn">${pairedCount ? 'or just read its model' : 'Read its model'}</button></div>
      </div>`,
    onOpen: (form, close) => {
      $('button[type=submit]', form).classList.remove('btn-primary');
      let controller = null;
      const mo = new MutationObserver(() => {
        if (!document.contains(form)) {
          if (controller) controller.abort();
          mo.disconnect();
        }
      });
      mo.observe($('#modal-root'), { childList: true });

      const result = $('#identify-result', form);

      function showKey(key) {
        const regs = regsForKey(key.id);
        result.innerHTML = `
          <div class="detected-banner ok" style="text-align:left;margin-top:6px">
            <div>${keyVisual(key, 54)}</div>
            <div>
              <b>${esc(key.name)}</b> <span class="tag-no">${tagNo(key.id)}</span>
              <span class="status-badge status-${esc(key.status)}">${STATUS_LABEL[key.status]}</span>
              <div class="hint">${esc([key.vendor, key.model].filter(Boolean).join(' / ') || 'model unknown')}
                · ${regs.length} registration${regs.length === 1 ? '' : 's'}
                ${key.status === 'lost' ? ' · marked LOST — found it? Update its status.' : ''}</div>
              <div style="margin-top:9px"><button type="button" class="btn btn-sm" data-id-open="${key.id}">Open its record</button></div>
            </div>
          </div>`;
        $('[data-id-open]', result).addEventListener('click', () => {
          close();
          location.hash = `#/keys/${key.id}`;
        });
      }

      const identifyBtn = $('#identify-btn', form);
      if (identifyBtn) {
        identifyBtn.addEventListener('click', async () => {
          if (controller) controller.abort();
          controller = new AbortController();
          identifyBtn.classList.add('scanning');
          $('span', identifyBtn).textContent = 'Touch the key…';
          result.innerHTML = '';
          try {
            const key = await identifyAssertion(controller.signal);
            if (!document.contains(form)) return;
            if (key) showKey(key);
            else result.innerHTML = '<span class="chip warn">The key answered, but no record matches — was it deleted?</span>';
          } catch (err) {
            if (!document.contains(form)) return;
            result.innerHTML = `<span class="chip warn">${esc(err.name === 'NotAllowedError' || err.name === 'AbortError'
              ? 'No paired key answered — it may not be paired, or it timed out. Try reading the model below.'
              : err.message)}</span>`;
          } finally {
            if (document.contains(form)) {
              identifyBtn.classList.remove('scanning');
              $('span', identifyBtn).textContent = 'Identify key';
            }
          }
        });
      }

      $('#id-model-btn', form).addEventListener('click', async () => {
        if (controller) controller.abort();
        controller = new AbortController();
        result.innerHTML = '<span class="chip">Touch the key…</span>';
        try {
          const det = await detectKey(controller.signal);
          if (!document.contains(form)) return;
          const hit = await lookupAaguid(det.aaguid);
          if (!document.contains(form)) return;
          if (!hit) {
            result.innerHTML = `<span class="chip warn">Unknown model</span>
              <div class="hint" style="margin-top:6px">Fingerprint <code>${esc(det.aaguid)}</code> isn't in the registry.</div>`;
            return;
          }
          const candidates = state.keys.filter((k) =>
            hit.models.includes(k.model) || k.model === hit.label);
          result.innerHTML = `<span class="chip ok">✓ ${esc(hit.label)}</span>
            <div class="hint" style="margin-top:6px">${candidates.length
              ? `Model matches ${candidates.map((k) => `${tagNo(k.id)} “${esc(k.name)}”`).join(', ')} — pair your keys for exact identification.`
              : 'No key on file has this model — maybe it needs registering?'}</div>`;
        } catch (err) {
          if (!document.contains(form)) return;
          result.innerHTML = `<span class="chip warn">${esc(err.name === 'NotAllowedError' ? 'Cancelled or timed out' : err.message)}</span>`;
        }
      });
    },
    onSubmit: async () => {},
  });
}
