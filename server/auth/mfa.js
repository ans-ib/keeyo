'use strict';

const crypto = require('node:crypto');
const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { ExpiringStore } = require('../lib/expiring-store');
const { str } = require('../lib/validate');
const totp = require('../lib/totp');
const webauthn = require('../lib/webauthn');

const pendingTotp = new ExpiringStore({ ttlMs: 10 * 60 * 1000, maxEntries: 1000 });

function totpSecretFor(userId) {
  const row = db.prepare('SELECT totp_secret AS secret, totp_counter AS counter FROM users WHERE id = ?').get(userId);
  return row && row.secret ? row : null;
}

function beginTotpSetup(user) {
  const secret = totp.generateSecret();
  pendingTotp.set(user.id, secret);
  return { secret, otpauth: totp.otpauthURL(user.username, secret) };
}

function confirmTotpSetup(userId, code) {
  const secret = pendingTotp.peek(userId);
  if (!secret) throw new ApiError(400, 'Setup expired — start again');
  const counter = totp.verifyCode(secret, code, 0);
  if (!counter) throw new ApiError(400, 'That code does not match — check the app and try again');
  pendingTotp.delete(userId);
  db.prepare('UPDATE users SET totp_secret = ?, totp_counter = ? WHERE id = ?').run(secret, counter, userId);
}

function disableTotp(userId) {
  db.prepare("UPDATE users SET totp_secret = '', totp_counter = 0 WHERE id = ?").run(userId);
  dropOrphanedRecoveryCodes(userId);
}

function verifyTotpLogin(userId, code) {
  const current = totpSecretFor(userId);
  const counter = current && totp.verifyCode(current.secret, code, current.counter);
  if (!counter) return false;
  db.prepare('UPDATE users SET totp_counter = ? WHERE id = ?').run(counter, userId);
  return true;
}

const MAX_LOGIN_KEYS = 10;
const LOGIN_KEY_COLUMNS = 'id, name, credential_id AS credentialId, alg, created_at AS createdAt';

function listLoginKeys(userId) {
  return db.prepare(`SELECT ${LOGIN_KEY_COLUMNS} FROM login_credentials WHERE user_id = ? ORDER BY id`).all(userId);
}

function loginKeyCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM login_credentials WHERE user_id = ?').get(userId).n;
}

function loginCredentialIds(userId) {
  return db.prepare('SELECT credential_id AS credentialId FROM login_credentials WHERE user_id = ?').all(userId)
    .map((row) => row.credentialId);
}

function findLoginCredential(userId, credentialId) {
  return db.prepare('SELECT public_key AS publicKeyPem, alg FROM login_credentials WHERE user_id = ? AND credential_id = ?')
    .get(userId, String(credentialId || '')) || null;
}

function parseLoginKey(body) {
  const name = str(body.name, { required: true, label: 'Key name', max: 80 });
  const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey.replace(/\s+/g, '') : '';
  const alg = Number(body.alg);
  if (!webauthn.isCredentialId(credentialId)) throw new ApiError(400, 'Invalid credential');
  if (!webauthn.isSpkiBase64(publicKey)) throw new ApiError(400, 'Invalid public key');
  if (!webauthn.isSupportedAlgorithm(alg)) throw new ApiError(400, 'Unsupported key algorithm');
  return { name, credentialId, publicKey, alg };
}

function enrollLoginKey(userId, { name, credentialId, publicKey, alg }) {
  const dupe = db.prepare('SELECT id FROM login_credentials WHERE user_id = ? AND credential_id = ?').get(userId, credentialId);
  if (dupe) throw new ApiError(400, 'That key is already enrolled');
  if (loginKeyCount(userId) >= MAX_LOGIN_KEYS) throw new ApiError(400, `At most ${MAX_LOGIN_KEYS} sign-in keys per account`);
  const info = db.prepare('INSERT INTO login_credentials (user_id, name, credential_id, public_key, alg) VALUES (?, ?, ?, ?, ?)')
    .run(userId, name, credentialId, webauthn.spkiToPem(publicKey), alg);
  return db.prepare(`SELECT ${LOGIN_KEY_COLUMNS} FROM login_credentials WHERE id = ?`).get(Number(info.lastInsertRowid));
}

function removeLoginKey(userId, id) {
  const row = db.prepare('SELECT id FROM login_credentials WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new ApiError(404, 'Sign-in key not found');
  db.prepare('DELETE FROM login_credentials WHERE user_id = ? AND id = ?').run(userId, id);
  dropOrphanedRecoveryCodes(userId);
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const RECOVERY_COUNT = 10;

function hashRecoveryCode(code) {
  return crypto.createHash('sha256')
    .update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
}

function recoveryStatus(userId) {
  const row = db.prepare(
    "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN used_at = '' THEN 1 ELSE 0 END), 0) AS remaining FROM recovery_codes WHERE user_id = ?",
  ).get(userId);
  return { total: row.total, remaining: row.remaining };
}

function generateRecoveryCodes(userId) {
  if (!hasSecondFactor(userId)) {
    throw new ApiError(400, 'Enroll a sign-in key or authenticator app first — recovery codes are a fallback for a second factor');
  }
  const codes = [];
  tx(() => {
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (let i = 0; i < RECOVERY_COUNT; i++) {
      let raw = '';
      for (let j = 0; j < 10; j++) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      codes.push(code);
      insert.run(userId, hashRecoveryCode(code));
    }
  });
  return codes;
}

function consumeRecoveryCode(userId, code) {
  const row = db.prepare("SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at = ''")
    .get(userId, hashRecoveryCode(code));
  if (!row) return false;
  db.prepare("UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return true;
}

function dropOrphanedRecoveryCodes(userId) {
  if (!hasSecondFactor(userId)) db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
}

function hasSecondFactor(userId) {
  return loginKeyCount(userId) > 0 || !!totpSecretFor(userId);
}

function status(userId) {
  return {
    totpEnabled: !!totpSecretFor(userId),
    loginKeys: loginKeyCount(userId),
    recovery: recoveryStatus(userId),
  };
}

function methodsFor(userId) {
  const credentialIds = loginCredentialIds(userId);
  const totpOn = !!totpSecretFor(userId);
  if (credentialIds.length === 0 && !totpOn) return null;
  return {
    credentialIds,
    webauthn: credentialIds.length > 0,
    totp: totpOn,
    recovery: recoveryStatus(userId).remaining > 0,
  };
}

module.exports = {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  verifyTotpLogin,
  listLoginKeys,
  findLoginCredential,
  parseLoginKey,
  enrollLoginKey,
  removeLoginKey,
  generateRecoveryCodes,
  consumeRecoveryCode,
  recoveryStatus,
  status,
  methodsFor,
};
