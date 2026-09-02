'use strict';

const { db } = require('../db');
const { ApiError } = require('../lib/errors');
const { str } = require('../lib/validate');
const keys = require('./keys');
const events = require('./events');

const COLUMNS = 'id, key_id AS keyId, name, mime, size, created_at AS createdAt';
const MAX_PER_KEY = 10;
const MAX_BYTES = 5 * 1024 * 1024;

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM attachments WHERE user_id = ? ORDER BY created_at, id`).all(userId);
}

function add(userId, keyId, body) {
  keys.get(userId, keyId);
  const name = str(body.name, { required: true, label: 'File name', max: 200 });
  const mime = str(body.mime, { label: 'file type', max: 100 }) || 'application/octet-stream';
  const count = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE key_id = ?').get(keyId).n;
  if (count >= MAX_PER_KEY) throw new ApiError(400, `A key can hold at most ${MAX_PER_KEY} files`);
  if (typeof body.data !== 'string' || !body.data) throw new ApiError(400, 'File content is missing');
  let buf;
  try { buf = Buffer.from(body.data, 'base64'); } catch { throw new ApiError(400, 'Invalid file content'); }
  if (buf.length === 0) throw new ApiError(400, 'File is empty');
  if (buf.length > MAX_BYTES) throw new ApiError(400, 'Files can be at most 5 MB');
  const info = db.prepare('INSERT INTO attachments (user_id, key_id, name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, keyId, name, mime, buf.length, buf);
  events.log(userId, keyId, 'attachment-added', name);
  return db.prepare(`SELECT ${COLUMNS} FROM attachments WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function read(userId, id) {
  const row = db.prepare('SELECT name, mime, data FROM attachments WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new ApiError(404, 'File not found');
  return row;
}

function remove(userId, id) {
  const row = db.prepare('SELECT id, key_id AS keyId, name FROM attachments WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new ApiError(404, 'File not found');
  db.prepare('DELETE FROM attachments WHERE user_id = ? AND id = ?').run(userId, id);
  events.log(userId, row.keyId, 'attachment-removed', row.name);
}

module.exports = { list, add, read, remove };
