'use strict';

/* ============================== helpers ============================== */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// Broken favicon fallback without inline onerror handlers (CSP-safe):
// error events don't bubble but can be captured document-wide.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.classList.contains('fav')) t.remove();
}, true);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function domainOf(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname;
  } catch {
    return '';
  }
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function b64urlToBuf(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function bufToB64url(buf) {
  return bufToB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ============================== icons ============================== */

const I = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  print: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  theme: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  warn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>',
  logo: '<svg width="30" height="30" viewBox="0 0 160 160" aria-hidden="true"><rect x="6" y="6" width="148" height="148" fill="var(--accent)" stroke="var(--border)" stroke-width="10"/><circle cx="80" cy="52" r="21" fill="none" stroke="#fff" stroke-width="11"/><path d="M80 73v46m0-16h25" stroke="#fff" stroke-width="11" stroke-linecap="square" fill="none"/><g fill="#fff"><rect x="26" y="130" width="4" height="14"/><rect x="34" y="130" width="2" height="14"/><rect x="40" y="130" width="5" height="14"/><rect x="49" y="130" width="2" height="14"/><rect x="55" y="130" width="3" height="14"/><rect x="62" y="130" width="6" height="14"/><rect x="72" y="130" width="2" height="14"/><rect x="78" y="130" width="4" height="14"/><rect x="86" y="130" width="2" height="14"/><rect x="92" y="130" width="5" height="14"/><rect x="101" y="130" width="3" height="14"/><rect x="108" y="130" width="2" height="14"/><rect x="114" y="130" width="6" height="14"/><rect x="124" y="130" width="2" height="14"/><rect x="130" y="130" width="4" height="14"/></g></svg>',
  keyIcon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.8 12.2 9.2-9.2m-3 3 3 3"/></svg>',
  lock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  scan: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/></svg>',
  gear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg>',
};

/* ============================== api ============================== */

async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET') };
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch('/api' + path, init);
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && state.me) {
      state.me = null;
      boot();
    }
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================== state ============================== */

const state = {
  me: null,
  keys: [],
  services: [],
  registrations: [],
  catalog: [],
  attachments: [],
  keySearch: '',
  svcSearch: '',
  keyStatusFilter: 'all',
  keySort: 'newest',
};

const STALE_DAYS = 180;

function staleKeys() {
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  return state.keys.filter((k) => {
    if (k.status !== 'active' && k.status !== 'backup') return false;
    const last = new Date(k.verifiedAt || k.createdAt).getTime();
    return Number.isFinite(last) && last < cutoff;
  });
}

const CAT = window.KEEYO_CATALOG;

const KIND_LABEL = { passkey: 'Passkey', 'second-factor': '2FA key', totp: 'TOTP' };
const KIND_CHIP = { passkey: 'accent', 'second-factor': 'info', totp: 'warn' };
const STATUS_LABEL = { active: 'Active', backup: 'Backup', lost: 'Lost', retired: 'Retired' };

const keyById = (id) => state.keys.find((k) => k.id === id);
const serviceById = (id) => state.services.find((s) => s.id === id);
const regsForKey = (id) => state.registrations.filter((r) => r.keyId === id);
const regsForService = (id) => state.registrations.filter((r) => r.serviceId === id);
const attachmentsForKey = (id) => state.attachments.filter((a) => a.keyId === id);

function catalogModel(key) {
  const builtin = CAT.findModel(key.vendor, key.model);
  if (builtin) return builtin;
  const custom = customCatalog('model').find((c) =>
    c.value === key.model && (c.extra.vendor || '') === key.vendor);
  if (!custom) return null;
  return { name: custom.value, formFactor: custom.extra.formFactor || 'other', nfc: !!custom.extra.nfc, passkeySlots: null, totpSlots: null, note: '' };
}

/* ---------- personal catalog (custom vendors/models/form factors/colors) ---------- */

const customCatalog = (type) => state.catalog.filter((c) => c.type === type);

function allVendors() {
  const list = CAT.vendors.map((v) => ({ id: v.id, name: v.name, builtin: true }));
  for (const c of customCatalog('vendor')) {
    if (!list.some((v) => v.id.toLowerCase() === c.value.toLowerCase())) {
      list.push({ id: c.value, name: c.value, builtin: false });
    }
  }
  return list;
}

function modelsForVendor(vendorId) {
  const vid = (vendorId || '').toLowerCase();
  const v = CAT.vendors.find((x) => x.id.toLowerCase() === vid);
  const list = v ? [...v.models] : [];
  for (const c of customCatalog('model')) {
    if ((c.extra.vendor || '').toLowerCase() === vid &&
        !list.some((m) => m.name.toLowerCase() === c.value.toLowerCase())) {
      list.push({ name: c.value, formFactor: c.extra.formFactor || 'other', nfc: !!c.extra.nfc, passkeySlots: null, totpSlots: null, note: '' });
    }
  }
  return list;
}

function allFormFactors() {
  const list = [...CAT.formFactors];
  for (const c of customCatalog('form-factor')) {
    if (!list.some((f) => f.id.toLowerCase() === c.value.toLowerCase())) {
      list.push({ id: c.value, name: c.value });
    }
  }
  return list;
}

function allSwatches() {
  const list = [...SWATCHES];
  for (const c of customCatalog('color')) if (!list.includes(c.value)) list.push(c.value);
  return list;
}

// Persist a custom entry unless it's a built-in or already saved. Returns true if created.
async function ensureCatalogItem(type, value, extra = {}) {
  value = (value || '').trim();
  if (!value) return false;
  if (type === 'vendor' && CAT.vendors.some((v) => v.id.toLowerCase() === value.toLowerCase())) return false;
  if (type === 'form-factor' && CAT.formFactors.some((f) => f.id.toLowerCase() === value.toLowerCase())) return false;
  if (type === 'color' && SWATCHES.includes(value.toLowerCase())) return false;
  if (type === 'model' && CAT.findModel(extra.vendor, value)) return false;
  const exists = customCatalog(type).some((c) =>
    c.value.toLowerCase() === value.toLowerCase() &&
    (type !== 'model' || (c.extra.vendor || '').toLowerCase() === (extra.vendor || '').toLowerCase()));
  if (exists) return false;
  const created = await api('/catalog', { body: { type, value, extra } });
  state.catalog.push(created);
  return true;
}

async function loadData() {
  const [me, data] = await Promise.all([api('/me'), api('/data')]);
  state.me = me;
  state.keys = data.keys;
  state.services = data.services;
  state.registrations = data.registrations;
  state.catalog = data.catalog || [];
  state.attachments = data.attachments || [];
}

async function refresh() {
  const data = await api('/data');
  state.keys = data.keys;
  state.services = data.services;
  state.registrations = data.registrations;
  state.catalog = data.catalog || [];
  state.attachments = data.attachments || [];
  render();
}

/* ============================== key detection (WebAuthn) ============================== */

// Minimal CBOR decoder — only what an attestationObject needs (fallback for
// browsers without AuthenticatorAttestationResponse.getAuthenticatorData()).
function cborDecode(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  function read() {
    const ib = dv.getUint8(p++);
    const mt = ib >> 5;
    const ai = ib & 31;
    let len;
    if (ai < 24) len = ai;
    else if (ai === 24) { len = dv.getUint8(p); p += 1; }
    else if (ai === 25) { len = dv.getUint16(p); p += 2; }
    else if (ai === 26) { len = dv.getUint32(p); p += 4; }
    else if (ai === 27) { len = Number(dv.getBigUint64(p)); p += 8; }
    else throw new Error('Unsupported CBOR');
    switch (mt) {
      case 0: return len;
      case 1: return -1 - len;
      case 2: { const v = bytes.slice(p, p + len); p += len; return v; }
      case 3: { const v = new TextDecoder().decode(bytes.slice(p, p + len)); p += len; return v; }
      case 4: { const a = []; for (let i = 0; i < len; i++) a.push(read()); return a; }
      case 5: { const o = {}; for (let i = 0; i < len; i++) { const k = read(); o[k] = read(); } return o; }
      case 6: return read();
      default:
        if (ai === 20) return false;
        if (ai === 21) return true;
        return null;
    }
  }
  return read();
}

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';

// Runs a throwaway WebAuthn registration to read the key's AAGUID (model
// fingerprint) and transports. The credential is non-discoverable, so it
// consumes none of the key's passkey storage and is never sent to the server.
async function detectKey(signal) {
  if (!window.isSecureContext || !window.PublicKeyCredential) {
    throw new Error('Key detection needs HTTPS or localhost — this page was opened another way.');
  }
  const publicKey = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Keeyo' },
    user: {
      id: crypto.getRandomValues(new Uint8Array(16)),
      name: 'keeyo-detect',
      displayName: 'Keeyo key detection',
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: {
      authenticatorAttachment: 'cross-platform',
      residentKey: 'discouraged',
      userVerification: 'discouraged',
    },
    attestation: 'direct',
    extensions: { prf: {} },
    timeout: 60000,
  };
  const cred = await navigator.credentials.create({ publicKey, signal });
  const resp = cred.response;
  let authData;
  if (typeof resp.getAuthenticatorData === 'function') {
    authData = new Uint8Array(resp.getAuthenticatorData());
  } else {
    authData = cborDecode(new Uint8Array(resp.attestationObject)).authData;
  }
  if (!authData || authData.length < 53) throw new Error('The key did not return identification data.');
  const aaguid = [...authData.slice(37, 53)].map((b, i) =>
    ((i === 4 || i === 6 || i === 8 || i === 10) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
  const transports = typeof resp.getTransports === 'function' ? resp.getTransports() : [];
  // Keep the throwaway credential's public half: it lets Keeyo later prove
  // "this exact physical key is present" before revealing a stored secret.
  // If the authenticator supports the PRF extension, secret notes for this
  // key can be end-to-end encrypted with a key only the hardware can derive.
  let credential = null;
  try {
    const spki = typeof resp.getPublicKey === 'function' ? resp.getPublicKey() : null;
    if (spki) {
      let prfEnabled = false;
      try { prfEnabled = cred.getClientExtensionResults().prf?.enabled === true; } catch { /* no PRF */ }
      credential = {
        id: cred.id,
        publicKey: bufToB64(spki),
        alg: typeof resp.getPublicKeyAlgorithm === 'function' ? resp.getPublicKeyAlgorithm() : -7,
        prfEnabled,
      };
    }
  } catch { /* possession pairing unavailable — detection still works */ }
  return { aaguid, transports, credential };
}

/* ---------- end-to-end encrypted notes (WebAuthn PRF) ---------- */

const isEncryptedNote = (s) => typeof s === 'string' && s.startsWith('enc:v1:');

async function deriveNoteKey(prfOutput, saltBytes) {
  const hkdf = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: new TextEncoder().encode('keeyo-secret-note-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptNote(plaintext, prfOutput, saltBytes) {
  const key = await deriveNoteKey(prfOutput, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  return `enc:v1:${bufToB64url(saltBytes)}:${bufToB64url(iv)}:${bufToB64url(ct)}`;
}

async function decryptNote(envelope, prfOutput) {
  const parts = envelope.split(':');
  const key = await deriveNoteKey(prfOutput, b64urlToBuf(parts[2]));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlToBuf(parts[3]) }, key, b64urlToBuf(parts[4]));
  return new TextDecoder().decode(plain);
}

// Tap the key to derive the note-encryption secret (used when SETTING a note;
// no server involvement — the assertion never leaves the browser).
async function derivePrfForKey(credentialId, saltBytes) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: b64urlToBuf(credentialId) }],
      userVerification: 'discouraged',
      extensions: { prf: { eval: { first: saltBytes } } },
      timeout: 60000,
    },
  });
  const out = assertion.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('This key or browser could not derive the encryption secret (PRF)');
  return new Uint8Array(out);
}

// Prove possession of the paired physical key, then fetch the stored secret.
// For encrypted notes the very same tap also derives the decryption key via
// the PRF extension — the server only ever sees ciphertext.
async function revealSecret(key) {
  const ch = await api(`/keys/${key.id}/reveal-challenge`, { method: 'POST', body: {} });
  const publicKey = {
    challenge: b64urlToBuf(ch.challenge),
    allowCredentials: [{ type: 'public-key', id: b64urlToBuf(key.credentialId) }],
    userVerification: 'discouraged',
    timeout: 60000,
  };
  if (ch.prfSalt) publicKey.extensions = { prf: { eval: { first: b64urlToBuf(ch.prfSalt) } } };
  const assertion = await navigator.credentials.get({ publicKey });
  const r = assertion.response;
  const out = await api(`/keys/${key.id}/reveal`, {
    method: 'POST',
    body: {
      token: ch.token,
      credentialId: assertion.id,
      clientDataJSON: bufToB64url(r.clientDataJSON),
      authenticatorData: bufToB64url(r.authenticatorData),
      signature: bufToB64url(r.signature),
    },
  });
  if (isEncryptedNote(out.secret)) {
    const prfOut = assertion.getClientExtensionResults().prf?.results?.first;
    if (!prfOut) throw new Error('The browser could not derive the decryption secret from this key');
    return decryptNote(out.secret, new Uint8Array(prfOut));
  }
  return out.secret;
}

// Turn a registry device name into a vendor from our catalog (or the first word).
function registryVendor(label) {
  const l = label.toLowerCase();
  if (l.includes('yubico') || l.startsWith('yubikey')) return 'Yubico';
  if (l.includes('token2')) return 'Token2';
  if (l.includes('nitrokey')) return 'Nitrokey';
  if (l.startsWith('solo') || l.includes('solokeys')) return 'SoloKeys';
  if (l.includes('feitian') || l.startsWith('epass') || l.startsWith('biopass') || l.startsWith('iepass')) return 'Feitian';
  if (l.includes('titan')) return 'Google';
  return label.split(/\s+/)[0] || '';
}

// Registry names describe a *series*; map them to the concrete models we know.
function registryModels(label) {
  const rules = [
    [/yubikey 5.*lightning/i, ['YubiKey 5Ci']],
    [/yubikey 5.*nfc/i, ['YubiKey 5 NFC', 'YubiKey 5C NFC']],
    [/yubikey 5/i, ['YubiKey 5C', 'YubiKey 5 Nano', 'YubiKey 5C Nano']],
    [/yubikey bio/i, ['YubiKey Bio (FIDO Edition)', 'YubiKey C Bio (FIDO Edition)']],
    [/security key.*nfc/i, ['Security Key NFC', 'Security Key C NFC']],
    [/token2.*(pin plus|pin\+)/i, ['PIN+ Release2 (USB-A NFC)', 'PIN+ Release2 (USB-C NFC)', 'T2F2 PIN+ TypeC']],
    [/nitrokey 3/i, ['Nitrokey 3A NFC', 'Nitrokey 3C NFC']],
    [/^solo /i, ['Solo 2 A+ (USB-A NFC)', 'Solo 2 C+ (USB-C NFC)']],
    [/titan/i, ['Titan Security Key (USB-A/NFC)', 'Titan Security Key (USB-C/NFC)']],
    [/epass fido2?-nfc/i, ['ePass K9 (USB-A NFC)', 'ePass K40 (USB-C NFC)']],
    [/biopass/i, ['BioPass K26/K27']],
  ];
  for (const [re, models] of rules) if (re.test(label)) return models;
  return [];
}

// Lookup order: your own catalog (learned fingerprints) → the server's live
// registry (FIDO MDS + community, auto-refreshed) → the bundled offline seed.
async function lookupAaguid(aaguid) {
  const c = customCatalog('model').find((m) => (m.extra.aaguid || '') === aaguid);
  if (c) return { vendor: c.extra.vendor || '', label: c.value, models: [c.value], source: 'catalog' };
  try {
    const r = await api(`/aaguid/${aaguid}`);
    if (r.found) {
      return { vendor: registryVendor(r.name), label: r.name, models: registryModels(r.name), icon: r.icon, source: 'registry' };
    }
  } catch { /* registry unavailable — fall through to the seed */ }
  const seed = (window.KEEYO_AAGUIDS || {})[aaguid];
  if (seed) return { ...seed, source: 'seed' };
  return null;
}

/* ============================== key artwork ============================== */

// Technical schematic line drawings — ink outlines on the drafting grid.
function keyArt(key, size = 100) {
  const color = key.color || 'var(--accent)';
  const model = catalogModel(key);
  const nfc = !!(model && model.nfc);
  const ink = 'var(--text)';
  const body = 'var(--panel)';
  const metal = 'var(--panel-2)';
  const gold = 'var(--gold)';
  const ff = key.formFactor || 'usb-a';

  const nfcArcs = nfc
    ? `<g stroke="${color}" stroke-width="2.2" fill="none" opacity="0.9" stroke-linecap="round">
         <path d="M50 14 a9 9 0 0 1 7 9"/><path d="M50 6 a17 17 0 0 1 14 17"/></g>`
    : '';

  let inner = '';
  let vb = '0 0 64 132';
  let w = Math.round(size * (64 / 132));
  let h = size;

  if (ff === 'usb-a' || ff === 'usb-c') {
    const connector = ff === 'usb-a'
      ? `<rect x="20" y="102" width="24" height="27" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="25" y="109" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>
         <rect x="34" y="109" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>`
      : `<rect x="23" y="102" width="18" height="26" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="27" y="109" width="10" height="4" rx="2" fill="none" stroke="${ink}" stroke-width="1.3"/>`;
    inner = `
      <rect x="12" y="2" width="40" height="102" rx="8" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <line x1="32" y1="8" x2="32" y2="98" stroke="${ink}" stroke-width="1" stroke-dasharray="3 5" opacity="0.28"/>
      <circle cx="32" cy="18" r="7" fill="var(--bg)" stroke="${color}" stroke-width="3"/>
      <circle cx="32" cy="60" r="12" fill="none" stroke="${gold}" stroke-width="2.6"/>
      <circle cx="32" cy="60" r="4" fill="${gold}"/>
      ${connector}${nfcArcs}`;
  } else if (ff === 'nano-a' || ff === 'nano-c') {
    const connector = ff === 'nano-a'
      ? `<rect x="20" y="52" width="24" height="32" fill="${metal}" stroke="${ink}" stroke-width="2"/>
         <rect x="25" y="59" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>
         <rect x="34" y="59" width="5" height="6" fill="none" stroke="${ink}" stroke-width="1.4"/>`
      : `<rect x="23" y="52" width="18" height="32" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>`;
    inner = `
      ${connector}
      <rect x="15" y="84" width="34" height="24" rx="5" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="32" cy="96" r="6.5" fill="none" stroke="${gold}" stroke-width="2.4"/>
      <circle cx="32" cy="96" r="2" fill="${gold}"/>
      <circle cx="32" cy="96" r="10.5" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.7"/>`;
  } else if (ff === 'dual') {
    inner = `
      <rect x="23" y="2" width="18" height="22" rx="8" fill="${metal}" stroke="${ink}" stroke-width="2"/>
      <rect x="12" y="22" width="40" height="86" rx="8" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <line x1="32" y1="28" x2="32" y2="102" stroke="${ink}" stroke-width="1" stroke-dasharray="3 5" opacity="0.28"/>
      <circle cx="32" cy="52" r="12" fill="none" stroke="${gold}" stroke-width="2.6"/>
      <circle cx="32" cy="52" r="4" fill="${gold}"/>
      <circle cx="32" cy="88" r="7" fill="var(--bg)" stroke="${color}" stroke-width="3"/>
      <rect x="25" y="108" width="14" height="22" rx="5" fill="${metal}" stroke="${ink}" stroke-width="2"/>
      ${nfcArcs}`;
  } else if (ff === 'card') {
    vb = '0 0 132 84';
    w = size;
    h = Math.round(size * (84 / 132));
    inner = `
      <rect x="2" y="2" width="128" height="80" rx="6" fill="${body}" stroke="${ink}" stroke-width="2.2"/>
      <rect x="14" y="16" width="24" height="18" fill="${gold}" stroke="${ink}" stroke-width="1.5"/>
      <rect x="14" y="52" width="62" height="16" fill="var(--bg)" stroke="${ink}" stroke-width="1.5"/>
      <circle cx="110" cy="26" r="9" fill="none" stroke="${color}" stroke-width="2.6"/>`;
  } else {
    inner = `
      <circle cx="32" cy="30" r="17" fill="${body}" stroke="${color}" stroke-width="4"/>
      <circle cx="32" cy="30" r="7" fill="var(--bg)" stroke="${ink}" stroke-width="2"/>
      <path d="M32 47v72m0-20h15m-15-18h15" stroke="${ink}" stroke-width="6" stroke-linecap="square" fill="none"/>`;
  }

  return `<svg viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
}

// Deterministic pseudo-barcode from the key id — pure decoration, very asset-tag.
function barcodeSVG(id, width = 72, height = 16) {
  let seed = (id * 2654435761) >>> 0;
  const bars = [];
  let x = 0;
  while (x < width - 3) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bw = 1 + (seed % 3);
    if ((seed >> 4) % 3 !== 0) bars.push(`<rect x="${x}" y="0" width="${bw}" height="${height}" fill="currentColor"/>`);
    x += bw + 1;
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${bars.join('')}</svg>`;
}

const tagNo = (id) => `KY-${String(id).padStart(3, '0')}`;

const COMMON_SERVICES = [
  { name: 'GitHub', url: 'github.com' }, { name: 'Google', url: 'google.com' },
  { name: 'Microsoft', url: 'microsoft.com' }, { name: 'Apple', url: 'apple.com' },
  { name: 'Amazon', url: 'amazon.com' }, { name: 'Proton', url: 'proton.me' },
  { name: 'Bitwarden', url: 'bitwarden.com' }, { name: 'Discord', url: 'discord.com' },
  { name: 'X', url: 'x.com' }, { name: 'Facebook', url: 'facebook.com' },
  { name: 'PayPal', url: 'paypal.com' }, { name: 'Cloudflare', url: 'cloudflare.com' },
];

/* ============================== print & export ============================== */

function qrSVG(text) {
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 0 });
  } catch {
    return '';
  }
}

// Physical asset tag for the keychain — the design was always headed here.
function printTag(key) {
  const url = `${location.origin}/#/keys/${key.id}`;
  $('#print-root').innerHTML = `
    <div class="print-tag">
      <div class="pt-head">
        <span class="pt-hole"></span>
        <span class="pt-brand">KEEYO · EQUIPMENT REGISTER</span>
        <span class="pt-no">${tagNo(key.id)}</span>
      </div>
      <div class="pt-body">
        <div class="pt-info">
          <div class="pt-name">${esc(key.name)}</div>
          <div class="pt-model">${esc([key.vendor, key.model].filter(Boolean).join(' / ') || 'model unknown')}</div>
          ${key.serial ? `<div class="pt-model">SN ${esc(key.serial)}</div>` : ''}
          <div class="pt-barcode">${barcodeSVG(key.id, 110, 22)}</div>
        </div>
        <div class="pt-qr">${qrSVG(url)}</div>
      </div>
      <div class="pt-foot">${esc(url)}</div>
    </div>`;
  window.print();
}

function printRegister() {
  const rows = [];
  for (const k of state.keys) {
    const regs = regsForKey(k.id);
    if (!regs.length) rows.push({ k, r: null, svc: null });
    for (const r of regs) rows.push({ k, r, svc: serviceById(r.serviceId) });
  }
  $('#print-root').innerHTML = `
    <div class="print-register">
      <h1>KEEYO — EQUIPMENT REGISTER</h1>
      <div class="pr-meta">${state.keys.length} keys · ${state.registrations.length} registrations ·
        printed ${esc(new Date().toLocaleDateString())} · holder: ${esc(state.me.username)}</div>
      <table>
        <thead><tr><th>Tag</th><th>Key</th><th>Model</th><th>Status</th><th>Service</th><th>Type</th><th>Account</th></tr></thead>
        <tbody>
          ${rows.map(({ k, r, svc }) => `
            <tr>
              <td>${tagNo(k.id)}</td>
              <td>${esc(k.name)}</td>
              <td>${esc([k.vendor, k.model].filter(Boolean).join(' '))}</td>
              <td>${esc(STATUS_LABEL[k.status])}</td>
              <td>${r ? esc(svc ? svc.name : '(deleted)') : '—'}</td>
              <td>${r ? esc(KIND_LABEL[r.kind]) + (r.revoked ? ' · revoked' : '') : ''}</td>
              <td>${r ? esc(r.account) : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  window.print();
}

function exportCSV() {
  const head = ['tag', 'key', 'vendor', 'model', 'serial', 'status', 'service', 'kind', 'account', 'totp_app', 'revoked'];
  const lines = [head];
  for (const k of state.keys) {
    const regs = regsForKey(k.id);
    if (!regs.length) lines.push([tagNo(k.id), k.name, k.vendor, k.model, k.serial, k.status, '', '', '', '', '']);
    for (const r of regs) {
      const svc = serviceById(r.serviceId);
      lines.push([tagNo(k.id), k.name, k.vendor, k.model, k.serial, k.status,
        svc ? svc.name : '', r.kind, r.account, r.totpApp, r.revoked ? 'yes' : 'no']);
    }
  }
  const csv = lines.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `keeyo-register-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// A key's uploaded photo, or the drawn artwork as fallback.
function keyVisual(key, size) {
  if (key.image) return `<img class="key-photo" src="${key.image}" alt="" style="max-height:${size}px;max-width:${size}px">`;
  return keyArt(key, size);
}

/* ============================== service icons ============================== */

function serviceIconHTML(svc, cls = '') {
  const name = svc.name || '?';
  const hue = hashHue(name.toLowerCase());
  const letter = esc(name.trim().charAt(0).toUpperCase() || '?');
  const letterStyle = `background:hsl(${hue} 48% 72%);color:rgba(20,18,10,0.8)`;

  if (svc.icon === 'favicon' && svc.url) {
    const domain = domainOf(svc.url);
    if (domain) {
      return `<span class="svc-icon ${cls}" style="${letterStyle}">${letter}<img class="fav" alt=""
        src="https://icons.duckduckgo.com/ip3/${esc(domain)}.ico" loading="lazy"></span>`;
    }
  }
  if (svc.icon && svc.icon !== 'favicon') {
    return `<span class="svc-icon emoji ${cls}">${esc(svc.icon)}</span>`;
  }
  return `<span class="svc-icon ${cls}" style="${letterStyle}">${letter}</span>`;
}

/* ============================== toasts / modal / confirm ============================== */

function toast(message, type = 'success', { actionLabel, onAction, duration = 2800 } = {}) {
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

// Optimistic delete with a 5-second undo window: the item vanishes from the UI
// immediately, the server call only happens when the window closes.
function deleteWithUndo({ label, apply, revert, commit }) {
  apply();
  render();
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    try {
      await commit();
    } catch (err) {
      toast(err.message, 'error');
    }
    refresh();
  }, 5000);
  toast(label, 'success', {
    actionLabel: 'Undo',
    duration: 5000,
    onAction: () => {
      undone = true;
      clearTimeout(timer);
      revert();
      render();
    },
  });
}

function openModal({ title, code = 'Keeyo register', bodyHTML, submitLabel = 'Save', danger = false, extraFootHTML = '', wide = false, onOpen, onSubmit }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <form class="modal ${wide ? 'modal-wide' : ''}" novalidate>
        <div class="modal-head">
          <h2><span class="form-code">${esc(code)}</span>${esc(title)}</h2>
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
      // A newer modal may already own the root — never wipe it.
      if (root.firstElementChild === overlay) root.innerHTML = '';
      else overlay.remove();
    }, 170);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    // Keep Tab focus inside the dialog.
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await onSubmit(form, close);
      if (form.keepOpen) form.keepOpen = false;
      else close();
    } catch (err) {
      const box = $('.form-error', form);
      box.textContent = err.message || 'Something went wrong';
      box.classList.add('visible');
    } finally {
      if (!closed) btn.disabled = false;
    }
  });

  if (onOpen) onOpen(form, close);
  const first = $('input, select, textarea', form);
  if (first) first.focus();
  return { form, close };
}

function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const { form } = openModal({
      title,
      code: 'Confirmation required',
      bodyHTML: `<p style="margin:0 0 10px;color:var(--text-dim)">${message}</p>`,
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

/* ============================== boot & routing ============================== */

const app = $('#app');

async function boot() {
  try {
    const status = await api('/status');
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

const SETTINGS_SECTIONS = ['services', 'catalog', 'account', 'users', 'data', 'about'];

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, id] = hash.split('/');
  if (page === 'keys' && id) return { page: 'key', id: Number(id) };
  if (page === 'services') return { page: 'settings', section: 'services' };
  if (page === 'settings') return { page: 'settings', section: id || 'services' };
  return { page: 'keys' };
}

// Entrance animations replay only when the route actually changes,
// not on every re-render (search keystrokes, data refreshes).
let lastRouteKey = '';

function render() {
  if (!state.me) return;
  const route = parseRoute();
  if (route.page === 'settings' &&
      (!SETTINGS_SECTIONS.includes(route.section) || (route.section === 'users' && !state.me.isAdmin))) {
    route.section = 'services';
  }
  const routeKey = `${route.page}:${route.id || route.section || ''}`;
  const anim = routeKey !== lastRouteKey;
  lastRouteKey = routeKey;

  if (route.page === 'key') {
    const key = keyById(route.id);
    if (!key) { location.hash = '#/keys'; return; }
    shell(viewKeyDetail(key), 'keys', anim);
    bindKeyDetail(key);
  } else if (route.page === 'settings') {
    shell(viewSettings(route.section), 'settings', anim);
    bindSettings(route.section);
  } else {
    shell(viewKeys(), 'keys', anim);
    bindKeys();
  }
}

window.addEventListener('hashchange', render);

/* ============================== shell ============================== */

function shell(content, active, anim = false) {
  const navItem = (id, label, icon) =>
    `<a class="nav-link ${active === id ? 'active' : ''}" href="#/${id}">${icon}<span>${label}</span></a>`;
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/keys">${I.logo}<span><span class="brand-name">KEEYO</span><span class="brand-sub">Equipment register</span></span></a>
      <nav class="main-nav">
        ${navItem('keys', 'Keys', I.keyIcon)}
        ${navItem('settings', 'Settings', I.gear)}
      </nav>
      <div class="topbar-spacer"></div>
      <div class="topbar-user">
        <button class="btn-icon" id="theme-toggle" title="Toggle theme">${I.theme}</button>
        <span class="username">${esc(state.me.username)}</span>
        <button class="btn-icon" id="logout-btn" title="Sign out">${I.logout}</button>
      </div>
    </header>
    <main class="page${anim ? ' anim' : ''}">${content}</main>`;

  $('#theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.add('theme-anim');
    setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
    // paper is the default; "dark" is the night-shift variant
    const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('keeyo-theme', next);
  });
  $('#logout-btn').addEventListener('click', async () => {
    await api('/logout', { method: 'POST', body: {} });
    state.me = null;
    boot();
  });
}

/* ============================== auth views ============================== */

function authShell(inner) {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">${I.logo}<span>KEEYO</span></div>
        ${inner}
      </div>
    </div>`;
}

function renderSetup() {
  authShell(`
    <p class="auth-sub">New register · create admin access</p>
    <form id="setup-form">
      <div class="form-error"></div>
      <div class="field"><label>Username</label><input type="text" name="username" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" autocomplete="new-password" required>
        <div class="hint">At least 8 characters</div></div>
      <div class="field"><label>Confirm password</label><input type="password" name="confirm" autocomplete="new-password" required></div>
      <button class="btn btn-primary" type="submit">Create account</button>
    </form>`);

  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const box = $('.form-error', f);
    box.classList.remove('visible');
    if (f.password.value !== f.confirm.value) {
      box.textContent = 'Passwords do not match';
      box.classList.add('visible');
      return;
    }
    try {
      await api('/setup', { body: { username: f.username.value, password: f.password.value } });
      await loadData();
      location.hash = '#/keys';
      render();
    } catch (err) {
      box.textContent = err.message;
      box.classList.add('visible');
    }
  });
}

function renderLogin() {
  authShell(`
    <p class="auth-sub">Equipment register · authorized access</p>
    <form id="login-form">
      <div class="form-error"></div>
      <div class="field"><label>Username</label><input type="text" name="username" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>`);

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const box = $('.form-error', f);
    box.classList.remove('visible');
    try {
      const res = await api('/login', { body: { username: f.username.value, password: f.password.value } });
      if (res.mfaRequired) {
        renderMfa(res);
        return;
      }
      await loadData();
      location.hash = '#/keys';
      render();
    } catch (err) {
      box.textContent = err.message;
      box.classList.add('visible');
    }
  });
}

// Second factor: the account has sign-in security keys enrolled.
function renderMfa(mfa) {
  authShell(`
    <p class="auth-sub">Second factor · security key required</p>
    <div class="scan-stage" style="padding-top:6px">
      <div class="scan-orb">${I.keyIcon}</div>
      <p>Insert one of the security keys enrolled for this account and touch it when it blinks.</p>
      <div class="form-error" id="mfa-error"></div>
      <button class="btn btn-primary" id="mfa-btn" style="width:100%">Use security key</button>
      <div><button type="button" class="link-btn" id="mfa-back">back to sign in</button></div>
    </div>`);

  const box = $('#mfa-error');
  const btn = $('#mfa-btn');
  $('#mfa-back').addEventListener('click', renderLogin);

  async function attempt() {
    box.classList.remove('visible');
    btn.disabled = true;
    btn.textContent = 'Touch your key…';
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuf(mfa.challenge),
          allowCredentials: mfa.credentialIds.map((id) => ({ type: 'public-key', id: b64urlToBuf(id) })),
          userVerification: 'preferred',
          timeout: 60000,
        },
      });
      const r = assertion.response;
      await api('/login/mfa', {
        body: {
          mfaToken: mfa.mfaToken,
          credentialId: assertion.id,
          clientDataJSON: bufToB64url(r.clientDataJSON),
          authenticatorData: bufToB64url(r.authenticatorData),
          signature: bufToB64url(r.signature),
        },
      });
      await loadData();
      location.hash = '#/keys';
      render();
    } catch (err) {
      box.textContent = err.name === 'NotAllowedError'
        ? 'Cancelled or timed out — try again.'
        : (err.status === 400 ? 'Challenge expired — go back and sign in again.' : err.message);
      box.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Use security key';
    }
  }

  btn.addEventListener('click', attempt);
  attempt();
}

/* ============================== keys page ============================== */

function keyMatchesSearch(key, q) {
  if (!q) return { match: true };
  const hay = `${key.name} ${key.vendor} ${key.model} ${key.serial}`.toLowerCase();
  if (hay.includes(q)) return { match: true };
  const svcHit = regsForKey(key.id)
    .map((r) => serviceById(r.serviceId))
    .find((s) => s && s.name.toLowerCase().includes(q));
  if (svcHit) return { match: true, via: svcHit.name };
  return { match: false };
}

function viewKeys() {
  const q = state.keySearch.trim().toLowerCase();
  let pool = state.keys;
  if (state.keyStatusFilter !== 'all') pool = pool.filter((k) => k.status === state.keyStatusFilter);
  if (state.keySort === 'name') pool = [...pool].sort((a, b) => a.name.localeCompare(b.name));
  else if (state.keySort === 'vendor') pool = [...pool].sort((a, b) => (a.vendor + a.model).localeCompare(b.vendor + b.model));
  else pool = [...pool].reverse(); // newest first
  const matches = pool
    .map((k) => ({ key: k, ...keyMatchesSearch(k, q) }))
    .filter((m) => m.match);

  let grid;
  if (state.keys.length === 0) {
    grid = `
      <div class="empty-state">
        <div class="art">${keyArt({ color: 'var(--accent)', formFactor: 'usb-a' }, 120)}</div>
        <h2>No keys on file</h2>
        <p>Register your first hardware security key and start tracking which passkeys, 2FA registrations and TOTP codes live on it.</p>
        <button class="btn btn-primary" data-add-key>${I.plus} Register first key</button>
      </div>`;
  } else {
    const cards = matches.map(({ key, via }, idx) => {
      const regs = regsForKey(key.id);
      const nPass = regs.filter((r) => r.kind === 'passkey').length;
      const n2fa = regs.filter((r) => r.kind === 'second-factor').length;
      const nTotp = regs.filter((r) => r.kind === 'totp').length;
      const inactive = key.status === 'lost' || key.status === 'retired';
      return `
        <div class="key-card ${inactive ? 'is-inactive' : ''}" data-key-id="${key.id}" style="--key-color:${esc(key.color)};--i:${Math.min(idx, 12)}">
          <div class="tag-head" style="background:${esc(key.color)}">
            <span class="tag-hole"></span>
            <span class="tag-no">${tagNo(key.id)}</span>
            <span style="flex:1"></span>
            <span class="status-badge status-${esc(key.status)}">${STATUS_LABEL[key.status]}</span>
          </div>
          <div class="key-art-wrap">${keyVisual(key, 92)}</div>
          <h3>${esc(key.name)}</h3>
          <div class="key-model">${esc([key.vendor, key.model].filter(Boolean).join(' / ') || 'Model unknown')}</div>
          <div class="chips">
            ${nPass ? `<span class="chip accent">${nPass} passkey${nPass > 1 ? 's' : ''}</span>` : ''}
            ${n2fa ? `<span class="chip info">${n2fa} 2FA</span>` : ''}
            ${nTotp ? `<span class="chip warn">${nTotp} TOTP</span>` : ''}
            ${regs.length === 0 ? '<span class="chip">empty</span>' : ''}
            ${via ? `<span class="chip ok">has ${esc(via)}</span>` : ''}
          </div>
          <div class="tag-barcode">${barcodeSVG(key.id)}<span class="bc-label">${esc((key.vendor || 'keeyo').slice(0, 10))}</span></div>
        </div>`;
    }).join('');

    grid = `
      <div class="key-grid">
        ${cards}
        <div class="key-card add-card" data-add-key style="--i:${Math.min(matches.length, 13)}">${I.plus}<span>Register new key</span></div>
      </div>
      ${matches.length === 0 ? '<div class="empty-state"><p>No keys match your search.</p></div>' : ''}`;
  }

  let banner = '';
  if (state.keys.length && state.services.length) {
    const atRisk = state.services.filter((s) => serviceCoverage(s.id).usable.length === 1).length;
    const uncovered = state.services.filter((s) => serviceCoverage(s.id).usable.length === 0).length;
    const parts = [];
    if (uncovered) parts.push(`${uncovered} service${uncovered > 1 ? 's are' : ' is'} not on any usable key`);
    if (atRisk) parts.push(`${atRisk} service${atRisk > 1 ? 's rely' : ' relies'} on a single key`);
    if (parts.length) {
      banner = `<div class="notice-strip">${I.warn}<span>${parts.join(' · ')}</span><a href="#/settings/services">Review services</a></div>`;
    }
  }

  // Lost keys with registrations that haven't been revoked yet are urgent.
  const lostPending = state.keys
    .filter((k) => k.status === 'lost')
    .map((k) => ({ k, n: regsForKey(k.id).filter((r) => !r.revoked).length }))
    .filter((x) => x.n > 0);
  if (lostPending.length) {
    banner = `<div class="notice-strip danger-strip">${I.warn}
      <span>Lost ${lostPending.map((x) => `${tagNo(x.k.id)} “${esc(x.k.name)}” still trusted by ${x.n} service${x.n > 1 ? 's' : ''}`).join(' · ')}</span>
      <a href="#/keys/${lostPending[0].k.id}">Open checklist</a></div>` + banner;
  }

  // Backup keys rot in drawers — nudge for keys not tested in 6 months.
  const stale = staleKeys();
  if (stale.length) {
    banner += `<div class="notice-strip">${I.warn}
      <span>${stale.length === 1 ? `${tagNo(stale[0].id)} “${esc(stale[0].name)}” hasn't` : `${stale.length} keys haven't`} been tested in ${STALE_DAYS / 30}+ months — plug in and confirm ${stale.length === 1 ? 'it still works' : 'they still work'}</span>
      <a href="#/keys/${stale[0].id}">Open key</a></div>`;
  }

  // First-run coach: keys exist but nothing is logged on them yet.
  const coach = state.keys.length && state.registrations.length === 0
    ? `<div class="notice-strip info-strip">${I.keyIcon}<span>Now open a tag and log what lives on it — every passkey, 2FA registration and TOTP.</span></div>`
    : '';

  const toolbar = state.keys.length ? `
    <div class="grid-toolbar">
      <div class="filter-chips">
        ${['all', 'active', 'backup', 'lost', 'retired'].map((s) =>
          `<button class="fchip ${state.keyStatusFilter === s ? 'on' : ''}" data-filter="${s}">${s === 'all' ? 'All' : STATUS_LABEL[s]}</button>`).join('')}
      </div>
      <div class="grow" style="flex:1"></div>
      <select id="key-sort" class="sort-select" title="Sort">
        <option value="newest" ${state.keySort === 'newest' ? 'selected' : ''}>Newest first</option>
        <option value="name" ${state.keySort === 'name' ? 'selected' : ''}>By name</option>
        <option value="vendor" ${state.keySort === 'vendor' ? 'selected' : ''}>By vendor</option>
      </select>
      <button class="btn btn-sm" id="print-register" title="Print the full register">${I.print} Print</button>
    </div>` : '';

  return `
    <div class="page-head">
      <h1>Key register</h1>
      <span class="count">${String(state.keys.length).padStart(2, '0')} on file</span>
      <div class="grow"></div>
      <div class="search-box">${I.search}<input id="key-search" type="text" placeholder="SEARCH KEYS / SERVICES…" value="${esc(state.keySearch)}"></div>
      ${state.keys.length ? `<button class="btn" id="identify-key-btn" title="Plug a key in and find out which record it is">${I.scan} Which key?</button>` : ''}
      <button class="btn btn-primary" data-add-key>${I.plus} Register key</button>
    </div>
    ${state.keys.length ? '<p class="page-sub">Every physical key on file, and what lives on it. Open a tag for its full record. <span class="kbd-hint">( / to search · N for new key )</span></p>' : ''}
    ${toolbar}
    ${coach}
    ${banner}
    ${grid}`;
}

function bindKeys() {
  $$('[data-add-key]').forEach((b) => b.addEventListener('click', () => keyModal()));
  $$('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      state.keyStatusFilter = b.dataset.filter;
      render();
    }));
  const sortSel = $('#key-sort');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      state.keySort = sortSel.value;
      render();
    });
  }
  const printBtn = $('#print-register');
  if (printBtn) printBtn.addEventListener('click', printRegister);
  const identifyBtn = $('#identify-key-btn');
  if (identifyBtn) identifyBtn.addEventListener('click', identifyModal);
  $$('[data-key-id]').forEach((card) =>
    card.addEventListener('click', () => { location.hash = `#/keys/${card.dataset.keyId}`; }));
  const search = $('#key-search');
  if (search) {
    search.addEventListener('input', () => {
      state.keySearch = search.value;
      render();
      const el = $('#key-search');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }
}

/* ============================== key detail ============================== */

function regRow(reg, { showKey = false } = {}) {
  const svc = serviceById(reg.serviceId) || { name: '(deleted service)' };
  const key = keyById(reg.keyId);
  const subParts = [];
  if (reg.account) subParts.push(reg.account);
  if (reg.kind === 'totp' && reg.totpApp) subParts.push(`in ${reg.totpApp}`);
  if (reg.notes) subParts.push(reg.notes);
  return `
    <div class="row clickable" data-reg-id="${reg.id}" data-svc-id="${svc.id || ''}" title="View service">
      ${serviceIconHTML(svc)}
      <div class="row-main">
        <div class="row-title">
          ${esc(svc.name)}
          <span class="chip ${KIND_CHIP[reg.kind]}">${KIND_LABEL[reg.kind]}</span>
          ${showKey && key ? `<span class="chip"><span class="key-dot" style="background:${esc(key.color)};width:12px;height:12px;border-width:0;box-shadow:none"></span>${esc(key.name)}</span>` : ''}
        </div>
        ${subParts.length ? `<div class="row-sub">${esc(subParts.join(' · '))}</div>` : ''}
      </div>
      <div class="row-actions">
        <button class="btn-icon" data-edit-reg="${reg.id}" title="Edit">${I.edit}</button>
        <button class="btn-icon danger" data-del-reg="${reg.id}" title="Remove">${I.trash}</button>
      </div>
    </div>`;
}

function viewKeyDetail(key) {
  const regs = regsForKey(key.id);
  const signIns = regs.filter((r) => r.kind !== 'totp');
  const totps = regs.filter((r) => r.kind === 'totp');
  const files = attachmentsForKey(key.id);
  const model = catalogModel(key);

  const meta = [];
  if (key.vendor) meta.push(esc(key.vendor));
  if (key.model) meta.push(esc(key.model));
  if (key.serial) meta.push(`SN ${esc(key.serial)}`);
  if (key.purchasedAt) meta.push(`bought ${esc(formatDate(key.purchasedAt))}`);
  meta.push(key.verifiedAt ? `tested ${esc(formatDate(key.verifiedAt))}` : 'never tested');

  let capacity = '';
  if (model && (model.passkeySlots || model.totpSlots)) {
    const bars = [];
    if (model.passkeySlots) {
      const used = signIns.filter((r) => r.kind === 'passkey').length;
      const pct = Math.min(100, Math.round((used / model.passkeySlots) * 100));
      bars.push(`<div class="capacity"><div class="cap-label"><span>Passkey slots tracked</span><span>${used} / ${model.passkeySlots}</span></div>
        <div class="cap-bar"><div class="cap-fill" style="width:${pct}%"></div></div></div>`);
    }
    if (model.totpSlots) {
      const pct = Math.min(100, Math.round((totps.length / model.totpSlots) * 100));
      bars.push(`<div class="capacity"><div class="cap-label"><span>TOTP slots tracked</span><span>${totps.length} / ${model.totpSlots}</span></div>
        <div class="cap-bar"><div class="cap-fill" style="width:${pct}%;background:var(--warn)"></div></div></div>`);
    }
    capacity = `<div class="capacity-row">${bars.join('')}</div>
      ${model.note ? `<div class="muted small" style="margin-top:8px">${esc(model.note)}</div>` : ''}`;
  } else if (model && model.note) {
    capacity = `<div class="muted small" style="margin-top:8px">${esc(model.note)}</div>`;
  }

  return `
    <a class="back-link" href="#/keys">${I.back} All keys</a>
    <div class="key-hero" style="--key-color:${esc(key.color)}">
      <div class="key-art-wrap">${keyVisual(key, 130)}</div>
      <div class="hero-info">
        <h1><span class="tag-no">${tagNo(key.id)}</span> ${esc(key.name)} <span class="status-badge status-${esc(key.status)}">${STATUS_LABEL[key.status]}</span></h1>
        <div class="meta">${meta.map((m, i) => (i ? `<span class="dot"></span><span>${m}</span>` : `<span>${m}</span>`)).join('')}</div>
        ${key.notes ? `<div class="hero-notes">${esc(key.notes)}</div>` : ''}
        ${capacity}
        ${key.hasSecret && key.credentialId ? `
        <div class="secret-row">
          ${I.lock}<span>Secret note</span>
          ${key.secretEncrypted
            ? '<span class="chip ok" title="Encrypted in your browser with a key only this hardware can derive — the server stores ciphertext only">E2E encrypted</span>'
            : '<span class="chip warn" title="Stored unencrypted on the server — re-pair the key and re-save the note to upgrade">server-stored</span>'}
          <button class="btn btn-sm" id="reveal-btn">Tap key to reveal</button>
          <code class="secret-value" id="secret-value" style="display:none"></code>
        </div>` : ''}
      </div>
      <div class="hero-actions">
        <button class="btn btn-sm" data-verify-key title="Confirm this key still works">${I.check} Tested</button>
        <button class="btn btn-sm" data-print-tag title="Print an asset tag">${I.print}</button>
        <button class="btn btn-sm" data-edit-key>${I.edit} Edit</button>
        <button class="btn btn-sm btn-danger" data-del-key>${I.trash}</button>
      </div>
    </div>

    ${key.status === 'lost' && regs.length ? (() => {
      const done = regs.filter((r) => r.revoked).length;
      return `
    <div class="section checklist-section">
      <div class="section-head">
        <h2>Revocation checklist</h2>
        <span class="count">${done}/${regs.length} revoked</span>
        <div class="grow"></div>
      </div>
      <div class="checklist-note">This key is marked <b>lost</b>. Remove its access at each service below, then tick it off.</div>
      <div class="row-list">
        ${regs.map((r) => {
          const svc = serviceById(r.serviceId) || { name: '(deleted service)' };
          return `
          <label class="row check-row ${r.revoked ? 'is-revoked' : ''}">
            <input type="checkbox" data-revoke="${r.id}" ${r.revoked ? 'checked' : ''}>
            ${serviceIconHTML(svc, 'sm')}
            <div class="row-main">
              <div class="row-title">${esc(svc.name)} <span class="chip ${KIND_CHIP[r.kind]}">${KIND_LABEL[r.kind]}</span></div>
              ${r.account ? `<div class="row-sub">${esc(r.account)}</div>` : ''}
            </div>
            <span class="chip ${r.revoked ? 'ok' : 'danger'}">${r.revoked ? 'revoked' : 'still active'}</span>
          </label>`;
        }).join('')}
      </div>
    </div>`;
    })() : ''}

    <div class="section">
      <div class="section-head">
        <h2>Sign-ins on this key</h2><span class="count">${signIns.length || ''}</span>
        <div class="grow"></div>
        <button class="btn btn-sm" data-add-reg="passkey">${I.plus} Add sign-in</button>
      </div>
      <div class="row-list">
        ${signIns.length
          ? signIns.map((r) => regRow(r)).join('')
          : '<div class="section-empty">No passkeys or 2FA registrations tracked on this key yet.</div>'}
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>TOTP codes on this key</h2><span class="count">${totps.length || ''}</span>
        <div class="grow"></div>
        <button class="btn btn-sm" data-add-reg="totp">${I.plus} Add TOTP</button>
      </div>
      <div class="row-list">
        ${totps.length
          ? totps.map((r) => regRow(r)).join('')
          : `<div class="section-empty">${model && model.totpSlots === 0
              ? 'This model cannot store TOTP secrets.'
              : 'No TOTP codes tracked on this key yet.'}</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Files</h2><span class="count">${files.length || ''}</span>
        <div class="grow"></div>
        <button class="btn btn-sm" id="attach-btn">${I.plus} Add file</button>
        <input type="file" id="attach-file" style="display:none">
      </div>
      <div class="row-list">
        ${files.length
          ? files.map((f) => `
            <div class="row">
              <span class="svc-icon sm">${I.file}</span>
              <div class="row-main">
                <div class="row-title">${esc(f.name)}</div>
                <div class="row-sub">${formatSize(f.size)} · ${esc(formatDate(f.createdAt))}</div>
              </div>
              <div class="row-actions">
                <a class="btn-icon" href="/api/attachments/${f.id}" title="Download">${I.download}</a>
                <button class="btn-icon danger" data-del-att="${f.id}" data-att-name="${esc(f.name)}" title="Delete">${I.trash}</button>
              </div>
            </div>`).join('')
          : '<div class="section-empty">Receipts, recovery sheets, manuals… up to 10 files, 5 MB each.</div>'}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Logbook</h2></div>
      <div class="ledger" id="ledger"><div class="section-empty">Loading…</div></div>
    </div>`;
}

const EVENT_LABEL = {
  created: 'REG', status: 'STAT', 'registration-added': 'ADD', 'registration-removed': 'DEL',
  revoked: 'REVK', unrevoked: 'UNRV', 'secret-set': 'LOCK', 'secret-cleared': 'CLR',
  paired: 'PAIR', 'attachment-added': 'FILE', 'attachment-removed': 'FILE', verified: 'TEST',
};

function bindKeyDetail(key) {
  $('[data-edit-key]').addEventListener('click', () => keyModal(key));

  // logbook loads lazily
  api(`/keys/${key.id}/events`).then((rows) => {
    const box = $('#ledger');
    if (!box) return;
    box.innerHTML = rows.length
      ? rows.map((ev) => `
        <div class="ledger-row">
          <span class="ledger-date">${esc(formatDate(ev.createdAt))}</span>
          <span class="ledger-kind">${esc(EVENT_LABEL[ev.kind] || ev.kind)}</span>
          <span class="ledger-detail">${esc(ev.detail)}</span>
        </div>`).join('')
      : '<div class="section-empty">No entries yet.</div>';
  }).catch(() => {
    const box = $('#ledger');
    if (box) box.innerHTML = '<div class="section-empty">Could not load the logbook.</div>';
  });

  $('[data-verify-key]').addEventListener('click', async () => {
    await api(`/keys/${key.id}/verify`, { method: 'POST', body: {} });
    toast('Marked as tested today');
    refresh();
  });

  $('[data-print-tag]').addEventListener('click', () => printTag(key));

  // ----- secret reveal (proof of possession) -----
  const revealBtn = $('#reveal-btn');
  if (revealBtn) {
    let hideTimer = null;
    revealBtn.addEventListener('click', async () => {
      const valueEl = $('#secret-value');
      if (valueEl.style.display !== 'none') {
        valueEl.style.display = 'none';
        valueEl.textContent = '';
        revealBtn.textContent = 'Tap key to reveal';
        clearTimeout(hideTimer);
        return;
      }
      revealBtn.disabled = true;
      revealBtn.textContent = 'Touch your key…';
      try {
        const secret = await revealSecret(key);
        valueEl.textContent = secret;
        valueEl.style.display = '';
        revealBtn.textContent = 'Hide';
        hideTimer = setTimeout(() => {
          valueEl.style.display = 'none';
          valueEl.textContent = '';
          revealBtn.textContent = 'Tap key to reveal';
        }, 30000);
      } catch (err) {
        toast(err.name === 'NotAllowedError' ? 'Cancelled or timed out' : err.message, 'error');
        revealBtn.textContent = 'Tap key to reveal';
      } finally {
        revealBtn.disabled = false;
      }
    });
  }

  // ----- file attachments -----
  const attachBtn = $('#attach-btn');
  if (attachBtn) {
    attachBtn.addEventListener('click', () => $('#attach-file').click());
    $('#attach-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast('Files can be at most 5 MB', 'error');
        return;
      }
      try {
        const dataUrl = await new Promise((ok, bad) => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result);
          fr.onerror = bad;
          fr.readAsDataURL(file);
        });
        await api(`/keys/${key.id}/attachments`, {
          body: { name: file.name, mime: file.type || 'application/octet-stream', data: String(dataUrl).split(',')[1] || '' },
        });
        toast('File added');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
  $$('[data-revoke]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const reg = state.registrations.find((r) => r.id === Number(cb.dataset.revoke));
      if (!reg) return;
      try {
        await api(`/registrations/${reg.id}`, { method: 'PUT', body: { ...reg, revoked: cb.checked } });
        refresh();
      } catch (err) {
        toast(err.message, 'error');
        cb.checked = !cb.checked;
      }
    }));

  $$('[data-del-att]').forEach((b) =>
    b.addEventListener('click', () => {
      const att = state.attachments.find((a) => a.id === Number(b.dataset.delAtt));
      if (!att) return;
      deleteWithUndo({
        label: `Deleted ${att.name}`,
        apply: () => { state.attachments = state.attachments.filter((a) => a.id !== att.id); },
        revert: () => { state.attachments.push(att); },
        commit: () => api(`/attachments/${att.id}`, { method: 'DELETE' }),
      });
    }));
  $('[data-del-key]').addEventListener('click', async () => {
    const n = regsForKey(key.id).length;
    const ok = await confirmDialog({
      title: `Delete "${key.name}"?`,
      message: n
        ? `This key has <b>${n}</b> tracked registration${n > 1 ? 's' : ''}. They will be removed too. The services themselves stay in your list.`
        : 'This cannot be undone.',
    });
    if (!ok) return;
    await api(`/keys/${key.id}`, { method: 'DELETE' });
    toast('Key deleted');
    location.hash = '#/keys';
    refresh();
  });
  $$('[data-add-reg]').forEach((b) =>
    b.addEventListener('click', () => registrationModal({ key, presetKind: b.dataset.addReg })));
  $$('.row[data-svc-id]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-actions')) return;
      const sid = Number(row.dataset.svcId);
      if (sid) serviceDetailModal(sid);
    }));
  $$('[data-edit-reg]').forEach((b) =>
    b.addEventListener('click', () => {
      const reg = state.registrations.find((r) => r.id === Number(b.dataset.editReg));
      if (reg) registrationModal({ key: keyById(reg.keyId), reg });
    }));
  $$('[data-del-reg]').forEach((b) =>
    b.addEventListener('click', () => {
      const reg = state.registrations.find((r) => r.id === Number(b.dataset.delReg));
      if (!reg) return;
      const svc = serviceById(reg.serviceId);
      deleteWithUndo({
        label: `Removed ${svc ? svc.name : 'registration'}`,
        apply: () => { state.registrations = state.registrations.filter((r) => r.id !== reg.id); },
        revert: () => { state.registrations.push(reg); },
        commit: () => api(`/registrations/${reg.id}`, { method: 'DELETE' }),
      });
    }));
}

/* ============================== services page ============================== */

function serviceCoverage(svcId) {
  const regs = regsForService(svcId);
  const keys = [...new Set(regs.map((r) => r.keyId))].map(keyById).filter(Boolean);
  const usable = keys.filter((k) => k.status === 'active' || k.status === 'backup');
  return { regs, keys, usable };
}

function viewServicesSection() {
  const q = state.svcSearch.trim().toLowerCase();
  const services = state.services.filter((s) =>
    !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));

  const atRisk = state.services.filter((s) => serviceCoverage(s.id).usable.length === 1).length;
  const uncovered = state.services.filter((s) => serviceCoverage(s.id).usable.length === 0).length;

  let list;
  if (state.services.length === 0) {
    list = `
      <div class="empty-state" style="padding:46px 20px">
        <h2>No services on file</h2>
        <p>Services appear here automatically when you add sign-ins or TOTP codes to a key — or add one now.</p>
        <button class="btn btn-primary" data-add-svc>${I.plus} Add a service</button>
      </div>`;
  } else {
    const rows = services.map((svc) => {
      const { regs, keys, usable } = serviceCoverage(svc.id);
      const kinds = [...new Set(regs.map((r) => r.kind))];
      const dots = keys.map((k) =>
        `<span class="key-dot ${k.status === 'lost' || k.status === 'retired' ? 'lost' : ''}"
          style="background:${esc(k.color)}" title="${esc(k.name)} (${STATUS_LABEL[k.status]})"
          data-goto-key="${k.id}">${esc(k.name.charAt(0).toUpperCase())}</span>`).join('');
      let badge = '';
      if (usable.length === 0) badge = `<button type="button" class="chip danger chip-btn" data-fix-svc="${svc.id}" title="Register it on a key now">${I.warn} not on any key — fix</button>`;
      else if (usable.length === 1) badge = `<button type="button" class="chip warn chip-btn" data-fix-svc="${svc.id}" title="Register it on a second key now">${I.warn} no backup — add one</button>`;
      return `
        <div class="row clickable" data-svc-id="${svc.id}">
          ${serviceIconHTML(svc)}
          <div class="row-main">
            <div class="row-title">${esc(svc.name)} ${badge}</div>
            <div class="row-sub">${kinds.map((k) => KIND_LABEL[k]).join(' · ') || 'No registrations'}${svc.url ? ` · ${esc(domainOf(svc.url) || svc.url)}` : ''}</div>
          </div>
          <div class="key-dots">${dots}</div>
        </div>`;
    }).join('');

    list = `
      <div class="summary-chips">
        <span class="chip">${state.services.length} service${state.services.length !== 1 ? 's' : ''}</span>
        ${atRisk ? `<span class="chip warn">${atRisk} without a backup key</span>` : ''}
        ${uncovered ? `<span class="chip danger">${uncovered} not on any usable key</span>` : ''}
      </div>
      <div class="section"><div class="row-list">
        ${rows || '<div class="section-empty">No services match your search.</div>'}
      </div></div>`;
  }

  return `
    <p class="page-sub" style="margin-top:0">Every service you've registered a key with, and which keys cover it.</p>
    ${state.services.length ? `
    <div class="section-toolbar">
      <div class="search-box grow">${I.search}<input id="svc-search" type="text" placeholder="Search services…" value="${esc(state.svcSearch)}"></div>
      <button class="btn btn-primary" data-add-svc>${I.plus} Add service</button>
    </div>` : ''}
    ${list}`;
}

function bindServicesSection() {
  $$('[data-add-svc]').forEach((b) => b.addEventListener('click', () => serviceModal()));
  $$('[data-svc-id]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-goto-key]') || e.target.closest('[data-fix-svc]')) return;
      serviceDetailModal(Number(row.dataset.svcId));
    }));
  $$('[data-goto-key]').forEach((dot) =>
    dot.addEventListener('click', () => { location.hash = `#/keys/${dot.dataset.gotoKey}`; }));
  $$('[data-fix-svc]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const svc = serviceById(Number(b.dataset.fixSvc));
      if (svc) pickKeyModal(svc);
    }));
  const search = $('#svc-search');
  if (search) {
    search.addEventListener('input', () => {
      state.svcSearch = search.value;
      render();
      const el = $('#svc-search');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }
}

function serviceDetailModal(svcId) {
  const svc = serviceById(svcId);
  if (!svc) return;
  const { regs, usable } = serviceCoverage(svcId);

  // One row per KEY (not per registration): a key holding both a passkey and
  // a TOTP for this service shows once, with one chip per registration kind.
  const byKey = new Map();
  for (const r of regs) {
    if (!byKey.has(r.keyId)) byKey.set(r.keyId, []);
    byKey.get(r.keyId).push(r);
  }
  const regRows = [...byKey.entries()].map(([kid, keyRegs]) => {
    const k = keyById(kid);
    const chips = keyRegs.map((r) =>
      `<span class="chip ${KIND_CHIP[r.kind]}">${KIND_LABEL[r.kind]}${r.revoked ? ' · revoked' : ''}</span>`).join(' ');
    const subParts = [
      ...new Set(keyRegs.map((r) => r.account).filter(Boolean)),
      ...new Set(keyRegs.filter((r) => r.kind === 'totp' && r.totpApp).map((r) => `TOTP in ${r.totpApp}`)),
    ];
    return `
      <div class="row">
        <span class="key-dot" style="background:${esc(k ? k.color : '#888')}">${esc(k ? k.name.charAt(0).toUpperCase() : '?')}</span>
        <div class="row-main">
          <div class="row-title">${esc(k ? k.name : '(deleted key)')}
            ${chips}
            ${k && (k.status === 'lost' || k.status === 'retired') ? `<span class="status-badge status-${esc(k.status)}">${STATUS_LABEL[k.status]}</span>` : ''}
          </div>
          ${subParts.length ? `<div class="row-sub">${esc(subParts.join(' · '))}</div>` : ''}
        </div>
        ${k ? `<button type="button" class="btn btn-sm btn-ghost" data-goto="${k.id}">Open key</button>` : ''}
      </div>`;
  }).join('');

  openModal({
    title: svc.name,
    code: `Record SV-${String(svc.id).padStart(3, '0')}`,
    submitLabel: 'Edit service',
    bodyHTML: `
      ${usable.length <= 1 ? `<div class="warn-note">${I.warn}<span>${usable.length === 0
        ? 'This service is not registered on any usable key. If you lose access, there is no hardware fallback.'
        : 'Only one usable key covers this service. Consider registering a backup key.'}</span></div>` : ''}
      ${svc.url ? `<p class="small" style="margin-top:0"><a href="${esc(/^https?:\/\//i.test(svc.url) ? svc.url : 'https://' + svc.url)}" target="_blank" rel="noopener">${esc(svc.url)}</a></p>` : ''}
      ${svc.notes ? `<p class="small muted" style="white-space:pre-wrap">${esc(svc.notes)}</p>` : ''}
      <div class="section" style="margin:0"><div class="row-list">
        ${regRows || '<div class="section-empty">Not registered on any key yet.</div>'}
      </div></div>`,
    extraFootHTML: `<button type="button" class="btn btn-sm btn-danger left" data-del-svc>Delete</button>
      <button type="button" class="btn btn-sm" data-reg-more>${I.plus} Another key</button>`,
    onOpen: (form, close) => {
      $$('[data-goto]', form).forEach((b) =>
        b.addEventListener('click', () => { close(); location.hash = `#/keys/${b.dataset.goto}`; }));
      $('[data-reg-more]', form).addEventListener('click', () => {
        close();
        pickKeyModal(svc);
      });
      $('[data-del-svc]', form).addEventListener('click', () => {
        close();
        const svcRegs = regsForService(svc.id);
        deleteWithUndo({
          label: `Deleted ${svc.name}`,
          apply: () => {
            state.services = state.services.filter((s) => s.id !== svc.id);
            state.registrations = state.registrations.filter((r) => r.serviceId !== svc.id);
          },
          revert: () => {
            state.services.push(svc);
            state.registrations.push(...svcRegs);
          },
          commit: () => api(`/services/${svc.id}`, { method: 'DELETE' }),
        });
      });
    },
    onSubmit: async (form, close) => {
      close();
      serviceModal(svc);
    },
  });
}

/* ============================== settings ============================== */

function viewSettings(section) {
  const tabs = [
    ['services', 'Services'],
    ['catalog', 'Catalog'],
    ['account', 'Account'],
    ...(state.me.isAdmin ? [['users', 'Users']] : []),
    ['data', 'Backup'],
    ['about', 'About'],
  ];

  let content = '';
  if (section === 'services') {
    content = viewServicesSection();
  } else if (section === 'catalog') {
    content = viewCatalogSection();
  } else if (section === 'account') {
    content = `
      <div class="settings-grid">
      <div class="settings-card">
        <h2>Account</h2>
        <p class="desc">Signed in as <b>${esc(state.me.username)}</b>${state.me.isAdmin ? ' (admin)' : ''}</p>
        <form id="pw-form">
          <div class="form-error"></div>
          <div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password" required></div>
          <div class="field"><label>New password</label><input type="password" name="next" autocomplete="new-password" required></div>
          <button class="btn" type="submit">Change password</button>
        </form>
        <p class="hint small muted" style="margin-top:10px">Changing your password signs out every other session.</p>
      </div>
      <div class="settings-card">
        <h2>Sign-in security keys</h2>
        <p class="desc">Protect Keeyo itself with a hardware key: once one is enrolled, signing in requires your password <b>and</b> a key tap.</p>
        <div id="login-key-list"><p class="muted small">Loading…</p></div>
        <div style="margin-top:12px"><button class="btn" id="add-login-key">${I.plus} Enroll a key</button></div>
        <p class="hint small muted" style="margin-top:10px">Lost all sign-in keys? The server owner can start Keeyo with <code>KEEYO_DISABLE_MFA=1</code> or run <code>scripts/reset-password.js</code>.</p>
      </div>
      </div>`;
  } else if (section === 'users') {
    content = `
      <div class="settings-grid"><div class="settings-card">
        <h2>Users</h2>
        <p class="desc">Everyone gets their own private key inventory.</p>
        <div id="user-list"><p class="muted small">Loading…</p></div>
        <div style="margin-top:12px"><button class="btn" id="add-user-btn">${I.plus} Add user</button></div>
      </div></div>`;
  } else if (section === 'data') {
    content = `
      <div class="settings-grid"><div class="settings-card">
        <h2>Backup</h2>
        <p class="desc">Export your keys, services and registrations as a JSON file, or restore from a previous export.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn" href="/api/export">Export data</a>
          <button class="btn" id="csv-btn">${I.download} Export CSV</button>
          <button class="btn" id="import-btn">Import backup…</button>
          <input type="file" id="import-file" accept="application/json,.json" style="display:none">
        </div>
        <p class="hint small muted" style="margin-top:10px">Importing replaces all of your current data.
          Exports contain your secret notes in plain text — store the file safely.
          File attachments live only in the database: back up the <code>/data</code> volume to keep them.</p>
      </div></div>`;
  } else {
    content = `
      <div class="settings-grid"><div class="settings-card">
        <h2>About</h2>
        <p class="desc" style="margin-bottom:0">Keeyo — self-hosted hardware security key inventory. Keeyo stores names and notes only: no secrets, no TOTP seeds, no private keys ever leave your hardware keys.</p>
      </div></div>`;
  }

  return `
    <div class="page-head"><h1>Settings</h1></div>
    <nav class="sub-nav">
      ${tabs.map(([id, label]) => `<a href="#/settings/${id}" class="${id === section ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    ${content}`;
}

function bindSettings(section) {
  if (section === 'services') {
    bindServicesSection();
    return;
  }

  if (section === 'catalog') {
    bindCatalogSection();
    return;
  }

  if (section === 'account') {
    $('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const box = $('.form-error', f);
      box.classList.remove('visible');
      try {
        await api('/me/password', { method: 'PUT', body: { current: f.current.value, next: f.next.value } });
        f.reset();
        toast('Password changed');
      } catch (err) {
        box.textContent = err.message;
        box.classList.add('visible');
      }
    });
    loadLoginKeys();
    $('#add-login-key').addEventListener('click', () => loginKeyModal());
  }

  if (section === 'data') {
    $('#csv-btn').addEventListener('click', exportCSV);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        toast('That file is not valid JSON', 'error');
        return;
      }
      const ok = await confirmDialog({
        title: 'Import backup?',
        message: `This will <b>replace</b> all your current keys, services and registrations with the contents of <b>${esc(file.name)}</b>.<br><br>
          ⚠ File attachments are not part of JSON backups — <b>your current attachments will be deleted</b>.`,
        confirmLabel: 'Replace my data',
      });
      if (!ok) return;
      try {
        await api('/import', { body: { data } });
        toast('Backup imported');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  if (section === 'users' && state.me.isAdmin) {
    loadUsers();
    $('#add-user-btn').addEventListener('click', () => userModal());
  }
}

async function loadUsers() {
  const box = $('#user-list');
  if (!box) return;
  const users = await api('/users');
  box.innerHTML = users.map((u) => `
    <div class="user-row">
      <span class="name">${esc(u.username)}</span>
      ${u.isAdmin ? '<span class="chip accent">admin</span>' : ''}
      ${u.id !== state.me.id ? `<button class="btn-icon danger" data-del-user="${u.id}" data-del-name="${esc(u.username)}" title="Delete user">${I.trash}</button>` : '<span class="muted small">you</span>'}
    </div>`).join('');
  $$('[data-del-user]', box).forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Delete user "${b.dataset.delName}"?`,
        message: 'Their entire key inventory will be permanently deleted.',
      });
      if (!ok) return;
      await api(`/users/${b.dataset.delUser}`, { method: 'DELETE' });
      toast('User deleted');
      loadUsers();
    }));
}

async function loadLoginKeys() {
  const box = $('#login-key-list');
  if (!box) return;
  const keys = await api('/login-keys');
  if (!$('#login-key-list')) return;
  $('#login-key-list').innerHTML = keys.length
    ? keys.map((k) => `
      <div class="user-row">
        ${I.keyIcon}<span class="name">${esc(k.name)}</span>
        <span class="muted small">${esc(formatDate(k.createdAt))}</span>
        <button class="btn-icon danger" data-del-lk="${k.id}" data-lk-name="${esc(k.name)}" title="Remove">${I.trash}</button>
      </div>`).join('')
    : '<p class="muted small">No sign-in keys enrolled — Keeyo is protected by password only.</p>';
  $$('[data-del-lk]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Remove "${b.dataset.lkName}"?`,
        message: 'It will no longer be usable to sign in. If it was the last one, sign-in falls back to password only.',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      await api(`/login-keys/${b.dataset.delLk}`, { method: 'DELETE' });
      toast('Sign-in key removed');
      loadLoginKeys();
    }));
}

function loginKeyModal() {
  openModal({
    title: 'Enroll a sign-in key',
    code: 'Form U-02 · second factor',
    submitLabel: 'Enroll — touch key',
    bodyHTML: `
      <div class="field"><label>Name</label>
        <input type="text" name="lkName" required maxlength="80" placeholder="e.g. Daily driver, Desk backup">
        <div class="hint">Enroll at least two keys so losing one never locks you out.</div></div>`,
    onSubmit: async (form) => {
      const name = form.lkName.value.trim();
      if (!name) throw new Error('Give the key a name');
      const { token, challenge } = await api('/login-keys/challenge', { method: 'POST', body: {} });
      let cred;
      try {
        cred = await navigator.credentials.create({
          publicKey: {
            challenge: b64urlToBuf(challenge),
            rp: { name: 'Keeyo' },
            user: {
              id: crypto.getRandomValues(new Uint8Array(16)),
              name: state.me.username,
              displayName: state.me.username,
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'discouraged', userVerification: 'preferred' },
            attestation: 'none',
            timeout: 60000,
          },
        });
      } catch (err) {
        throw new Error(err.name === 'NotAllowedError' ? 'Cancelled or timed out — try again.' : err.message);
      }
      const spki = typeof cred.response.getPublicKey === 'function' ? cred.response.getPublicKey() : null;
      if (!spki) throw new Error('This browser cannot export the credential — try a current Chrome/Brave/Firefox.');
      await api('/login-keys', {
        body: {
          token,
          name,
          credentialId: cred.id,
          publicKey: bufToB64(spki),
          alg: typeof cred.response.getPublicKeyAlgorithm === 'function' ? cred.response.getPublicKeyAlgorithm() : -7,
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        },
      });
      toast('Sign-in key enrolled');
      loadLoginKeys();
    },
  });
}

function userModal() {
  openModal({
    title: 'Add user',
    code: 'Form U-01 · access grant',
    submitLabel: 'Create user',
    bodyHTML: `
      <div class="field"><label>Username</label><input type="text" name="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" required>
        <div class="hint">At least 8 characters</div></div>
      <div class="field"><label><input type="checkbox" name="isAdmin" style="width:auto;margin-right:7px">Administrator</label></div>`,
    onSubmit: async (form) => {
      await api('/users', {
        body: { username: form.username.value, password: form.password.value, isAdmin: form.isAdmin.checked },
      });
      toast('User created');
      loadUsers();
    },
  });
}

/* ============================== catalog section ============================== */

function viewCatalogSection() {
  const tag = (label, opts = {}) => `
    <span class="tag ${opts.locked ? 'locked' : ''}">
      ${opts.dot ? `<span class="tag-dot" style="background:${esc(opts.dot)}"></span>` : ''}
      <span>${esc(label)}</span>
      ${opts.locked ? I.lock : `<button type="button" class="tag-x" data-del-cat="${opts.id}" title="Remove">${I.close}</button>`}
    </span>`;

  const vendorTags = [
    ...CAT.vendors.map((v) => tag(v.name, { locked: true })),
    ...customCatalog('vendor').map((c) => tag(c.value, { id: c.id })),
  ].join('');

  const modelTags = customCatalog('model').map((c) =>
    tag(`${c.extra.vendor ? c.extra.vendor + ' · ' : ''}${c.value}`, { id: c.id })).join('');

  const ffTags = [
    ...CAT.formFactors.map((f) => tag(f.name, { locked: true })),
    ...customCatalog('form-factor').map((c) => tag(c.value, { id: c.id })),
  ].join('');

  const colorTags = [
    ...SWATCHES.map((c) => tag(c, { locked: true, dot: c })),
    ...customCatalog('color').map((c) => tag(c.value, { id: c.id, dot: c.value })),
  ].join('');

  const vendorOpts = allVendors().map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  const ffOpts = allFormFactors().map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');

  return `
    <p class="page-sub" style="margin-top:0">Everything the key form's dropdowns offer. Custom entries you type in the key form land here automatically — built-in ones ${I.lock} are part of the app and can't be removed.</p>
    <div class="settings-grid">
      <div class="settings-card">
        <h2>Device registry</h2>
        <p class="desc">The fingerprint database behind “Detect my key”. Keeyo keeps it fresh automatically from the FIDO Alliance metadata service (where vendors publish every certified authenticator) plus the community passkey registry — so brand-new devices are recognized without updating the app.</p>
        <div id="registry-status" class="muted small">Checking…</div>
        ${state.me.isAdmin ? `<div style="margin-top:12px"><button class="btn btn-sm" id="registry-refresh">${I.scan} Refresh now</button></div>` : ''}
      </div>

      <div class="settings-card">
        <h2>Vendors</h2>
        <div class="tag-cloud">${vendorTags}</div>
        <form class="tag-add" data-cat-type="vendor">
          <input type="text" name="value" placeholder="Add a vendor…" maxlength="60">
          <button class="btn btn-sm" type="submit">${I.plus} Add</button>
        </form>
      </div>

      <div class="settings-card">
        <h2>Models</h2>
        <div class="tag-cloud">${modelTags || '<span class="muted small">No custom models yet — every built-in Yubico, Token2, Titan, Nitrokey, SoloKeys and Feitian model is already in the picker.</span>'}</div>
        <form class="tag-add" data-cat-type="model">
          <select name="vendor" title="Vendor">${vendorOpts}</select>
          <input type="text" name="value" placeholder="Model name…" maxlength="60">
          <select name="formFactor" title="Form factor">${ffOpts}</select>
          <button class="btn btn-sm" type="submit">${I.plus} Add</button>
        </form>
      </div>

      <div class="settings-card">
        <h2>Form factors</h2>
        <div class="tag-cloud">${ffTags}</div>
        <form class="tag-add" data-cat-type="form-factor">
          <input type="text" name="value" placeholder="Add a form factor…" maxlength="60">
          <button class="btn btn-sm" type="submit">${I.plus} Add</button>
        </form>
      </div>

      <div class="settings-card">
        <h2>Colors</h2>
        <div class="tag-cloud">${colorTags}</div>
        <form class="tag-add" data-cat-type="color">
          <input type="color" name="value" value="#8b5cf6" title="Pick a color">
          <button class="btn btn-sm" type="submit">${I.plus} Add</button>
        </form>
        <p class="hint small muted" style="margin-top:12px">Removing an entry never changes keys that already use it — it just leaves the pickers.</p>
      </div>
    </div>`;
}

async function loadRegistryStatus() {
  const box = $('#registry-status');
  if (!box) return;
  try {
    const s = await api('/registry');
    if (!$('#registry-status')) return;
    if (s.offline) {
      $('#registry-status').textContent = 'Updates disabled (KEEYO_OFFLINE) — using the bundled fingerprints and your learned catalog.';
      return;
    }
    if (!s.count) {
      $('#registry-status').textContent = s.refreshing
        ? 'Downloading the registry for the first time…'
        : 'Not downloaded yet — it fetches automatically, or refresh now.';
      return;
    }
    const when = s.fetchedAt ? new Date(s.fetchedAt).toLocaleString() : 'unknown';
    $('#registry-status').innerHTML =
      `<b>${s.count}</b> devices &middot; updated ${esc(when)} &middot; sources: ${esc((s.sources || []).join(' + ') || 'none')}` +
      (s.refreshing ? ' &middot; refreshing…' : (s.stale ? ' &middot; <span class="chip warn">stale</span>' : ''));
  } catch {
    if ($('#registry-status')) $('#registry-status').textContent = 'Could not read registry status.';
  }
}

function bindCatalogSection() {
  loadRegistryStatus();
  const refreshBtn = $('#registry-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing…';
      try {
        const s = await api('/registry/refresh', { method: 'POST', body: {} });
        toast(`Registry updated — ${s.count} devices`);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if ($('#registry-refresh')) {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = `${I.scan} Refresh now`;
        }
        loadRegistryStatus();
      }
    });
  }

  $$('[data-del-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      const item = state.catalog.find((c) => c.id === Number(b.dataset.delCat));
      if (!item) return;
      deleteWithUndo({
        label: `Removed ${item.value}`,
        apply: () => { state.catalog = state.catalog.filter((c) => c.id !== item.id); },
        revert: () => { state.catalog.push(item); },
        commit: () => api(`/catalog/${item.id}`, { method: 'DELETE' }),
      });
    }));

  $$('.tag-add').forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = f.dataset.catType;
      let value = f.elements.namedItem('value').value.trim();
      if (!value) return;
      if (type === 'color') value = value.toLowerCase();
      const extra = type === 'model'
        ? { vendor: f.elements.namedItem('vendor').value, formFactor: f.elements.namedItem('formFactor').value }
        : {};
      try {
        const created = await ensureCatalogItem(type, value, extra);
        if (!created) {
          toast('Already in the list', 'error');
          return;
        }
        toast('Added');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    }));
}

/* ============================== key form ============================== */

const SWATCHES = ['#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#f87171', '#94a3b8'];

function keyModal(existing = null) {
  const swatches = allSwatches();
  const k = existing || { name: '', vendor: 'Yubico', model: '', serial: '', color: swatches[Math.floor(Math.random() * 6)], formFactor: '', status: 'active', purchasedAt: '', notes: '', image: '' };

  // Older keys may reference entries since removed from the catalog — keep them selectable.
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
    // Not paired yet (added manually or before pairing existed) — offer pairing.
    secretField = `
      <div class="field" id="pair-field">
        <label>Secret note <span class="muted">(requires pairing)</span></label>
        <button type="button" class="btn btn-sm" id="pair-btn">${I.scan} Pair with this physical key</button>
        <div class="hint">Pairing lets Keeyo store a note revealed only by tapping this exact key.</div>
      </div>
      <div class="field" id="secret-field" style="display:none">${secretInputHTML}</div>`;
  } else {
    // Paired before PRF support and holding no note yet? Offer an upgrade.
    const upgrade = existing && existing.credentialId && !existing.prfEnabled && !existing.hasSecret;
    secretField = `
      ${upgrade ? `
      <div class="field" id="pair-field">
        <label>Encryption upgrade</label>
        <button type="button" class="btn btn-sm" id="pair-btn">${I.scan} Re-pair to enable encrypted notes</button>
        <div class="hint">This pairing predates PRF support — one re-scan upgrades secret notes to end-to-end encryption.</div>
      </div>` : ''}
      <div class="field" id="secret-field" style="${existing ? '' : 'display:none'}">${secretInputHTML}</div>`;
  }

  openModal({
    title: existing ? 'Key record' : 'Register a key',
    code: existing ? `Form K-02 · amend · ${tagNo(existing.id)}` : 'Form K-01 · new registration',
    submitLabel: existing ? 'Save changes' : 'Add to register',
    wide: true,
    bodyHTML: `
      ${scanStep}
      <div class="wizard-step ${existing ? '' : 'step-hidden'}" id="step-form">
      <div id="detected-banner"></div>
      <div class="field"><label>Name</label>
        <input type="text" name="name" required placeholder="e.g. Daily driver, Desk drawer backup" value="${esc(k.name)}">
        <div class="hint">Give it a name you'll recognize — where it lives or what it's for.</div></div>
      <div class="field-row">
        <div class="field"><label>Vendor</label><select name="vendorSelect">${vendorOptions}</select></div>
        <div class="field"><label>Model</label><select name="modelSelect"></select></div>
      </div>
      <div class="field" id="custom-vendor-field" style="display:none"><label>Custom vendor name</label>
        <input type="text" name="vendorCustom" placeholder="e.g. HyperFIDO" maxlength="60">
        <div class="hint">Saved to your vendor list for next time (manage it in Settings → Catalog).</div></div>
      <div class="field" id="custom-model-field" style="display:none"><label>Custom model name</label>
        <input type="text" name="modelCustom" value="${isCustomModel ? esc(k.model) : ''}" placeholder="Model name" maxlength="60">
        <div class="hint">Saved to your model list for next time.</div></div>
      <div class="field-row">
        <div class="field"><label>Form factor</label><select name="ffSelect">${ffOptions}</select></div>
        <div class="field"><label>Serial number <span class="muted">(optional)</span></label>
          <input type="text" name="serial" value="${esc(k.serial)}"></div>
      </div>
      <div class="field" id="custom-ff-field" style="display:none"><label>Custom form factor</label>
        <input type="text" name="ffCustom" placeholder="e.g. Keychain fob" maxlength="60">
        <div class="hint">Saved to your form factor list for next time.</div></div>
      <div class="field"><label>Color tag</label>
        <div class="swatches">
          ${swatches.map((c) => `<button type="button" class="swatch ${c === k.color ? 'selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          <input type="color" class="swatch-custom" name="colorCustom" value="${esc(k.color)}" title="Custom color">
        </div>
        <div class="hint">Tip: match it to a real sticker or keychain tag on the physical key.</div></div>
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
        <div class="hint">Shown on the key's card instead of the drawing.</div></div>
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

      // ----- wizard steps (add mode starts on the scan step) -----
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

      // Keep the secret-note hint honest about the storage mode.
      function updateSecretHint() {
        const hint = $('#secret-mode-hint', form);
        if (!hint) return;
        const prfCapable = credential ? credential.prfEnabled : !!(existing && existing.prfEnabled);
        hint.textContent = prfCapable
          ? 'End-to-end encrypted with this key — even the server database cannot read it. Saving asks for one extra tap.'
          : 'Never shown in the app — revealed only after tapping this exact physical key. Stored on the server unencrypted.';
      }
      updateSecretHint();

      // Edit-mode pairing for keys that never went through the scan step
      // (or that predate PRF-capable pairing).
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

      // ----- photo upload -----
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
          const url = URL.createObjectURL(file);
          const img = new Image();
          await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
          URL.revokeObjectURL(url);
          const scale = Math.min(1, 320 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          image = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
          if (image.length > 400000) throw new Error('too big');
          renderPhoto();
        } catch {
          toast('Could not read that image', 'error');
        }
      });
      renderPhoto();

      // ----- scan step -----
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
      if (form.vendorSelect.value === '__custom__' && !vendor) throw new Error('Enter the custom vendor name');
      const model = form.modelSelect.value === '__custom__' ? form.modelCustom.value.trim() : form.modelSelect.value;
      let formFactor = form.ffSelect.value === '__custom__' ? form.ffCustom.value.trim() : form.ffSelect.value;
      if (form.ffSelect.value === '__custom__' && !formFactor) throw new Error('Enter the custom form factor name');
      if (!formFactor && model) {
        const m = modelsForVendor(vendor).find((x) => x.name === model);
        if (m && m.formFactor) formFactor = m.formFactor;
      }
      if (!formFactor) throw new Error('Pick a form factor — the plug type of the key');
      const color = form.getColor().toLowerCase();
      const body = {
        // form.name would hit HTMLFormElement's own name attribute, not the input
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
      if (!body.name) throw new Error('Give the key a name');
      if (credential) body.credential = credential;
      if (form.secretInput) {
        if (form.clearSecret && form.clearSecret.checked) {
          body.clearSecret = true;
        } else if (form.secretInput.value.trim()) {
          let secretVal = form.secretInput.value.trim();
          const prfCapable = credential ? credential.prfEnabled : !!(existing && existing.prfEnabled);
          const credId = credential ? credential.id : (existing ? existing.credentialId : '');
          if (prfCapable && credId) {
            // One extra tap: derive the encryption key from the hardware itself,
            // so the server only ever stores ciphertext.
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
      // Anything custom the user typed joins their personal catalog for next time.
      // A detected fingerprint rides along so the model is auto-recognized later.
      await ensureCatalogItem('vendor', vendor);
      await ensureCatalogItem('form-factor', formFactor);
      await ensureCatalogItem('model', model, { vendor, formFactor: formFactor || 'other', aaguid: detectedAaguid, nfc: detectedNfc });
      await ensureCatalogItem('color', color);
      refresh();
    },
  });
}

/* ============================== service form ============================== */

function serviceModal(existing = null, onSaved = null) {
  const s = existing || { name: '', url: '', icon: '', notes: '' };
  const iconMode = s.icon === 'favicon' ? 'favicon' : (s.icon ? 'emoji' : 'auto');

  openModal({
    title: existing ? 'Edit service' : 'Add service',
    code: existing ? 'Form S-02 · amend' : 'Form S-01 · new service',
    submitLabel: existing ? 'Save changes' : 'Add service',
    bodyHTML: `
      <div class="field"><label>Name</label>
        <input type="text" name="name" required placeholder="e.g. GitHub, Google, Proton" value="${esc(s.name)}"></div>
      <div class="field"><label>Website <span class="muted">(optional)</span></label>
        <input type="text" name="url" placeholder="github.com" value="${esc(s.url)}"></div>
      <div class="field"><label>Icon</label>
        <div class="segmented" id="icon-mode">
          <button type="button" data-mode="auto" class="${iconMode === 'auto' ? 'selected' : ''}">Letter</button>
          <button type="button" data-mode="favicon" class="${iconMode === 'favicon' ? 'selected' : ''}">Site favicon</button>
          <button type="button" data-mode="emoji" class="${iconMode === 'emoji' ? 'selected' : ''}">Emoji</button>
        </div>
        <input type="text" name="emoji" placeholder="Paste an emoji, e.g. 🐙" maxlength="8"
          value="${iconMode === 'emoji' ? esc(s.icon) : ''}" style="margin-top:8px;display:${iconMode === 'emoji' ? '' : 'none'}">
        <div class="hint" data-favicon-hint style="display:${iconMode === 'favicon' ? '' : 'none'}">Favicon is loaded in your browser from icons.duckduckgo.com.</div>
      </div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label>
        <textarea name="notes">${esc(s.notes)}</textarea></div>`,
    onOpen: (form) => {
      let mode = iconMode;
      $$('#icon-mode button', form).forEach((b) =>
        b.addEventListener('click', () => {
          mode = b.dataset.mode;
          $$('#icon-mode button', form).forEach((x) => x.classList.toggle('selected', x === b));
          form.emoji.style.display = mode === 'emoji' ? '' : 'none';
          $('[data-favicon-hint]', form).style.display = mode === 'favicon' ? '' : 'none';
        }));
      form.getIcon = () => (mode === 'favicon' ? 'favicon' : mode === 'emoji' ? form.emoji.value.trim() : '');
    },
    onSubmit: async (form) => {
      const body = {
        name: form.elements.namedItem('name').value.trim(),
        url: form.url.value.trim(),
        icon: form.getIcon(),
        notes: form.notes.value.trim(),
      };
      if (!body.name) throw new Error('Give the service a name');
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

/* ============================== registration form ============================== */

function registrationModal({ key, reg = null, presetKind = null, presetService = null }) {
  const model = catalogModel(key);
  const editing = !!reg;
  const initialKind = reg ? reg.kind : (presetKind === 'totp' ? 'totp' : 'passkey');
  const svcFixed = editing ? serviceById(reg.serviceId) : null;

  const totpApps = CAT.totpApps.map((a) => `<option value="${esc(a)}"></option>`).join('');
  const keyOptions = state.keys.map((k) =>
    `<option value="${k.id}" ${editing && k.id === reg.keyId ? 'selected' : ''}>${esc(`${tagNo(k.id)} · ${k.name}`)}</option>`).join('');

  openModal({
    title: editing ? 'Edit registration' : `Add to "${key.name}"`,
    code: editing ? 'Form R-02 · amend' : `Form R-01 · ${tagNo(key.id)}`,
    submitLabel: editing ? 'Save changes' : 'Add',
    bodyHTML: `
      ${editing
        ? `<div class="field"><label>Service</label>
             <div class="selected-service">${serviceIconHTML(svcFixed || { name: '?' }, 'sm')}<span class="name">${esc(svcFixed ? svcFixed.name : '')}</span></div></div>
           <div class="field"><label>On key</label><select name="moveKey">${keyOptions}</select>
             <div class="hint">Change this to move the registration to another key.</div></div>`
        : `<div class="field"><label>Service</label>
             <div class="combo" id="svc-combo">
               <input type="text" name="svcSearch" placeholder="Search or type a new service…" autocomplete="off">
               <div class="combo-list"></div>
             </div>
             <div class="quick-picks" id="quick-picks">
               ${COMMON_SERVICES.map((s) => `<button type="button" class="qp" data-qp="${esc(s.name)}" data-qp-url="${esc(s.url)}">${esc(s.name)}</button>`).join('')}
             </div>
             <div class="selected-service" id="svc-selected" style="display:none">
               <span class="icon-slot"></span><span class="name"></span>
               <button type="button" class="btn-icon" id="svc-clear" title="Change">${I.close}</button>
             </div>
           </div>
           <div id="new-svc-fields" style="display:none">
             <div class="field"><label>Website <span class="muted">(optional)</span></label>
               <input type="text" name="newUrl" placeholder="github.com"></div>
           </div>`}
      <div class="field"><label>Type</label>
        <div class="segmented" id="kind-seg">
          <button type="button" data-kind="passkey" class="${initialKind === 'passkey' ? 'selected' : ''}">Passkey</button>
          <button type="button" data-kind="second-factor" class="${initialKind === 'second-factor' ? 'selected' : ''}">2FA key</button>
          <button type="button" data-kind="totp" class="${initialKind === 'totp' ? 'selected' : ''}">TOTP</button>
        </div>
        <div class="hint" id="kind-hint"></div></div>
      <div class="warn-note" id="totp-warn" style="display:none">${I.warn}<span>The catalog says <b>${esc(key.model || 'this model')}</b> cannot store TOTP secrets — double-check before relying on it.</span></div>
      <div class="field"><label>Account <span class="muted">(optional)</span></label>
        <input type="text" name="account" placeholder="you@example.com or username" value="${esc(reg ? reg.account : '')}"></div>
      <div class="field" id="totp-app-field" style="display:none"><label>Read with app</label>
        <input type="text" name="totpApp" list="totp-apps" placeholder="Yubico Authenticator" value="${esc(reg ? reg.totpApp : '')}">
        <datalist id="totp-apps">${totpApps}</datalist>
        <div class="hint">The app you use to read this code from the key.</div></div>
      <div class="field"><label>Notes <span class="muted">(optional)</span></label>
        <textarea name="notes">${esc(reg ? reg.notes : '')}</textarea></div>
      ${editing ? '' : '<label class="check-line"><input type="checkbox" name="addAnother"> Add another to this key after saving</label>'}`,
    onOpen: (form) => {
      let kind = initialKind;
      let selectedService = svcFixed;
      let createNew = false;

      const KIND_HINTS = {
        passkey: 'A passwordless FIDO2 credential stored on the key itself.',
        'second-factor': 'The key is used as a second step after your password (U2F / security key).',
        totp: 'A 6-digit code whose secret is stored on this key.',
      };

      function applyKind() {
        $$('#kind-seg button', form).forEach((b) => b.classList.toggle('selected', b.dataset.kind === kind));
        $('#kind-hint', form).textContent = KIND_HINTS[kind];
        $('#totp-app-field', form).style.display = kind === 'totp' ? '' : 'none';
        $('#totp-warn', form).style.display = (kind === 'totp' && model && model.totpSlots === 0) ? '' : 'none';
      }
      $$('#kind-seg button', form).forEach((b) =>
        b.addEventListener('click', () => { kind = b.dataset.kind; applyKind(); }));
      applyKind();

      if (!editing) {
        const input = form.svcSearch;
        const list = $('.combo-list', form);
        const selectedBox = $('#svc-selected', form);
        const newFields = $('#new-svc-fields', form);
        const quickPicks = $('#quick-picks', form);

        function select(svc) {
          selectedService = svc;
          createNew = false;
          input.parentElement.style.display = 'none';
          list.classList.remove('open');
          selectedBox.style.display = '';
          $('.icon-slot', selectedBox).innerHTML = serviceIconHTML(svc, 'sm');
          $('.name', selectedBox).textContent = svc.name;
          newFields.style.display = 'none';
          quickPicks.style.display = 'none';
        }

        function selectCreate(name, url = '') {
          selectedService = { name };
          createNew = true;
          input.parentElement.style.display = 'none';
          list.classList.remove('open');
          selectedBox.style.display = '';
          $('.icon-slot', selectedBox).innerHTML = serviceIconHTML({ name }, 'sm');
          $('.name', selectedBox).textContent = `${name} (new)`;
          newFields.style.display = '';
          form.newUrl.value = url;
          quickPicks.style.display = 'none';
        }

        function clearSelection() {
          selectedService = null;
          createNew = false;
          selectedBox.style.display = 'none';
          newFields.style.display = 'none';
          input.parentElement.style.display = '';
          input.value = '';
          quickPicks.style.display = '';
          list.classList.remove('open');
        }

        function renderList() {
          const q = input.value.trim().toLowerCase();
          const matches = state.services.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 8);
          const exact = q && state.services.some((s) => s.name.toLowerCase() === q);
          list.innerHTML = [
            ...matches.map((s) => {
              // distinct keys, not registrations — a key with sign-in + TOTP counts once
              const n = new Set(regsForService(s.id).map((r) => r.keyId)).size;
              return `<button type="button" class="combo-item" data-id="${s.id}">
                ${serviceIconHTML(s, 'sm')}<span>${esc(s.name)}</span>
                <span class="combo-sub">${n ? `on ${n} key${n > 1 ? 's' : ''}` : 'new here'}</span></button>`;
            }),
            (q && !exact) ? `<button type="button" class="combo-item create" data-create="1">${I.plus}<span>Create “${esc(input.value.trim())}”</span></button>` : '',
          ].join('');
          list.classList.toggle('open', !!list.innerHTML);
          $$('.combo-item', list).forEach((item) =>
            item.addEventListener('click', () => {
              if (item.dataset.create) selectCreate(input.value.trim());
              else select(serviceById(Number(item.dataset.id)));
            }));
        }

        // Open only on deliberate interaction (typing or clicking the field) —
        // never on the modal's automatic focus. Close on any click outside.
        input.addEventListener('input', renderList);
        input.addEventListener('click', renderList);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = $('.combo-item', list);
            if (first) first.click();
          } else if (e.key === 'Escape' && list.classList.contains('open')) {
            e.stopPropagation();
            list.classList.remove('open');
          }
        });
        form.addEventListener('mousedown', (e) => {
          if (!e.target.closest('.combo')) list.classList.remove('open');
        });
        $('#svc-clear', form).addEventListener('click', clearSelection);

        // one-tap common services
        $$('.qp', form).forEach((b) =>
          b.addEventListener('click', () => {
            const name = b.dataset.qp;
            const existing = state.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
            if (existing) select(existing);
            else selectCreate(name, b.dataset.qpUrl || '');
          }));

        if (presetService) select(presetService);

        // used by "add another" to reset for the next entry without closing
        form.resetForNext = () => {
          clearSelection();
          form.account.value = '';
          form.notes.value = '';
        };
      }

      form.getPayload = () => {
        if (!selectedService) throw new Error('Pick a service (or type a name to create one)');
        const payload = {
          keyId: key.id,
          kind,
          account: form.account.value.trim(),
          totpApp: kind === 'totp' ? form.totpApp.value.trim() : '',
          notes: form.notes.value.trim(),
        };
        if (editing) return payload;
        if (createNew) payload.service = { name: selectedService.name, url: form.newUrl.value.trim(), icon: form.newUrl.value.trim() ? 'favicon' : '' };
        else payload.serviceId = selectedService.id;
        return payload;
      };
    },
    onSubmit: async (form) => {
      const payload = form.getPayload();
      if (editing) {
        payload.keyId = Number(form.moveKey.value) || reg.keyId;
        payload.revoked = reg.revoked;
        await api(`/registrations/${reg.id}`, { method: 'PUT', body: payload });
        toast(payload.keyId !== reg.keyId ? 'Moved to the other key' : 'Registration updated');
      } else {
        await api('/registrations', { body: payload });
        toast('Added to key');
        // Refresh BEFORE resetting the picker, so the just-created service is
        // in the list and can't be accidentally created again as a duplicate.
        await refresh();
        if (form.addAnother && form.addAnother.checked) {
          form.keepOpen = true;
          if (form.resetForNext) form.resetForNext();
        }
        return;
      }
      refresh();
    },
  });
}

/* ============================== "which key is this?" ============================== */

// Ask the plugged-in key to answer with one of the paired credentials — the
// assertion's credential id tells us exactly which registered key it is.
// Several keys can be plugged in at once: the one the user touches answers.
async function identifyAssertion(signal) {
  const paired = state.keys.filter((k) => k.credentialId);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: paired.map((k) => ({ type: 'public-key', id: b64urlToBuf(k.credentialId) })),
      userVerification: 'discouraged',
      timeout: 60000,
    },
    signal,
  });
  return paired.find((k) => k.credentialId === assertion.id) || null;
}

function identifyModal() {
  const pairedCount = state.keys.filter((k) => k.credentialId).length;
  openModal({
    title: 'Which key is this?',
    code: 'Form ID-01 · identify',
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
    onSubmit: async () => { /* footer button just closes */ },
  });
}

// Pick which key a service should (also) live on — the actionable side of
// the coverage warnings.
function pickKeyModal(svc) {
  const covered = new Set(regsForService(svc.id).map((r) => r.keyId));
  const order = { active: 0, backup: 1, retired: 2, lost: 3 };
  const keys = [...state.keys].sort((a, b) =>
    (covered.has(a.id) - covered.has(b.id)) || (order[a.status] - order[b.status]));
  openModal({
    title: `Register “${svc.name}” on…`,
    code: 'Form R-01 · pick a key',
    submitLabel: 'Cancel',
    bodyHTML: keys.length ? `
      <div class="section" style="margin:0;box-shadow:none"><div class="row-list">
        ${keys.map((k) => `
          <button type="button" class="row clickable pick-row" data-pick="${k.id}">
            <span class="key-dot" style="background:${esc(k.color)}">${esc(k.name.charAt(0).toUpperCase())}</span>
            <div class="row-main"><div class="row-title">${esc(k.name)}
              <span class="status-badge status-${esc(k.status)}">${STATUS_LABEL[k.status]}</span>
              ${covered.has(k.id) ? '<span class="chip ok">already on it</span>' : ''}
            </div></div>
          </button>`).join('')}
      </div></div>` : '<p class="muted">No keys on file yet.</p>',
    onOpen: (form, close) => {
      $('button[type=submit]', form).classList.remove('btn-primary');
      $$('[data-pick]', form).forEach((b) =>
        b.addEventListener('click', () => {
          const k = keyById(Number(b.dataset.pick));
          close();
          if (k) registrationModal({ key: k, presetService: svc });
        }));
    },
    onSubmit: async () => { /* footer button just closes */ },
  });
}

/* ============================== global keyboard shortcuts ============================== */

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

/* ============================== go ============================== */

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* PWA is optional */ });
}

boot();
