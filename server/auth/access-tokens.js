'use strict';

const crypto = require('node:crypto');
const { db } = require('../db');
const { ApiError } = require('../lib/errors');
const { str, oneOf } = require('../lib/validate');

const SCOPES = ['read', 'write'];
const EXPIRY_DAYS = [0, 30, 90, 365];
const MAX_PER_USER = 20;
const PREFIX = 'keeyo_';
const PREFIX_SHOWN = PREFIX.length + 6;
const LAST_USED_STEP_MS = 60 * 1000;
const COLUMNS = 'id, name, prefix, scope, expires_at AS expiresAt, last_used_at AS lastUsedAt, created_at AS createdAt';

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function list(userId) {
  return db.prepare(`SELECT ${COLUMNS} FROM access_tokens WHERE user_id = ? ORDER BY id`).all(userId);
}

function create(userId, body) {
  const name = str(body.name, { required: true, label: 'Token name', max: 80 });
  const scope = oneOf(body.scope, SCOPES, 'read');
  const days = Number(body.expiresInDays || 0);
  if (!EXPIRY_DAYS.includes(days)) throw new ApiError(400, 'Invalid expiry');
  const count = db.prepare('SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = ?').get(userId).n;
  if (count >= MAX_PER_USER) throw new ApiError(400, `At most ${MAX_PER_USER} access tokens per account`);

  const token = PREFIX + crypto.randomBytes(32).toString('base64url');
  const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : '';
  const info = db.prepare(
    'INSERT INTO access_tokens (user_id, name, token_hash, prefix, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, name, hash(token), token.slice(0, PREFIX_SHOWN), scope, expiresAt);
  const row = db.prepare(`SELECT ${COLUMNS} FROM access_tokens WHERE id = ?`).get(Number(info.lastInsertRowid));
  return { ...row, token };
}

function remove(userId, id) {
  const row = db.prepare('SELECT id FROM access_tokens WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new ApiError(404, 'Token not found');
  db.prepare('DELETE FROM access_tokens WHERE user_id = ? AND id = ?').run(userId, id);
}

function removeAllFor(userId) {
  return db.prepare('DELETE FROM access_tokens WHERE user_id = ?').run(userId).changes;
}

function fromHeader(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(header || '');
  return match ? match[1] : '';
}

function authenticate(token) {
  if (!token.startsWith(PREFIX)) return null;
  const row = db.prepare(`
    SELECT t.id AS tokenId, t.scope, t.expires_at AS expiresAt, t.last_used_at AS lastUsedAt,
           u.id, u.username, u.email, u.is_admin AS isAdmin
    FROM access_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(hash(token));
  if (!row) return null;
  const now = new Date();
  if (row.expiresAt && row.expiresAt < now.toISOString()) return null;
  if (!row.lastUsedAt || now.getTime() - new Date(row.lastUsedAt).getTime() > LAST_USED_STEP_MS) {
    db.prepare('UPDATE access_tokens SET last_used_at = ? WHERE id = ?').run(now.toISOString(), row.tokenId);
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    isAdmin: !!row.isAdmin,
    token: { id: row.tokenId, scope: row.scope },
  };
}

module.exports = { SCOPES, EXPIRY_DAYS, list, create, remove, removeAllFor, fromHeader, authenticate };
