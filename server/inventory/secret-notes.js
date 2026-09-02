'use strict';

const { ApiError } = require('../lib/errors');

const ENVELOPE_RE = /^enc:v1:[A-Za-z0-9_-]{16,88}:[A-Za-z0-9_-]{8,32}:[A-Za-z0-9_-]{8,1400}$/;
const MAX_PLAINTEXT = 500;

function fromBody(body) {
  if (body.clearSecret === true) return '';
  if (typeof body.secret !== 'string' || body.secret.trim() === '') return undefined;
  const secret = body.secret.trim();
  if (secret.startsWith('enc:')) {
    if (!ENVELOPE_RE.test(secret)) throw new ApiError(400, 'Malformed encrypted note');
    return secret;
  }
  if (secret.length > MAX_PLAINTEXT) throw new ApiError(400, 'Secret note is too long');
  return secret;
}

function fromBackup(raw) {
  if (typeof raw !== 'string') return '';
  if (raw.startsWith('enc:')) return ENVELOPE_RE.test(raw) ? raw : '';
  return raw.slice(0, MAX_PLAINTEXT);
}

function prfSalt(secret) {
  if (!secret.startsWith('enc:v1:')) return null;
  const parts = secret.split(':');
  return parts.length === 5 ? parts[2] : null;
}

module.exports = { fromBody, fromBackup, prfSalt };
