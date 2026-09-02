'use strict';

const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str, oneOf, intId } = require('../lib/validate');
const keys = require('./keys');
const services = require('./services');
const events = require('./events');

const KINDS = ['passkey', 'second-factor', 'totp'];
const KIND_LABELS = { passkey: 'passkey', 'second-factor': '2FA', totp: 'TOTP' };

const COLUMNS = `id, key_id AS keyId, service_id AS serviceId, kind, account,
  totp_app AS totpApp, notes, revoked, created_at AS createdAt`;

function sanitize(body) {
  const kind = oneOf(body.kind, KINDS, 'passkey');
  return {
    kind,
    account: str(body.account, { label: 'account', max: 200 }),
    totpApp: kind === 'totp' ? str(body.totpApp, { label: 'TOTP app', max: 120 }) : '',
    notes: str(body.notes, { label: 'notes', max: 2000 }),
    revoked: body.revoked ? 1 : 0,
  };
}

function get(userId, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM registrations WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Registration not found');
  return row;
}

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM registrations WHERE user_id = ? ORDER BY created_at, id`).all(userId);
}

function insert(userId, keyId, serviceId, r) {
  const info = db.prepare(`
    INSERT INTO registrations (user_id, key_id, service_id, kind, account, totp_app, notes, revoked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, keyId, serviceId, r.kind, r.account, r.totpApp, r.notes, r.revoked);
  return Number(info.lastInsertRowid);
}

function resolveServiceId(userId, body) {
  if (body.serviceId) {
    const serviceId = intId(body.serviceId);
    services.get(userId, serviceId);
    return serviceId;
  }
  if (body.service && typeof body.service === 'object') return services.findOrCreate(userId, body.service);
  throw new ApiError(400, 'A service is required');
}

function create(userId, body) {
  const keyId = intId(body.keyId);
  keys.get(userId, keyId);
  const r = { ...sanitize(body), revoked: 0 };
  const id = tx(() => insert(userId, keyId, resolveServiceId(userId, body), r));
  const row = get(userId, id);
  events.log(userId, row.keyId, 'registration-added', `${services.nameOf(userId, row.serviceId)} — ${KIND_LABELS[row.kind] || row.kind}`);
  return row;
}

function update(userId, id, body) {
  const existing = get(userId, id);
  const r = sanitize(body);
  let keyId = existing.keyId;
  if (body.keyId !== undefined && intId(body.keyId) !== existing.keyId) {
    keyId = intId(body.keyId);
    keys.get(userId, keyId);
  }
  db.prepare('UPDATE registrations SET key_id = ?, kind = ?, account = ?, totp_app = ?, notes = ?, revoked = ? WHERE user_id = ? AND id = ?')
    .run(keyId, r.kind, r.account, r.totpApp, r.notes, r.revoked, userId, id);

  const serviceName = services.nameOf(userId, existing.serviceId);
  if (keyId !== existing.keyId) {
    events.log(userId, existing.keyId, 'registration-removed', `${serviceName} — moved to another key`);
    events.log(userId, keyId, 'registration-added', `${serviceName} — moved here`);
  }
  if (!!r.revoked !== !!existing.revoked) {
    events.log(userId, keyId, r.revoked ? 'revoked' : 'unrevoked', `${serviceName} ${r.revoked ? 'revoked at the service' : 'marked active again'}`);
  }
  return get(userId, id);
}

function remove(userId, id) {
  const existing = get(userId, id);
  const serviceName = services.nameOf(userId, existing.serviceId);
  db.prepare('DELETE FROM registrations WHERE user_id = ? AND id = ?').run(userId, id);
  events.log(userId, existing.keyId, 'registration-removed', serviceName);
}

module.exports = { KINDS, COLUMNS, sanitize, get, list, insert, create, update, remove };
