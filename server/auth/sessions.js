'use strict';

const crypto = require('node:crypto');
const config = require('../config');
const { db } = require('../db');
const { parseCookies } = require('../lib/cookies');

const { cookieName, ttlDays } = config.session;
const TTL_MS = ttlDays * 24 * 60 * 60 * 1000;

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setCookie(req, res, token) {
  let cookie = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}`;
  if (isSecureRequest(req)) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function currentToken(req) {
  return parseCookies(req.headers.cookie)[cookieName] || '';
}

function create(req, res, userId, via = 'password') {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, via) VALUES (?, ?, ?, ?)').run(token, userId, expiresAt, via);
  setCookie(req, res, token);
}

function destroy(req, res) {
  const token = currentToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearCookie(res);
}

function currentUser(req) {
  const token = currentToken(req);
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_admin AS isAdmin, u.password_hash AS passwordHash, s.via, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username, email: row.email, isAdmin: !!row.isAdmin, sso: row.passwordHash === 'sso', via: row.via };
}

function currentVia(req) {
  const row = db.prepare('SELECT via FROM sessions WHERE token = ?').get(currentToken(req));
  return row ? row.via : null;
}

function revokeOthers(userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken);
}

module.exports = { create, destroy, currentUser, currentToken, currentVia, revokeOthers };
