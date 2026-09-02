'use strict';

const crypto = require('node:crypto');
const { db } = require('../db');
const { ApiError } = require('../lib/errors');
const { hashPassword } = require('../lib/password');
const users = require('./users');
const email = require('./email');

const TTL_MINUTES = 45;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function available() {
  return !!email.current();
}

async function request(identifier, baseUrl) {
  if (!available()) return;
  const needle = String(identifier || '').trim().toLowerCase();
  if (!needle) return;
  const user = users.findByUsername(needle) || users.findByEmail(needle);
  if (!user || !user.email || user.passwordHash === users.SSO_PASSWORD) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare('DELETE FROM reset_tokens WHERE user_id = ? OR expires_at < ?').run(user.id, new Date().toISOString());
  db.prepare('INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, hashToken(token), expiresAt);

  const link = `${baseUrl}/#/reset/${token}`;
  await email.send(
    user.email,
    'Reset your Keeyo password',
    `Someone asked to reset the password for "${user.username}" at ${baseUrl}.\n\n` +
    `Open this link within ${TTL_MINUTES} minutes to set a new password:\n\n${link}\n\n` +
    `If this wasn't you, ignore this email — nothing changes.`,
  );
}

function complete(token, password) {
  if (typeof password !== 'string' || password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (password.length > 200) throw new ApiError(400, 'Password is too long');
  const row = db.prepare('SELECT id, user_id AS userId FROM reset_tokens WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(token), new Date().toISOString());
  if (!row) throw new ApiError(400, 'This reset link is invalid or has expired — request a new one');
  db.prepare('DELETE FROM reset_tokens WHERE id = ?').run(row.id);
  users.setPasswordHash(row.userId, hashPassword(password));
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.userId);
}

module.exports = { available, request, complete };
