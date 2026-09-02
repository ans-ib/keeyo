'use strict';

const crypto = require('node:crypto');
const { ApiError } = require('./errors');
const { ExpiringStore } = require('./expiring-store');

const store = new ExpiringStore({ ttlMs: 2 * 60 * 1000, maxEntries: 1000 });

function expired() {
  return new ApiError(400, 'Challenge expired — try again');
}

function issue(kind, fields = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const challenge = crypto.randomBytes(32).toString('base64url');
  store.set(token, { kind, challenge, ...fields });
  return { token, challenge };
}

function peek(token, kind) {
  const entry = store.peek(String(token || ''));
  if (!entry || entry.kind !== kind) throw expired();
  return entry;
}

function consume(token, kind) {
  const entry = store.take(String(token || ''));
  if (!entry || entry.kind !== kind) throw expired();
  return entry;
}

module.exports = { issue, peek, consume };
