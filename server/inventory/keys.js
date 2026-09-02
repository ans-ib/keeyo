'use strict';

const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str, oneOf, HEX_COLOR_RE, IMAGE_DATA_URL_RE } = require('../lib/validate');
const webauthn = require('../lib/webauthn');
const secretNotes = require('./secret-notes');
const events = require('./events');

const STATUSES = ['active', 'backup', 'lost', 'retired'];
const DEFAULT_COLOR = '#2dd4bf';
const MAX_IMAGE_CHARS = 500000;

const COLUMNS = `id, name, vendor, model, serial, color,
  form_factor AS formFactor, status, purchased_at AS purchasedAt, notes, image,
  credential_id AS credentialId, verified_at AS verifiedAt, prf_enabled AS prfEnabled,
  CASE WHEN secret != '' THEN 1 ELSE 0 END AS hasSecret,
  CASE WHEN secret LIKE 'enc:v1:%' THEN 1 ELSE 0 END AS secretEncrypted,
  created_at AS createdAt`;

function sanitize(body) {
  const color = str(body.color, { label: 'color', max: 20 });
  const image = typeof body.image === 'string' ? body.image : '';
  if (image.length > MAX_IMAGE_CHARS) throw new ApiError(400, 'Photo is too large — use a smaller image');
  return {
    name: str(body.name, { required: true, label: 'Key name', max: 120 }),
    vendor: str(body.vendor, { label: 'vendor', max: 80 }),
    model: str(body.model, { label: 'model', max: 120 }),
    serial: str(body.serial, { label: 'serial', max: 120 }),
    color: HEX_COLOR_RE.test(color) ? color.toLowerCase() : DEFAULT_COLOR,
    formFactor: str(body.formFactor, { label: 'form factor', max: 40 }) || 'usb-a',
    status: oneOf(body.status, STATUSES, 'active'),
    purchasedAt: str(body.purchasedAt, { label: 'purchase date', max: 40 }),
    notes: str(body.notes, { label: 'notes', max: 2000 }),
    image: IMAGE_DATA_URL_RE.test(image) ? image : '',
  };
}

function get(userId, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM keys WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Key not found');
  return row;
}

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM keys WHERE user_id = ? ORDER BY created_at, id`).all(userId);
}

function insert(userId, k, credential, secret, verifiedAt = '') {
  const info = db.prepare(`
    INSERT INTO keys (user_id, name, vendor, model, serial, color, form_factor, status, purchased_at, notes,
      image, credential_id, public_key, credential_alg, secret, verified_at, prf_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, k.name, k.vendor, k.model, k.serial, k.color, k.formFactor, k.status, k.purchasedAt, k.notes,
    k.image,
    credential ? credential.id : '',
    credential ? credential.publicKeyPem : '',
    credential ? credential.alg : -7,
    secret,
    verifiedAt,
    credential ? credential.prfEnabled : 0,
  );
  return Number(info.lastInsertRowid);
}

function create(userId, body) {
  const k = sanitize(body);
  const credential = webauthn.parseCredential(body.credential);
  const secret = secretNotes.fromBody(body);
  const id = insert(userId, k, credential, secret || '');
  const model = [k.vendor, k.model].filter(Boolean).join(' ') || 'unknown model';
  events.log(userId, id, 'created', `Registered — ${model}${credential ? ' (paired)' : ''}`);
  if (secret) events.log(userId, id, 'secret-set', 'Secret note stored');
  return get(userId, id);
}

function update(userId, id, body) {
  const before = get(userId, id);
  const k = sanitize(body);
  const credential = webauthn.parseCredential(body.credential);
  const secret = secretNotes.fromBody(body);

  tx(() => {
    db.prepare(`
      UPDATE keys SET name = ?, vendor = ?, model = ?, serial = ?, color = ?, form_factor = ?,
        status = ?, purchased_at = ?, notes = ?, image = ?
      WHERE user_id = ? AND id = ?
    `).run(k.name, k.vendor, k.model, k.serial, k.color, k.formFactor, k.status, k.purchasedAt, k.notes, k.image, userId, id);

    if (credential) {
      if (before.hasSecret && before.credentialId && before.credentialId !== credential.id && secret === undefined) {
        throw new ApiError(403, 'This key holds a secret note bound to its current pairing — clear or replace the note to re-pair');
      }
      db.prepare('UPDATE keys SET credential_id = ?, public_key = ?, credential_alg = ?, prf_enabled = ? WHERE user_id = ? AND id = ?')
        .run(credential.id, credential.publicKeyPem, credential.alg, credential.prfEnabled, userId, id);
      if (credential.id !== before.credentialId) {
        events.log(userId, id, 'paired', `Paired with the physical key${credential.prfEnabled ? ' (encryption-capable)' : ''}`);
      }
    }
    if (secret !== undefined) {
      db.prepare('UPDATE keys SET secret = ? WHERE user_id = ? AND id = ?').run(secret, userId, id);
      events.log(userId, id, secret ? 'secret-set' : 'secret-cleared', secret ? 'Secret note stored' : 'Secret note cleared');
    }
    if (k.status !== before.status) {
      events.log(userId, id, 'status', `Status: ${before.status} → ${k.status}`);
    }
  });
  return get(userId, id);
}

function markVerified(userId, id) {
  get(userId, id);
  db.prepare('UPDATE keys SET verified_at = ? WHERE user_id = ? AND id = ?').run(new Date().toISOString(), userId, id);
  events.log(userId, id, 'verified', 'Key tested and confirmed working');
  return get(userId, id);
}

function remove(userId, id) {
  get(userId, id);
  db.prepare('DELETE FROM keys WHERE user_id = ? AND id = ?').run(userId, id);
}

function pairing(userId, id) {
  const row = db.prepare(
    'SELECT credential_id AS credentialId, public_key AS publicKeyPem, credential_alg AS alg, secret FROM keys WHERE user_id = ? AND id = ?',
  ).get(userId, id);
  if (!row) throw new ApiError(404, 'Key not found');
  return row;
}

module.exports = { STATUSES, COLUMNS, sanitize, get, list, insert, create, update, markVerified, remove, pairing };
