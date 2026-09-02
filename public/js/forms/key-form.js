import { allFormFactors, allSwatches, allVendors, ensureCatalogItem, lookupAaguid, modelsForVendor } from '../catalog.js';
import { I } from '../icons.js';
import { api } from '../lib/api.js';
import { $, $$, esc } from '../lib/dom.js';
import { derivePrfForKey, encryptNote } from '../lib/secret-notes.js';
import { ZERO_AAGUID, detectKey } from '../lib/webauthn.js';
import { refresh } from '../router.js';
import { STATUS_LABEL } from '../state.js';
import { keyArt, tagNo } from '../ui/key-art.js';
import { fieldError, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export function keyModal(existing = null) {
  const swatches = allSwatches();
  const k = existing || { name: '', vendor: 'Yubico', model: '', serial: '', color: swatches[Math.floor(Math.random() * 6)], formFactor: '', status: 'active', purchasedAt: '', notes: '', image: '' };

  const vendors = allVendors();
  if (k.vendor && !vendors.some((v) => v.id === k.vendor)) vendors.push({ id: k.vendor, name: k.vendor });
  const ffs = allFormFactors();
  if (k.formFactor && !ffs.some((f) => f.id === k.formFactor)) ffs.push({ id: k.formFactor, name: k.formFactor });

  const isCustomModel = !!(existing && k.model && !modelsForVendor(k.vendor).some((m) => m.name === k.model));

  const vendorOptions = [
    ...vendors.map((v) => `<option value="${esc(v.id)}" ${v.id === k.vendor ? 'selected' : ''}>${esc(v.name)}</option>`),
    '<option value="__custom__">＋ Custom vendor…</option>',
  ].join('');
  const ffOptions = [
    `<option value="" disabled ${!k.formFactor ? 'selected' : ''}>Select…</option>`,
    ...ffs.map((f) => `<option value="${esc(f.id)}" ${f.id === k.formFactor ? 'selected' : ''}>${esc(f.name)}</option>`),
    '<option value="__custom__">＋ Custom…</option>',
  ].join('');
  const statusOptions = Object.entries(STATUS_LABEL).map(([id, label]) =>
    `<option value="${id}" ${id === k.status ? 'selected' : ''}>${label}</option>`).join('');

  let detectedAaguid = '';
  let detectedNfc = false;
  let credential = null;
  let image = k.image || '';

  const scanStep = existing ? '' : `
      <div class="wizard-step" id="step-scan">
        <div class="scan-stage">
          <div class="scan-orb">${I.scan}</div>
          <h3>Scan your key</h3>
          <p>Plug it into this device and touch it when it blinks. Keeyo reads the model and pairs with the key — nothing is written to it.</p>
          <button type="button" class="btn btn-primary btn-lg" id="detect-btn">${I.scan}<span>Scan key</span></button>
          <div class="detect-result" id="detect-result"></div>
          <div><button type="button" class="link-btn" id="manual-btn">or add it manually</button></div>
        </div>
      </div>`;

  const secretInputHTML = `
        <label>Secret note <span class="muted">(PIN, PUK… optional)</span></label>
        <input type="password" name="secretInput" autocomplete="off" maxlength="200"
          placeholder="${existing && existing.hasSecret ? 'Currently set — type to replace' : 'e.g. this key’s PIN'}">
        ${existing && existing.hasSecret ? '<label class="check-line"><input type="checkbox" name="clearSecret"> Clear the stored note</label>' : ''}
        <div class="hint" id="secret-mode-hint">Never shown in the app — revealed only after tapping this exact physical key.</div>`;

  let secretField;
  if (existing && !existing.credentialId) {
    secretField = `
      <div class="field" id="pair-field">
        <label>Secret note <span class="muted">(requires pairing)</span></label>
        <button type="button" class="btn btn-sm" id="pair-btn">${I.scan} Pair with this physical key</button>
        
      </div>
      <div class="field" id="secret-field" style="display:none">${secretInputHTML}</div>`;
  } else {
    const upgrade = existing && existing.credentialId && !existing.prfEnabled && !existing.hasSecret;
    secretField = `
      ${upgrade ? `
      <div class="field" id="pair-field">
        <label>Encryption upgrade</label>
        <button type="button" class="btn btn-sm" id="pair-btn">${I.scan} Re-pair to enable encrypted notes</button>
        
      </div>` : ''}
      <div class="field" id="secret-field" style="${existing ? '' : 'display:none'}">${secretInputHTML}</div>`;
  }

  openModal({
    title: existing ? 'Key record' : 'Register a key',
    submitLabel: existing ? 'Save changes' : 'Add to register',
    wide: true,
    bodyHTML: `
      ${scanStep}
      <div class="wizard-step ${existing ? '' : 'step-hidden'}" id="step-form">
      <div id="detected-banner"></div>
      <div class="field"><label>Name</label>
        <input type="text" name="name" required placeholder="e.g. Daily driver, Desk drawer backup" value="${esc(k.name)}">
        </div>
      <div class="field-row">
        <div class="field"><label>Vendor</label><select name="vendorSelect">${vendorOptions}</select></div>
        <div class="field"><label>Model</label><select name="modelSelect"></select></div>
      </div>
      <div class="field" id="custom-vendor-field" style="display:none"><label>Custom vendor name</label>
        <input type="text" name="vendorCustom" placeholder="e.g. HyperFIDO" maxlength="60">
        </div>
      <div class="field" id="custom-model-field" style="display:none"><label>Custom model name</label>
        <input type="text" name="modelCustom" value="${isCustomModel ? esc(k.model) : ''}" placeholder="Model name" maxlength="60">
        </div>
      <div class="field-row">
        <div class="field"><label>Form factor</label><select name="ffSelect">${ffOptions}</select></div>
        <div class="field"><label>Serial number <span class="muted">(optional)</span></label>
          <input type="text" name="serial" value="${esc(k.serial)}"></div>
      </div>
      <div class="field" id="custom-ff-field" style="display:none"><label>Custom form factor</label>
        <input type="text" name="ffCustom" placeholder="e.g. Keychain fob" maxlength="60">
        </div>
      <div class="field"><label>Color tag</label>
        <div class="swatches">
          ${swatches.map((c) => `<button type="button" class="swatch ${c === k.color ? 'selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          <input type="color" class="swatch-custom" name="colorCustom" value="${esc(k.color)}" title="Custom color">
        </div>
        </div>
      <div class="field-row">
        <div class="field"><label>Status</label><select name="status">${statusOptions}</select></div>
        <div class="field"><label>Purchased <span class="muted">(optional)</span></label>
          <input type="date" name="purchasedAt" value="${esc(k.purchasedAt)}"></div>
      </div>
      <div class="field"><label>Photo <span class="muted">(optional)</span></label>
        <div class="photo-row">
          <span class="photo-preview" id="photo-preview"></span>
          <button type="button" class="btn btn-sm" id="photo-btn">Upload image</button>
          <button type="button" class="btn btn-sm btn-ghost" id="photo-clear" style="display:none">Remove</button>
          <input type="file" id="photo-file" accept="image/*" style="display:none">
        </div>
        </div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label>
        <textarea name="notes" placeholder="PIN hint location, keychain it lives on…">${esc(k.notes)}</textarea></div>
      ${secretField}
      </div>`,
    onOpen: (form) => {
      let color = k.color;
      const vendorSel = form.vendorSelect;
      const modelSel = form.modelSelect;

      const currentVendor = () =>
        vendorSel.value === '__custom__' ? form.vendorCustom.value.trim() : vendorSel.value;

      function fillModels(preferred) {
        const models = modelsForVendor(currentVendor());
        modelSel.innerHTML = [
          ...models.map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`),
          '<option value="__custom__">＋ Custom model…</option>',
        ].join('');
        if (preferred === '__custom__' || models.length === 0) modelSel.value = '__custom__';
        else if (preferred && models.some((m) => m.name === preferred)) modelSel.value = preferred;
        else modelSel.selectedIndex = 0;
        onModelChange(false);
      }

      function onModelChange(applyFormFactor = true) {
        const custom = modelSel.value === '__custom__';
        $('#custom-model-field', form).style.display = custom ? '' : 'none';
        if (!custom && applyFormFactor) {
          const m = modelsForVendor(currentVendor()).find((x) => x.name === modelSel.value);
          if (m && [...form.ffSelect.options].some((o) => o.value === m.formFactor)) {
            form.ffSelect.value = m.formFactor;
            onFfChange();
          }
        }
      }

      function onFfChange() {
        $('#custom-ff-field', form).style.display = form.ffSelect.value === '__custom__' ? '' : 'none';
      }

      vendorSel.addEventListener('change', () => {
        $('#custom-vendor-field', form).style.display = vendorSel.value === '__custom__' ? '' : 'none';
        fillModels(null);
        onModelChange(true);
      });
      modelSel.addEventListener('change', () => onModelChange(true));
      form.ffSelect.addEventListener('change', onFfChange);

      fillModels(isCustomModel ? '__custom__' : (k.model || null));
      onFfChange();

      $$('.swatch', form).forEach((sw) =>
        sw.addEventListener('click', () => {
          color = sw.dataset.color;
          form.colorCustom.value = color;
          $$('.swatch', form).forEach((s) => s.classList.toggle('selected', s === sw));
        }));
      form.colorCustom.addEventListener('input', () => {
        color = form.colorCustom.value;
        $$('.swatch', form).forEach((s) => s.classList.remove('selected'));
      });
      form.getColor = () => color;

      const submitBtn = $('button[type=submit]', form);
      function showStep(step) {
        const scan = $('#step-scan', form);
        if (!scan) return;
        const formStep = $('#step-form', form);
        scan.classList.toggle('step-hidden', step === 'form');
        formStep.classList.toggle('step-hidden', step !== 'form');
        submitBtn.style.display = step === 'form' ? '' : 'none';
        if (step === 'form') form.elements.namedItem('name').focus();
      }
      if (!existing) showStep('scan');
      const manualBtn = $('#manual-btn', form);
      if (manualBtn) manualBtn.addEventListener('click', () => showStep('form'));

      function updateSecretHint() {
        const hint = $('#secret-mode-hint', form);
        if (!hint) return;
        const prfCapable = credential ? credential.prfEnabled : !!(existing && existing.prfEnabled);
        hint.textContent = prfCapable
          ? 'End-to-end encrypted with this key — even the server database cannot read it. Saving asks for one extra tap.'
          : 'Never shown in the app — revealed only after tapping this exact physical key. Stored on the server unencrypted.';
      }
      updateSecretHint();

      const pairBtn = $('#pair-btn', form);
      if (pairBtn) {
        pairBtn.addEventListener('click', async () => {
          pairBtn.disabled = true;
          pairBtn.innerHTML = `${I.scan} Touch your key…`;
          try {
            const det = await detectKey();
            if (!document.contains(form)) return;
            if (!det.credential) throw new Error('The browser could not export a pairing credential');
            credential = det.credential;
            detectedAaguid = det.aaguid;
            detectedNfc = det.transports.includes('nfc');
            $('#pair-field', form).style.display = 'none';
            $('#secret-field', form).style.display = '';
            updateSecretHint();
            toast(credential.prfEnabled ? 'Paired with encryption support — save to keep it' : 'Paired — save to keep it');
          } catch (err) {
            if (!document.contains(form)) return;
            toast(err.name === 'NotAllowedError' ? 'Cancelled or timed out' : err.message, 'error');
            pairBtn.disabled = false;
            pairBtn.innerHTML = `${I.scan} Pair with this physical key`;
          }
        });
      }

      function renderPhoto() {
        const preview = $('#photo-preview', form);
        preview.innerHTML = image ? `<img src="${image}" alt="">` : keyArt({ color: form.getColor(), formFactor: 'usb-a' }, 40);
        $('#photo-clear', form).style.display = image ? '' : 'none';
      }
      $('#photo-btn', form).addEventListener('click', () => $('#photo-file', form).click());
      $('#photo-clear', form).addEventListener('click', () => { image = ''; renderPhoto(); });
      $('#photo-file', form).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const source = await new Promise((ok, bad) => {
            const reader = new FileReader();
            reader.onload = () => ok(String(reader.result));
            reader.onerror = () => bad(new Error('Could not read that file'));
            reader.readAsDataURL(file);
          });
          const img = new Image();
          await new Promise((ok, bad) => {
            img.onload = ok;
            img.onerror = () => bad(new Error('That file is not an image the browser can decode'));
            img.src = source;
          });
          const scale = Math.min(1, 320 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          image = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
          if (image.length > 400000) image = canvas.toDataURL('image/jpeg', 0.8);
          if (image.length > 400000) throw new Error('That image is too detailed to store — try a smaller crop');
          renderPhoto();
        } catch (err) {
          toast(err.message || 'Could not read that image', 'error');
        }
      });
      renderPhoto();

      const detectBtn = $('#detect-btn', form);
      if (detectBtn) {
        let controller = null;
        const mo = new MutationObserver(() => {
          if (!document.contains(form)) {
            if (controller) controller.abort();
            mo.disconnect();
          }
        });
        mo.observe($('#modal-root'), { childList: true });

        async function applyDetection(aaguid, transports) {
          const result = $('#detect-result', form);
          const banner = $('#detected-banner', form);
          const tChips = transports.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ');
          if (aaguid === ZERO_AAGUID) {
            result.innerHTML = '<span class="chip warn">The browser hid the key\'s identity — try again and allow seeing the key\'s make &amp; model.</span>';
            return;
          }
          detectedAaguid = aaguid;
          detectedNfc = transports.includes('nfc');
          if (credential) {
            $('#secret-field', form).style.display = '';
            updateSecretHint();
          }
          const hit = await lookupAaguid(aaguid);
          if (!document.contains(form)) return;

          if (!hit) {
            banner.innerHTML = `<div class="detected-banner warn">${I.warn}
              <div><b>New model.</b> Fingerprint <code>${esc(aaguid)}</code> isn't in the registry —
              fill in vendor &amp; model once and Keeyo will recognize it forever. ${tChips}</div></div>`;
            result.innerHTML = '<span class="chip warn">Unknown model — continuing…</span>';
            setTimeout(() => { if (document.contains(form)) showStep('form'); }, 500);
            return;
          }

          if ([...vendorSel.options].some((o) => o.value === hit.vendor)) {
            vendorSel.value = hit.vendor;
            $('#custom-vendor-field', form).style.display = 'none';
          } else if (hit.vendor) {
            vendorSel.value = '__custom__';
            $('#custom-vendor-field', form).style.display = '';
            form.vendorCustom.value = hit.vendor;
          }
          fillModels(null);
          const variants = hit.models.filter((m) => [...modelSel.options].some((o) => o.value === m));
          if (variants.length >= 1) {
            modelSel.value = variants[0];
            onModelChange(true);
          } else {
            modelSel.value = '__custom__';
            onModelChange(false);
            form.modelCustom.value = hit.label;
          }
          const icon = hit.icon && /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(hit.icon)
            ? `<img class="detect-icon" src="${hit.icon}" alt="">` : '';
          banner.innerHTML = `<div class="detected-banner ok">${icon || I.scan}
            <div><b>${esc(hit.label)}</b> recognized ${tChips}
            ${variants.length > 1 ? `<div class="hint">This fingerprint is shared by ${variants.length} variants — pick the exact one in the model list.</div>` : ''}</div></div>`;
          result.innerHTML = `<span class="chip ok">✓ ${esc(hit.label)}</span>`;
          setTimeout(() => { if (document.contains(form)) showStep('form'); }, 500);
        }

        detectBtn.addEventListener('click', async () => {
          const result = $('#detect-result', form);
          if (controller) controller.abort();
          controller = new AbortController();
          detectBtn.classList.add('scanning');
          $('span', detectBtn).textContent = 'Touch your key…';
          result.innerHTML = '';
          try {
            const det = await detectKey(controller.signal);
            if (!document.contains(form)) return;
            credential = det.credential;
            await applyDetection(det.aaguid, det.transports);
          } catch (err) {
            if (!document.contains(form)) return;
            let msg = err.message;
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
              msg = 'Cancelled or timed out — click to try again.';
            } else if (err.name === 'SecurityError') {
              msg = `Browsers only allow scanning on a hostname — open Keeyo via http://localhost:${location.port || 80} (or HTTPS) instead of an IP address.`;
            }
            result.innerHTML = `<span class="chip danger">${esc(msg)}</span>`;
          } finally {
            if (document.contains(form)) {
              detectBtn.classList.remove('scanning');
              $('span', detectBtn).textContent = 'Scan key';
            }
          }
        });
      }
    },
    onSubmit: async (form) => {
      const vendor = form.vendorSelect.value === '__custom__' ? form.vendorCustom.value.trim() : form.vendorSelect.value;
      if (form.vendorSelect.value === '__custom__' && !vendor) throw fieldError('vendorCustom', 'Enter the custom vendor name');
      const model = form.modelSelect.value === '__custom__' ? form.modelCustom.value.trim() : form.modelSelect.value;
      let formFactor = form.ffSelect.value === '__custom__' ? form.ffCustom.value.trim() : form.ffSelect.value;
      if (form.ffSelect.value === '__custom__' && !formFactor) throw fieldError('ffCustom', 'Enter the custom form factor name');
      if (!formFactor && model) {
        const m = modelsForVendor(vendor).find((x) => x.name === model);
        if (m && m.formFactor) formFactor = m.formFactor;
      }
      if (!formFactor) throw fieldError('ffSelect', 'Pick a form factor');
      const color = form.getColor().toLowerCase();
      const body = {
        name: form.elements.namedItem('name').value.trim(),
        vendor,
        model,
        serial: form.serial.value.trim(),
        color,
        formFactor,
        status: form.status.value,
        purchasedAt: form.purchasedAt.value,
        notes: form.notes.value.trim(),
        image,
      };
      if (!body.name) throw fieldError('name', 'Give the key a name');
      if (credential) body.credential = credential;
      if (form.secretInput) {
        if (form.clearSecret && form.clearSecret.checked) {
          body.clearSecret = true;
        } else if (form.secretInput.value.trim()) {
          let secretVal = form.secretInput.value.trim();
          const prfCapable = credential ? credential.prfEnabled : !!(existing && existing.prfEnabled);
          const credId = credential ? credential.id : (existing ? existing.credentialId : '');
          if (prfCapable && credId) {
            const salt = crypto.getRandomValues(new Uint8Array(32));
            let prfOut;
            try {
              prfOut = await derivePrfForKey(credId, salt);
            } catch (err) {
              throw new Error(err.name === 'NotAllowedError'
                ? 'Locking the note needs a key tap — nothing was saved, try again'
                : err.message);
            }
            secretVal = await encryptNote(secretVal, prfOut, salt);
          }
          body.secret = secretVal;
        }
      }
      if (existing) {
        await api(`/keys/${existing.id}`, { method: 'PUT', body });
        toast('Key updated');
      } else {
        const created = await api('/keys', { body });
        toast('Key added');
        location.hash = `#/keys/${created.id}`;
      }
      await ensureCatalogItem('vendor', vendor);
      await ensureCatalogItem('form-factor', formFactor);
      await ensureCatalogItem('model', model, { vendor, formFactor: formFactor || 'other', aaguid: detectedAaguid, nfc: detectedNfc });
      await ensureCatalogItem('color', color);
      refresh();
    },
  });
}
