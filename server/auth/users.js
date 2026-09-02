'use strict';

const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str } = require('../lib/validate');

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SSO_PASSWORD = 'sso';

function count() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function findByUsername(username) {
  const row = db.prepare(
    'SELECT id, username, email, password_hash AS passwordHash, is_admin AS isAdmin FROM users WHERE username = ?',
  ).get(username);
  return row ? { ...row, isAdmin: !!row.isAdmin } : null;
}

function findByEmail(email) {
  const row = db.prepare(
    "SELECT id, username, email, password_hash AS passwordHash, is_admin AS isAdmin FROM users WHERE email != '' AND email = ? COLLATE NOCASE",
  ).get(email);
  return row ? { ...row, isAdmin: !!row.isAdmin } : null;
}

function parseUsername(value) {
  const username = str(value, { required: true, label: 'Username', max: 40 }).toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(400, 'Username must be 3-40 characters: letters, numbers, dots, dashes, underscores');
  }
  return username;
}

function rename(id, value) {
  const username = parseUsername(value);
  const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
  if (taken) throw new ApiError(400, 'That username is taken');
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, id);
  return username;
}

function setEmail(id, email) {
  const value = str(email, { label: 'Email', max: 200 }).toLowerCase();
  if (value && !EMAIL_RE.test(value)) throw new ApiError(400, 'That is not a valid email address');
  if (value) {
    const taken = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(value, id);
    if (taken) throw new ApiError(400, 'Another account already uses that email address');
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(value, id);
  return value;
}

function exists(id) {
  return !!db.prepare('SELECT id FROM users WHERE id = ?').get(id);
}

function isSso(id) {
  return passwordHashOf(id) === SSO_PASSWORD;
}

function list() {
  return db.prepare('SELECT id, username, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY id').all()
    .map((row) => ({ ...row, isAdmin: !!row.isAdmin }));
}

function create({ username, passwordHash, isAdmin = false }) {
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, passwordHash, isAdmin ? 1 : 0);
  return Number(info.lastInsertRowid);
}

function remove(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function removeAccount(id, { deleteMembers = false } = {}) {
  const me = db.prepare('SELECT id, is_admin AS isAdmin FROM users WHERE id = ?').get(id);
  if (!me) throw new ApiError(404, 'User not found');
  const others = list().filter((u) => u.id !== id);
  if (deleteMembers) {
    if (!me.isAdmin) throw new ApiError(403, 'Only an administrator can delete other members');
    tx(() => db.prepare('DELETE FROM users').run());
    return { removed: others.length + 1 };
  }
  if (me.isAdmin && others.length && !others.some((u) => u.isAdmin)) {
    throw new ApiError(400, 'You are the only administrator. Make another member an administrator first, or delete everyone.');
  }
  remove(id);
  return { removed: 1 };
}

function passwordHashOf(id) {
  const row = db.prepare('SELECT password_hash AS passwordHash FROM users WHERE id = ?').get(id);
  return row ? row.passwordHash : '';
}

function setPasswordHash(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function parseCredentials(body) {
  const username = parseUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (password.length > 200) throw new ApiError(400, 'Password is too long');
  return { username, password };
}

module.exports = {
  SSO_PASSWORD,
  count,
  findByUsername,
  findByEmail,
  parseUsername,
  rename,
  setEmail,
  exists,
  isSso,
  list,
  create,
  remove,
  removeAccount,
  passwordHashOf,
  setPasswordHash,
  parseCredentials,
};
