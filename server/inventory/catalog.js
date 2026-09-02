'use strict';

const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str, AAGUID_RE } = require('../lib/validate');

const TYPES = ['vendor', 'model', 'form-factor', 'color'];
const COLUMNS = 'id, type, value, extra, created_at AS createdAt';
const MAX_PER_TYPE = 500;

function sanitize(body) {
  const type = body.type;
  if (!TYPES.includes(type)) throw new ApiError(400, 'Invalid catalog type');
  let value = str(body.value, { required: true, label: 'Value', max: 60 });
  const extraIn = body.extra && typeof body.extra === 'object' ? body.extra : {};
  const extra = {};
  if (type === 'color') {
    value = value.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(value)) throw new ApiError(400, 'Colors must be a hex value like #2dd4bf');
  }
  if (type === 'model') {
    extra.vendor = str(extraIn.vendor, { label: 'vendor', max: 80 });
    extra.formFactor = str(extraIn.formFactor, { label: 'form factor', max: 40 });
    const aaguid = str(extraIn.aaguid, { label: 'aaguid', max: 40 }).toLowerCase();
    if (AAGUID_RE.test(aaguid)) extra.aaguid = aaguid;
    if (extraIn.nfc) extra.nfc = true;
  }
  return { type, value, extra };
}

function mapRow(row) {
  let extra = {};
  try { extra = JSON.parse(row.extra || '{}'); } catch {}
  return { ...row, extra };
}

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE user_id = ? ORDER BY created_at, id`).all(userId).map(mapRow);
}

function get(userId, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Catalog entry not found');
  return mapRow(row);
}

function insert(userId, item) {
  const info = db.prepare('INSERT INTO catalog_items (user_id, type, value, extra) VALUES (?, ?, ?, ?)')
    .run(userId, item.type, item.value, JSON.stringify(item.extra));
  return Number(info.lastInsertRowid);
}

function sameEntry(row, item) {
  if (row.value.toLowerCase() !== item.value.toLowerCase()) return false;
  if (item.type !== 'model') return true;
  return (mapRow(row).extra.vendor || '').toLowerCase() === (item.extra.vendor || '').toLowerCase();
}

function add(userId, body) {
  const item = sanitize(body);
  const rows = db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE user_id = ? AND type = ?`).all(userId, item.type);
  const existing = rows.find((row) => sameEntry(row, item));
  if (existing) return mapRow(existing);
  if (rows.length >= MAX_PER_TYPE) throw new ApiError(400, 'Too many custom entries of this type');
  return get(userId, insert(userId, item));
}

function cascadeRename(userId, before, item) {
  if (item.type === 'vendor') {
    db.prepare('UPDATE keys SET vendor = ? WHERE user_id = ? AND vendor = ?').run(item.value, userId, before.value);
    const models = db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE user_id = ? AND type = 'model'`).all(userId).map(mapRow);
    for (const model of models) {
      if ((model.extra.vendor || '') !== before.value) continue;
      model.extra.vendor = item.value;
      db.prepare('UPDATE catalog_items SET extra = ? WHERE id = ?').run(JSON.stringify(model.extra), model.id);
    }
  }
  if (item.type === 'model') {
    db.prepare('UPDATE keys SET model = ?, vendor = ? WHERE user_id = ? AND model = ? AND vendor = ?')
      .run(item.value, item.extra.vendor, userId, before.value, before.extra.vendor || '');
  }
  if (item.type === 'form-factor') {
    db.prepare('UPDATE keys SET form_factor = ? WHERE user_id = ? AND form_factor = ?').run(item.value, userId, before.value);
  }
  if (item.type === 'color') {
    db.prepare('UPDATE keys SET color = ? WHERE user_id = ? AND color = ?').run(item.value, userId, before.value);
  }
}

function update(userId, id, body) {
  const before = get(userId, id);
  const item = sanitize({ ...body, type: before.type });
  const others = db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE user_id = ? AND type = ? AND id != ?`).all(userId, item.type, id);
  if (others.some((row) => sameEntry(row, item))) throw new ApiError(400, 'That entry already exists');
  tx(() => {
    db.prepare('UPDATE catalog_items SET value = ?, extra = ? WHERE user_id = ? AND id = ?')
      .run(item.value, JSON.stringify(item.extra), userId, id);
    cascadeRename(userId, before, item);
  });
  return get(userId, id);
}

function remove(userId, id) {
  get(userId, id);
  db.prepare('DELETE FROM catalog_items WHERE user_id = ? AND id = ?').run(userId, id);
}

module.exports = { TYPES, COLUMNS, sanitize, mapRow, list, get, insert, add, update, remove };
