import { AAGUIDS } from './data/aaguids.js';
import { CATALOG, findModel } from './data/models.js';
import { api } from './lib/api.js';
import { state } from './state.js';

export const SWATCHES = ['#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#f87171', '#94a3b8'];

export function catalogModel(key) {
  const builtin = findModel(key.vendor, key.model);
  if (builtin) return builtin;
  const custom = customCatalog('model').find((c) =>
    c.value === key.model && (c.extra.vendor || '') === key.vendor);
  if (!custom) return null;
  return { name: custom.value, formFactor: custom.extra.formFactor || 'other', nfc: !!custom.extra.nfc, passkeySlots: null, totpSlots: null, note: '' };
}

export const customCatalog = (type) => state.catalog.filter((c) => c.type === type);

export function allVendors() {
  const list = CATALOG.vendors.map((v) => ({ id: v.id, name: v.name, builtin: true }));
  for (const c of customCatalog('vendor')) {
    if (!list.some((v) => v.id.toLowerCase() === c.value.toLowerCase())) {
      list.push({ id: c.value, name: c.value, builtin: false });
    }
  }
  return list;
}

export function modelsForVendor(vendorId) {
  const vid = (vendorId || '').toLowerCase();
  const v = CATALOG.vendors.find((x) => x.id.toLowerCase() === vid);
  const list = v ? [...v.models] : [];
  for (const c of customCatalog('model')) {
    if ((c.extra.vendor || '').toLowerCase() === vid &&
        !list.some((m) => m.name.toLowerCase() === c.value.toLowerCase())) {
      list.push({ name: c.value, formFactor: c.extra.formFactor || 'other', nfc: !!c.extra.nfc, passkeySlots: null, totpSlots: null, note: '' });
    }
  }
  return list;
}

export function allFormFactors() {
  const list = [...CATALOG.formFactors];
  for (const c of customCatalog('form-factor')) {
    if (!list.some((f) => f.id.toLowerCase() === c.value.toLowerCase())) {
      list.push({ id: c.value, name: c.value });
    }
  }
  return list;
}

export function allSwatches() {
  const list = [...SWATCHES];
  for (const c of customCatalog('color')) if (!list.includes(c.value)) list.push(c.value);
  return list;
}

export async function ensureCatalogItem(type, value, extra = {}) {
  value = (value || '').trim();
  if (!value) return null;
  if (type === 'vendor' && CATALOG.vendors.some((v) => v.id.toLowerCase() === value.toLowerCase())) return null;
  if (type === 'form-factor' && CATALOG.formFactors.some((f) => f.id.toLowerCase() === value.toLowerCase())) return null;
  if (type === 'color' && SWATCHES.includes(value.toLowerCase())) return null;
  if (type === 'model' && findModel(extra.vendor, value)) return null;
  const exists = customCatalog(type).some((c) =>
    c.value.toLowerCase() === value.toLowerCase() &&
    (type !== 'model' || (c.extra.vendor || '').toLowerCase() === (extra.vendor || '').toLowerCase()));
  if (exists) return null;
  const created = await api('/catalog', { body: { type, value, extra } });
  state.catalog.push(created);
  return created;
}

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

export async function lookupAaguid(aaguid) {
  const c = customCatalog('model').find((m) => (m.extra.aaguid || '') === aaguid);
  if (c) return { vendor: c.extra.vendor || '', label: c.value, models: [c.value], source: 'catalog' };
  try {
    const r = await api(`/aaguid/${aaguid}`);
    if (r.found) {
      return { vendor: registryVendor(r.name), label: r.name, models: registryModels(r.name), icon: r.icon, source: 'registry' };
    }
  } catch {}
  const seed = AAGUIDS[aaguid];
  if (seed) return { ...seed, source: 'seed' };
  return null;
}

export async function updateCatalogItem(id, value, extra = {}) {
  const updated = await api(`/catalog/${id}`, { method: 'PUT', body: { value, extra } });
  state.catalog = state.catalog.map((c) => (c.id === id ? updated : c));
  return updated;
}
