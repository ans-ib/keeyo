'use strict';

const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const COOKIE_NAME = 'keeyo_session';

// ---------- passwords ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- cookies ----------

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  let cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (isSecureRequest(req)) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- sessions ----------

function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  setSessionCookie(req, res, token);
}

function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(res);
}

function sessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.is_admin AS isAdmin, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username, isAdmin: !!row.isAdmin };
}

function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// ---------- middleware ----------

function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in', needsSetup: userCount() === 0 });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ---------- login rate limiting ----------

const attempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function loginAllowed(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return true;
  return entry.count < MAX_ATTEMPTS;
}

function recordLoginFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(ip) {
  attempts.delete(ip);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  sessionUser,
  userCount,
  requireAuth,
  requireAdmin,
  loginAllowed,
  recordLoginFailure,
  clearLoginFailures,
};
