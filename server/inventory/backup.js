'use strict';

const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const webauthn = require('../lib/webauthn');
const keys = require('./keys');
const services = require('./services');
const registrations = require('./registrations');
const catalog = require('./catalog');
const secretNotes = require('./secret-notes');
const events = require('./events');

const FORMAT_VERSION = 1;
const LIMITS = { keys: 5000, services: 20000, registrations: 50000, catalog: 2000 };

function exportFor(userId) {
  return {
    app: 'keeyo',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    keys: db.prepare(`SELECT ${keys.COLUMNS}, secret, public_key AS publicKeyPem, credential_alg AS credentialAlg FROM keys WHERE user_id = ?`).all(userId),
    services: db.prepare(`SELECT ${services.COLUMNS} FROM services WHERE user_id = ?`).all(userId),
    registrations: db.prepare(`SELECT ${registrations.COLUMNS} FROM registrations WHERE user_id = ?`).all(userId),
    catalog: db.prepare(`SELECT ${catalog.COLUMNS} FROM catalog_items WHERE user_id = ?`).all(userId).map(catalog.mapRow),
  };
}

function importedCredential(raw) {
  const id = typeof raw.credentialId === 'string' && /^[A-Za-z0-9_-]{0,1024}$/.test(raw.credentialId) ? raw.credentialId : '';
  const pem = typeof raw.publicKeyPem === 'string'
    && raw.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')
    && raw.publicKeyPem.length < 4200 ? raw.publicKeyPem : '';
  return {
    id,
    publicKeyPem: id ? pem : '',
    alg: webauthn.isSupportedAlgorithm(raw.credentialAlg) ? Number(raw.credentialAlg) : -7,
    prfEnabled: raw.prfEnabled ? 1 : 0,
  };
}

function importFor(userId, data) {
  if (!data || data.app !== 'keeyo' || !Array.isArray(data.keys) || !Array.isArray(data.services) || !Array.isArray(data.registrations)) {
    throw new ApiError(400, 'That does not look like a Keeyo backup file');
  }
  if (data.keys.length > LIMITS.keys || data.services.length > LIMITS.services || data.registrations.length > LIMITS.registrations) {
    throw new ApiError(400, 'Backup file is too large');
  }
  const catalogItems = Array.isArray(data.catalog) ? data.catalog.slice(0, LIMITS.catalog) : [];

  tx(() => {
    db.prepare('DELETE FROM registrations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM services WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM keys WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM catalog_items WHERE user_id = ?').run(userId);

    for (const raw of catalogItems) {
      let item;
      try { item = catalog.sanitize(raw); } catch { continue; }
      catalog.insert(userId, item);
    }

    const keyIds = new Map();
    for (const raw of data.keys) {
      const verifiedAt = typeof raw.verifiedAt === 'string' ? raw.verifiedAt.slice(0, 40) : '';
      const id = keys.insert(userId, keys.sanitize(raw), importedCredential(raw), secretNotes.fromBackup(raw.secret), verifiedAt);
      events.log(userId, id, 'created', 'Restored from backup import');
      keyIds.set(raw.id, id);
    }

    const serviceIds = new Map();
    for (const raw of data.services) {
      serviceIds.set(raw.id, services.insert(userId, services.sanitize(raw)));
    }

    for (const raw of data.registrations) {
      const keyId = keyIds.get(raw.keyId);
      const serviceId = serviceIds.get(raw.serviceId);
      if (!keyId || !serviceId) continue;
      registrations.insert(userId, keyId, serviceId, registrations.sanitize(raw));
    }
  });
}

module.exports = { exportFor, importFor };
