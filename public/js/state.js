import { api } from './lib/api.js';

export const state = {
  me: null,
  keys: [],
  services: [],
  registrations: [],
  catalog: [],
  attachments: [],
  keySearch: '',
  svcSearch: '',
  svcOpen: null,
  keyStatusFilter: 'all',
  keySort: 'newest',
};

export const STALE_DAYS = 180;

export function staleKeys() {
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  return state.keys.filter((k) => {
    if (k.status !== 'active' && k.status !== 'backup') return false;
    const last = new Date(k.verifiedAt || k.createdAt).getTime();
    return Number.isFinite(last) && last < cutoff;
  });
}

export const KIND_LABEL = { passkey: 'Passkey', 'second-factor': '2FA key', totp: 'TOTP' };

export const KIND_CHIP = { passkey: 'accent', 'second-factor': 'info', totp: 'warn' };

export const STATUS_LABEL = { active: 'Active', backup: 'Backup', lost: 'Lost', retired: 'Retired' };

export const keyById = (id) => state.keys.find((k) => k.id === id);

export const serviceById = (id) => state.services.find((s) => s.id === id);

export const regsForKey = (id) => state.registrations.filter((r) => r.keyId === id);

export const regsForService = (id) => state.registrations.filter((r) => r.serviceId === id);

export const attachmentsForKey = (id) => state.attachments.filter((a) => a.keyId === id);

export async function loadData() {
  const [me, data] = await Promise.all([api('/me'), api('/data')]);
  state.me = me;
  state.keys = data.keys;
  state.services = data.services;
  state.registrations = data.registrations;
  state.catalog = data.catalog || [];
  state.attachments = data.attachments || [];
}
