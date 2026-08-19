'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { db, tx } = require('./db');
const auth = require('./auth');
const mds = require('./mds');

const router = express.Router();

const KINDS = ['passkey', 'second-factor', 'totp'];
const KIND_LABELS = { passkey: 'passkey', 'second-factor': '2FA', totp: 'TOTP' };
const STATUSES = ['active', 'backup', 'lost', 'retired'];
const CATALOG_TYPES = ['vendor', 'model', 'form-factor', 'color'];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- sanitizers ----------

function str(value, { max = 200, required = false, label = 'field' } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ApiError(400, `Invalid ${label}`);
  value = value.trim();
  if (required && !value) throw new ApiError(400, `${label} is required`);
  if (value.length > max) throw new ApiError(400, `${label} is too long (max ${max})`);
  return value;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function sanitizeKey(body) {
  const color = str(body.color, { label: 'color', max: 20 });
  const image = typeof body.image === 'string' ? body.image : '';
  if (image.length > 500000) throw new ApiError(400, 'Photo is too large — use a smaller image');
  return {
    name: str(body.name, { required: true, label: 'Key name', max: 120 }),
    vendor: str(body.vendor, { label: 'vendor', max: 80 }),
    model: str(body.model, { label: 'model', max: 120 }),
    serial: str(body.serial, { label: 'serial', max: 120 }),
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : '#2dd4bf',
    formFactor: str(body.formFactor, { label: 'form factor', max: 40 }) || 'usb-a',
    status: oneOf(body.status, STATUSES, 'active'),
    purchasedAt: str(body.purchasedAt, { label: 'purchase date', max: 40 }),
    notes: str(body.notes, { label: 'notes', max: 2000 }),
    image: IMAGE_RE.test(image) ? image : '',
  };
}

// A WebAuthn credential captured during "Scan key" — used later to prove
// physical possession before revealing the key's secret note.
function sanitizeCredential(body) {
  const c = body.credential;
  if (!c || typeof c !== 'object') return null;
  const id = typeof c.id === 'string' ? c.id : '';
  const publicKey = typeof c.publicKey === 'string' ? c.publicKey.replace(/\s+/g, '') : '';
  const alg = Number(c.alg);
  if (!id || !publicKey) return null;
  if (id.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  if (publicKey.length > 4000 || !/^[A-Za-z0-9+/=]+$/.test(publicKey)) return null;
  if (![-7, -257, -8].includes(alg)) return null;
  return { id, publicKeyPem: spkiToPem(publicKey), alg, prfEnabled: c.prfEnabled ? 1 : 0 };
}

// Client-side-encrypted note envelope: enc:v1:<salt>:<iv>:<ciphertext> (base64url).
const ENC_RE = /^enc:v1:[A-Za-z0-9_-]{16,88}:[A-Za-z0-9_-]{8,32}:[A-Za-z0-9_-]{8,1400}$/;

function spkiToPem(b64) {
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

// ---------- WebAuthn verification (shared by secret reveal and MFA login) ----------

function verifyClientData(raw, { type, challenge, hostname }) {
  let cd;
  try {
    cd = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ApiError(400, 'Malformed assertion');
  }
  if (cd.type !== type) throw new ApiError(403, 'Wrong ceremony type');
  if (cd.challenge !== challenge) throw new ApiError(403, 'Challenge mismatch');
  let originHost = '';
  try { originHost = new URL(cd.origin).hostname; } catch { /* rejected below */ }
  if (!originHost || originHost !== hostname) {
    throw new ApiError(403, `Origin mismatch — assertion came from "${originHost || '?'}", expected "${hostname}"`);
  }
  return cd;
}

// Full assertion check: client data (type/challenge/origin), rpIdHash,
// user-presence flag, and the signature against the stored public key.
function verifyAssertion(req, cred, challenge, body) {
  const clientDataRaw = Buffer.from(String(body.clientDataJSON || ''), 'base64url');
  verifyClientData(clientDataRaw, { type: 'webauthn.get', challenge, hostname: req.hostname });
  const authData = Buffer.from(String(body.authenticatorData || ''), 'base64url');
  const signature = Buffer.from(String(body.signature || ''), 'base64url');
  if (authData.length < 37 || signature.length === 0) throw new ApiError(400, 'Malformed assertion');
  const rpIdHash = crypto.createHash('sha256').update(req.hostname).digest();
  if (!rpIdHash.equals(authData.subarray(0, 32))) throw new ApiError(403, 'RP ID mismatch');
  if (!(authData[32] & 0x01)) throw new ApiError(403, 'User presence was not asserted');
  const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientDataRaw).digest()]);
  let ok = false;
  try {
    ok = crypto.verify(cred.alg === -8 ? null : 'sha256', signed, cred.publicKeyPem, signature);
  } catch {
    ok = false;
  }
  if (!ok) throw new ApiError(403, 'Signature check failed — that is not the paired key');
}

// One-time challenge store shared by all WebAuthn ceremonies.
const pendingChallenges = new Map(); // token -> { kind, userId, keyId?, challenge, expires }

function issueChallenge(kind, fields = {}) {
  if (pendingChallenges.size > 1000) {
    for (const [t, e] of pendingChallenges) if (e.expires < Date.now()) pendingChallenges.delete(t);
  }
  const token = crypto.randomBytes(16).toString('hex');
  const challenge = crypto.randomBytes(32).toString('base64url');
  pendingChallenges.set(token, { kind, challenge, expires: Date.now() + 2 * 60 * 1000, ...fields });
  return { token, challenge };
}

function consumeChallenge(token, kind) {
  const entry = pendingChallenges.get(String(token || ''));
  pendingChallenges.delete(String(token || ''));
  if (!entry || entry.kind !== kind || entry.expires < Date.now()) {
    throw new ApiError(400, 'Challenge expired — try again');
  }
  return entry;
}

// Returns the new secret value, or undefined for "leave unchanged".
// Accepts either a plaintext note (legacy / non-PRF pairings) or an
// end-to-end-encrypted envelope produced in the browser.
function secretUpdate(body) {
  if (body.clearSecret === true) return '';
  if (typeof body.secret === 'string' && body.secret.trim() !== '') {
    const s = body.secret.trim();
    if (s.startsWith('enc:')) {
      if (!ENC_RE.test(s)) throw new ApiError(400, 'Malformed encrypted note');
      return s;
    }
    if (s.length > 500) throw new ApiError(400, 'Secret note is too long');
    return s;
  }
  return undefined;
}

function sanitizeService(body) {
  return {
    name: str(body.name, { required: true, label: 'Service name', max: 120 }),
    url: str(body.url, { label: 'URL', max: 300 }),
    icon: str(body.icon, { label: 'icon', max: 80 }),
    notes: str(body.notes, { label: 'notes', max: 2000 }),
  };
}

function sanitizeRegistration(body) {
  const kind = oneOf(body.kind, KINDS, 'passkey');
  return {
    kind,
    account: str(body.account, { label: 'account', max: 200 }),
    totpApp: kind === 'totp' ? str(body.totpApp, { label: 'TOTP app', max: 120 }) : '',
    notes: str(body.notes, { label: 'notes', max: 2000 }),
    revoked: body.revoked ? 1 : 0,
  };
}

function sanitizeCatalogItem(body) {
  const type = body.type;
  if (!CATALOG_TYPES.includes(type)) throw new ApiError(400, 'Invalid catalog type');
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
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(aaguid)) extra.aaguid = aaguid;
    if (extraIn.nfc) extra.nfc = true;
  }
  return { type, value, extra };
}

function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid id');
  return n;
}

// ---------- row mappers ----------

const KEY_COLS = `id, name, vendor, model, serial, color,
  form_factor AS formFactor, status, purchased_at AS purchasedAt, notes, image,
  credential_id AS credentialId, verified_at AS verifiedAt, prf_enabled AS prfEnabled,
  CASE WHEN secret != '' THEN 1 ELSE 0 END AS hasSecret,
  CASE WHEN secret LIKE 'enc:v1:%' THEN 1 ELSE 0 END AS secretEncrypted,
  created_at AS createdAt`;

// Append-only per-key logbook (capped at 200 entries per key).
function logEvent(userId, keyId, kind, detail = '') {
  db.prepare('INSERT INTO events (user_id, key_id, kind, detail) VALUES (?, ?, ?, ?)')
    .run(userId, keyId, kind, String(detail).slice(0, 300));
  db.prepare('DELETE FROM events WHERE key_id = ? AND id NOT IN (SELECT id FROM events WHERE key_id = ? ORDER BY id DESC LIMIT 200)')
    .run(keyId, keyId);
}
const SERVICE_COLS = `id, name, url, icon, notes, created_at AS createdAt`;
const REG_COLS = `id, key_id AS keyId, service_id AS serviceId, kind, account,
  totp_app AS totpApp, notes, revoked, created_at AS createdAt`;
const CATALOG_COLS = `id, type, value, extra, created_at AS createdAt`;

function mapCatalogRow(row) {
  let extra = {};
  try { extra = JSON.parse(row.extra || '{}'); } catch { /* keep empty */ }
  return { ...row, extra };
}

function getKey(userId, id) {
  const row = db.prepare(`SELECT ${KEY_COLS} FROM keys WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Key not found');
  return row;
}

function getService(userId, id) {
  const row = db.prepare(`SELECT ${SERVICE_COLS} FROM services WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!row) throw new ApiError(404, 'Service not found');
  return row;
}

// ---------- status / auth ----------

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/status', (req, res) => {
  res.json({
    needsSetup: auth.userCount() === 0,
    authenticated: !!auth.sessionUser(req),
  });
});

function validateCredentials(body) {
  const username = str(body.username, { required: true, label: 'Username', max: 40 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ApiError(400, 'Username must be 3-40 characters: letters, numbers, dots, dashes, underscores');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (password.length > 200) throw new ApiError(400, 'Password is too long');
  return { username, password };
}

router.post('/setup', (req, res) => {
  if (auth.userCount() > 0) throw new ApiError(403, 'Setup has already been completed');
  const { username, password } = validateCredentials(req.body || {});
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(username, auth.hashPassword(password));
  auth.createSession(req, res, Number(info.lastInsertRowid));
  res.json({ ok: true });
});

const MFA_DISABLED = process.env.KEEYO_DISABLE_MFA === '1' || process.env.KEEYO_DISABLE_MFA === 'true';
const LOGIN_KEY_COLS = 'id, name, credential_id AS credentialId, alg, created_at AS createdAt';

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!auth.loginAllowed(ip)) throw new ApiError(429, 'Too many failed attempts. Try again in a few minutes.');
  const body = req.body || {};
  const username = str(body.username, { label: 'Username', max: 40 }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    auth.recordLoginFailure(ip);
    throw new ApiError(401, 'Wrong username or password');
  }

  // Second factor: if the account has sign-in security keys, require one.
  const loginKeys = MFA_DISABLED
    ? []
    : db.prepare('SELECT credential_id AS credentialId FROM login_credentials WHERE user_id = ?').all(user.id);
  if (loginKeys.length > 0) {
    const { token, challenge } = issueChallenge('mfa', { userId: user.id });
    res.json({ mfaRequired: true, mfaToken: token, challenge, credentialIds: loginKeys.map((k) => k.credentialId) });
    return;
  }

  auth.clearLoginFailures(ip);
  auth.createSession(req, res, user.id);
  res.json({ ok: true });
});

router.post('/login/mfa', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!auth.loginAllowed(ip)) throw new ApiError(429, 'Too many failed attempts. Try again in a few minutes.');
  const body = req.body || {};
  const entry = consumeChallenge(body.mfaToken, 'mfa');
  const cred = db.prepare('SELECT credential_id, public_key, alg FROM login_credentials WHERE user_id = ? AND credential_id = ?')
    .get(entry.userId, String(body.credentialId || ''));
  if (!cred) {
    auth.recordLoginFailure(ip);
    throw new ApiError(403, 'That security key is not enrolled for this account');
  }
  try {
    verifyAssertion(req, { publicKeyPem: cred.public_key, alg: cred.alg }, entry.challenge, body);
  } catch (err) {
    auth.recordLoginFailure(ip);
    throw err;
  }
  auth.clearLoginFailures(ip);
  auth.createSession(req, res, entry.userId);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// Everything below requires a signed-in user.
router.use(auth.requireAuth);

router.get('/me', (req, res) => res.json(req.user));

router.put('/me/password', (req, res) => {
  const body = req.body || {};
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (next.length < 8) throw new ApiError(400, 'New password must be at least 8 characters');
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(current, row.password_hash)) throw new ApiError(400, 'Current password is wrong');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(next), req.user.id);
  // Changing the password signs out every other session.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, auth.currentToken(req));
  res.json({ ok: true });
});

// ---------- sign-in security keys (MFA enrollment) ----------

router.get('/login-keys', (req, res) => {
  res.json(db.prepare(`SELECT ${LOGIN_KEY_COLS} FROM login_credentials WHERE user_id = ? ORDER BY id`).all(req.user.id));
});

router.post('/login-keys/challenge', (req, res) => {
  const { token, challenge } = issueChallenge('enroll', { userId: req.user.id });
  res.json({ token, challenge });
});

router.post('/login-keys', (req, res) => {
  const body = req.body || {};
  const entry = consumeChallenge(body.token, 'enroll');
  if (entry.userId !== req.user.id) throw new ApiError(403, 'Challenge belongs to another session');
  const name = str(body.name, { required: true, label: 'Key name', max: 80 });
  const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey.replace(/\s+/g, '') : '';
  const alg = Number(body.alg);
  if (!credentialId || credentialId.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(credentialId)) throw new ApiError(400, 'Invalid credential');
  if (!publicKey || publicKey.length > 4000 || !/^[A-Za-z0-9+/=]+$/.test(publicKey)) throw new ApiError(400, 'Invalid public key');
  if (![-7, -257, -8].includes(alg)) throw new ApiError(400, 'Unsupported key algorithm');
  const clientDataRaw = Buffer.from(String(body.clientDataJSON || ''), 'base64url');
  verifyClientData(clientDataRaw, { type: 'webauthn.create', challenge: entry.challenge, hostname: req.hostname });
  const dupe = db.prepare('SELECT id FROM login_credentials WHERE user_id = ? AND credential_id = ?').get(req.user.id, credentialId);
  if (dupe) throw new ApiError(400, 'That key is already enrolled');
  const count = db.prepare('SELECT COUNT(*) AS n FROM login_credentials WHERE user_id = ?').get(req.user.id).n;
  if (count >= 10) throw new ApiError(400, 'At most 10 sign-in keys per account');
  const info = db.prepare('INSERT INTO login_credentials (user_id, name, credential_id, public_key, alg) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, name, credentialId, spkiToPem(publicKey), alg);
  res.json(db.prepare(`SELECT ${LOGIN_KEY_COLS} FROM login_credentials WHERE id = ?`).get(Number(info.lastInsertRowid)));
});

router.delete('/login-keys/:id', (req, res) => {
  const id = intId(req.params.id);
  const row = db.prepare('SELECT id FROM login_credentials WHERE user_id = ? AND id = ?').get(req.user.id, id);
  if (!row) throw new ApiError(404, 'Sign-in key not found');
  db.prepare('DELETE FROM login_credentials WHERE user_id = ? AND id = ?').run(req.user.id, id);
  res.json({ ok: true });
});

// ---------- user management (admin) ----------

router.get('/users', auth.requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY id').all();
  res.json(rows.map((r) => ({ ...r, isAdmin: !!r.isAdmin })));
});

router.post('/users', auth.requireAdmin, (req, res) => {
  const body = req.body || {};
  const { username, password } = validateCredentials(body);
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new ApiError(400, 'That username is taken');
  db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, auth.hashPassword(password), body.isAdmin ? 1 : 0);
  res.json({ ok: true });
});

router.delete('/users/:id', auth.requireAdmin, (req, res) => {
  const id = intId(req.params.id);
  if (id === req.user.id) throw new ApiError(400, 'You cannot delete your own account');
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!target) throw new ApiError(404, 'User not found');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- data ----------

router.get('/data', (req, res) => {
  const uid = req.user.id;
  res.json({
    keys: db.prepare(`SELECT ${KEY_COLS} FROM keys WHERE user_id = ? ORDER BY created_at, id`).all(uid),
    services: db.prepare(`SELECT ${SERVICE_COLS} FROM services WHERE user_id = ? ORDER BY LOWER(name)`).all(uid),
    registrations: db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ? ORDER BY created_at, id`).all(uid),
    catalog: db.prepare(`SELECT ${CATALOG_COLS} FROM catalog_items WHERE user_id = ? ORDER BY created_at, id`).all(uid).map(mapCatalogRow),
    attachments: db.prepare(`SELECT ${ATTACH_COLS} FROM attachments WHERE user_id = ? ORDER BY created_at, id`).all(uid),
  });
});

// ---------- personal catalog (custom vendors, models, form factors, colors) ----------

router.post('/catalog', (req, res) => {
  const item = sanitizeCatalogItem(req.body || {});
  const rows = db.prepare(`SELECT ${CATALOG_COLS} FROM catalog_items WHERE user_id = ? AND type = ?`)
    .all(req.user.id, item.type);
  const dupe = rows.find((r) => {
    if (r.value.toLowerCase() !== item.value.toLowerCase()) return false;
    if (item.type !== 'model') return true;
    const extra = mapCatalogRow(r).extra;
    return (extra.vendor || '').toLowerCase() === (item.extra.vendor || '').toLowerCase();
  });
  if (dupe) {
    res.json(mapCatalogRow(dupe));
    return;
  }
  if (rows.length >= 500) throw new ApiError(400, 'Too many custom entries of this type');
  const info = db.prepare('INSERT INTO catalog_items (user_id, type, value, extra) VALUES (?, ?, ?, ?)')
    .run(req.user.id, item.type, item.value, JSON.stringify(item.extra));
  const row = db.prepare(`SELECT ${CATALOG_COLS} FROM catalog_items WHERE user_id = ? AND id = ?`)
    .get(req.user.id, Number(info.lastInsertRowid));
  res.json(mapCatalogRow(row));
});

router.delete('/catalog/:id', (req, res) => {
  const id = intId(req.params.id);
  const existing = db.prepare('SELECT id FROM catalog_items WHERE user_id = ? AND id = ?').get(req.user.id, id);
  if (!existing) throw new ApiError(404, 'Catalog entry not found');
  db.prepare('DELETE FROM catalog_items WHERE user_id = ? AND id = ?').run(req.user.id, id);
  res.json({ ok: true });
});

// ---------- device registry (live AAGUID lookups) ----------

router.get('/registry', (req, res) => res.json(mds.status()));

router.post('/registry/refresh', auth.requireAdmin, (req, res, next) => {
  mds.refresh()
    .then((s) => res.json(s))
    .catch((err) => next(new ApiError(502, err.message)));
});

router.get('/aaguid/:aaguid', (req, res) => {
  const id = String(req.params.aaguid || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new ApiError(400, 'Invalid AAGUID');
  }
  const hit = mds.lookup(id);
  res.json({ aaguid: id, found: !!hit, name: hit ? hit.name : '', icon: hit ? hit.icon : '' });
});

// ---------- keys ----------

router.post('/keys', (req, res) => {
  const body = req.body || {};
  const k = sanitizeKey(body);
  const cred = sanitizeCredential(body);
  const secret = secretUpdate(body);
  const info = db.prepare(`
    INSERT INTO keys (user_id, name, vendor, model, serial, color, form_factor, status, purchased_at, notes,
      image, credential_id, public_key, credential_alg, secret, prf_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, k.name, k.vendor, k.model, k.serial, k.color, k.formFactor, k.status, k.purchasedAt, k.notes,
    k.image, cred ? cred.id : '', cred ? cred.publicKeyPem : '', cred ? cred.alg : -7, secret || '', cred ? cred.prfEnabled : 0);
  const newId = Number(info.lastInsertRowid);
  logEvent(req.user.id, newId, 'created', `Registered — ${[k.vendor, k.model].filter(Boolean).join(' ') || 'unknown model'}${cred ? ' (paired)' : ''}`);
  if (secret) logEvent(req.user.id, newId, 'secret-set', 'Secret note stored');
  res.json(getKey(req.user.id, newId));
});

router.put('/keys/:id', (req, res) => {
  const id = intId(req.params.id);
  const before = getKey(req.user.id, id);
  const body = req.body || {};
  const k = sanitizeKey(body);
  db.prepare(`
    UPDATE keys SET name = ?, vendor = ?, model = ?, serial = ?, color = ?, form_factor = ?,
      status = ?, purchased_at = ?, notes = ?, image = ?
    WHERE user_id = ? AND id = ?
  `).run(k.name, k.vendor, k.model, k.serial, k.color, k.formFactor, k.status, k.purchasedAt, k.notes, k.image, req.user.id, id);
  const cred = sanitizeCredential(body);
  const secret = secretUpdate(body);
  if (cred) {
    // Re-pairing guard: swapping the credential while a secret note exists would
    // let a session holder "reveal" the note with their own key. The old secret
    // must be cleared or replaced in the same request (destroyed, never exposed).
    const row = db.prepare('SELECT credential_id, secret FROM keys WHERE user_id = ? AND id = ?').get(req.user.id, id);
    if (row.secret && row.credential_id && row.credential_id !== cred.id && secret === undefined) {
      throw new ApiError(403, 'This key holds a secret note bound to its current pairing — clear or replace the note to re-pair');
    }
    db.prepare('UPDATE keys SET credential_id = ?, public_key = ?, credential_alg = ?, prf_enabled = ? WHERE user_id = ? AND id = ?')
      .run(cred.id, cred.publicKeyPem, cred.alg, cred.prfEnabled, req.user.id, id);
    if (cred.id !== before.credentialId) logEvent(req.user.id, id, 'paired', `Paired with the physical key${cred.prfEnabled ? ' (encryption-capable)' : ''}`);
  }
  if (secret !== undefined) {
    db.prepare('UPDATE keys SET secret = ? WHERE user_id = ? AND id = ?').run(secret, req.user.id, id);
    logEvent(req.user.id, id, secret ? 'secret-set' : 'secret-cleared', secret ? 'Secret note stored' : 'Secret note cleared');
  }
  if (k.status !== before.status) {
    logEvent(req.user.id, id, 'status', `Status: ${before.status} → ${k.status}`);
  }
  res.json(getKey(req.user.id, id));
});

router.post('/keys/:id/verify', (req, res) => {
  const id = intId(req.params.id);
  getKey(req.user.id, id);
  db.prepare('UPDATE keys SET verified_at = ? WHERE user_id = ? AND id = ?')
    .run(new Date().toISOString(), req.user.id, id);
  logEvent(req.user.id, id, 'verified', 'Key tested and confirmed working');
  res.json(getKey(req.user.id, id));
});

router.get('/keys/:id/events', (req, res) => {
  const id = intId(req.params.id);
  getKey(req.user.id, id);
  res.json(db.prepare('SELECT id, kind, detail, created_at AS createdAt FROM events WHERE key_id = ? ORDER BY id DESC LIMIT 200').all(id));
});

// ---------- secret reveal (requires tapping the physical key) ----------

router.post('/keys/:id/reveal-challenge', (req, res) => {
  const id = intId(req.params.id);
  const key = db.prepare('SELECT credential_id, secret FROM keys WHERE user_id = ? AND id = ?').get(req.user.id, id);
  if (!key) throw new ApiError(404, 'Key not found');
  if (!key.credential_id) throw new ApiError(400, 'This key was not paired by scanning — no possession proof is available');
  if (!key.secret) throw new ApiError(400, 'No secret note is stored on this key');
  // Encrypted notes need the PRF salt during the assertion, so hand it out
  // with the challenge (the salt is not secret).
  let prfSalt = null;
  if (key.secret.startsWith('enc:v1:')) {
    const parts = key.secret.split(':');
    if (parts.length === 5) prfSalt = parts[2];
  }
  res.json({ ...issueChallenge('reveal', { userId: req.user.id, keyId: id }), encrypted: !!prfSalt, prfSalt });
});

router.post('/keys/:id/reveal', (req, res) => {
  const id = intId(req.params.id);
  const body = req.body || {};
  const entry = consumeChallenge(body.token, 'reveal');
  if (entry.userId !== req.user.id || entry.keyId !== id) throw new ApiError(400, 'Challenge expired — try again');
  const key = db.prepare('SELECT credential_id, public_key, credential_alg, secret FROM keys WHERE user_id = ? AND id = ?')
    .get(req.user.id, id);
  if (!key || !key.credential_id || !key.public_key) throw new ApiError(400, 'No paired credential on this key');
  if (String(body.credentialId || '') !== key.credential_id) throw new ApiError(403, 'That is not the paired key');
  verifyAssertion(req, { publicKeyPem: key.public_key, alg: key.credential_alg }, entry.challenge, body);
  res.json({ secret: key.secret });
});

// ---------- attachments ----------

const ATTACH_COLS = 'id, key_id AS keyId, name, mime, size, created_at AS createdAt';

router.post('/keys/:id/attachments', (req, res) => {
  const id = intId(req.params.id);
  getKey(req.user.id, id);
  const body = req.body || {};
  const name = str(body.name, { required: true, label: 'File name', max: 200 });
  const mime = str(body.mime, { label: 'file type', max: 100 }) || 'application/octet-stream';
  const count = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE key_id = ?').get(id).n;
  if (count >= 10) throw new ApiError(400, 'A key can hold at most 10 files');
  if (typeof body.data !== 'string' || !body.data) throw new ApiError(400, 'File content is missing');
  let buf;
  try { buf = Buffer.from(body.data, 'base64'); } catch { throw new ApiError(400, 'Invalid file content'); }
  if (buf.length === 0) throw new ApiError(400, 'File is empty');
  if (buf.length > 5 * 1024 * 1024) throw new ApiError(400, 'Files can be at most 5 MB');
  const info = db.prepare('INSERT INTO attachments (user_id, key_id, name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, id, name, mime, buf.length, buf);
  logEvent(req.user.id, id, 'attachment-added', name);
  const row = db.prepare(`SELECT ${ATTACH_COLS} FROM attachments WHERE id = ?`).get(Number(info.lastInsertRowid));
  res.json(row);
});

router.get('/attachments/:id', (req, res) => {
  const id = intId(req.params.id);
  const row = db.prepare('SELECT name, mime, data FROM attachments WHERE user_id = ? AND id = ?').get(req.user.id, id);
  if (!row) throw new ApiError(404, 'File not found');
  res.setHeader('Content-Type', row.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${row.name.replace(/["\\\r\n]/g, '_')}"`);
  res.send(Buffer.from(row.data));
});

router.delete('/attachments/:id', (req, res) => {
  const id = intId(req.params.id);
  const row = db.prepare('SELECT id, key_id AS keyId, name FROM attachments WHERE user_id = ? AND id = ?').get(req.user.id, id);
  if (!row) throw new ApiError(404, 'File not found');
  db.prepare('DELETE FROM attachments WHERE user_id = ? AND id = ?').run(req.user.id, id);
  logEvent(req.user.id, row.keyId, 'attachment-removed', row.name);
  res.json({ ok: true });
});

router.delete('/keys/:id', (req, res) => {
  const id = intId(req.params.id);
  getKey(req.user.id, id);
  db.prepare('DELETE FROM keys WHERE user_id = ? AND id = ?').run(req.user.id, id);
  res.json({ ok: true });
});

// ---------- services ----------

router.post('/services', (req, res) => {
  const s = sanitizeService(req.body || {});
  const info = db.prepare('INSERT INTO services (user_id, name, url, icon, notes) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, s.name, s.url, s.icon, s.notes);
  res.json(getService(req.user.id, Number(info.lastInsertRowid)));
});

router.put('/services/:id', (req, res) => {
  const id = intId(req.params.id);
  getService(req.user.id, id);
  const s = sanitizeService(req.body || {});
  db.prepare('UPDATE services SET name = ?, url = ?, icon = ?, notes = ? WHERE user_id = ? AND id = ?')
    .run(s.name, s.url, s.icon, s.notes, req.user.id, id);
  res.json(getService(req.user.id, id));
});

router.delete('/services/:id', (req, res) => {
  const id = intId(req.params.id);
  getService(req.user.id, id);
  db.prepare('DELETE FROM services WHERE user_id = ? AND id = ?').run(req.user.id, id);
  res.json({ ok: true });
});

// ---------- registrations ----------

router.post('/registrations', (req, res) => {
  const body = req.body || {};
  const keyId = intId(body.keyId);
  getKey(req.user.id, keyId);
  const r = sanitizeRegistration(body);

  const result = tx(() => {
    let serviceId;
    if (body.serviceId) {
      serviceId = intId(body.serviceId);
      getService(req.user.id, serviceId);
    } else if (body.service && typeof body.service === 'object') {
      const s = sanitizeService(body.service);
      const info = db.prepare('INSERT INTO services (user_id, name, url, icon, notes) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.id, s.name, s.url, s.icon, s.notes);
      serviceId = Number(info.lastInsertRowid);
    } else {
      throw new ApiError(400, 'A service is required');
    }
    const info = db.prepare(`
      INSERT INTO registrations (user_id, key_id, service_id, kind, account, totp_app, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, keyId, serviceId, r.kind, r.account, r.totpApp, r.notes);
    return Number(info.lastInsertRowid);
  });

  const row = db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ? AND id = ?`).get(req.user.id, result);
  const svc = getService(req.user.id, row.serviceId);
  logEvent(req.user.id, row.keyId, 'registration-added', `${svc.name} — ${KIND_LABELS[row.kind] || row.kind}`);
  res.json(row);
});

router.put('/registrations/:id', (req, res) => {
  const id = intId(req.params.id);
  const existing = db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ? AND id = ?`).get(req.user.id, id);
  if (!existing) throw new ApiError(404, 'Registration not found');
  const body = req.body || {};
  const r = sanitizeRegistration(body);
  let newKeyId = existing.keyId;
  if (body.keyId !== undefined && intId(body.keyId) !== existing.keyId) {
    newKeyId = intId(body.keyId);
    getKey(req.user.id, newKeyId);
  }
  db.prepare('UPDATE registrations SET key_id = ?, kind = ?, account = ?, totp_app = ?, notes = ?, revoked = ? WHERE user_id = ? AND id = ?')
    .run(newKeyId, r.kind, r.account, r.totpApp, r.notes, r.revoked, req.user.id, id);
  const svc = db.prepare('SELECT name FROM services WHERE user_id = ? AND id = ?').get(req.user.id, existing.serviceId);
  const svcName = svc ? svc.name : '(deleted service)';
  if (newKeyId !== existing.keyId) {
    logEvent(req.user.id, existing.keyId, 'registration-removed', `${svcName} — moved to another key`);
    logEvent(req.user.id, newKeyId, 'registration-added', `${svcName} — moved here`);
  }
  if (!!r.revoked !== !!existing.revoked) {
    logEvent(req.user.id, newKeyId, r.revoked ? 'revoked' : 'unrevoked', `${svcName} ${r.revoked ? 'revoked at the service' : 'marked active again'}`);
  }
  const row = db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ? AND id = ?`).get(req.user.id, id);
  res.json(row);
});

router.delete('/registrations/:id', (req, res) => {
  const id = intId(req.params.id);
  const existing = db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ? AND id = ?`).get(req.user.id, id);
  if (!existing) throw new ApiError(404, 'Registration not found');
  const svc = db.prepare('SELECT name FROM services WHERE user_id = ? AND id = ?').get(req.user.id, existing.serviceId);
  db.prepare('DELETE FROM registrations WHERE user_id = ? AND id = ?').run(req.user.id, id);
  logEvent(req.user.id, existing.keyId, 'registration-removed', svc ? svc.name : '(deleted service)');
  res.json({ ok: true });
});

// ---------- export / import ----------

router.get('/export', (req, res) => {
  const uid = req.user.id;
  const payload = {
    app: 'keeyo',
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: db.prepare(`SELECT ${KEY_COLS}, secret, public_key AS publicKeyPem, credential_alg AS credentialAlg FROM keys WHERE user_id = ?`).all(uid),
    services: db.prepare(`SELECT ${SERVICE_COLS} FROM services WHERE user_id = ?`).all(uid),
    registrations: db.prepare(`SELECT ${REG_COLS} FROM registrations WHERE user_id = ?`).all(uid),
    catalog: db.prepare(`SELECT ${CATALOG_COLS} FROM catalog_items WHERE user_id = ?`).all(uid).map(mapCatalogRow),
  };
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="keeyo-backup-${date}.json"`);
  res.json(payload);
});

router.post('/import', (req, res) => {
  const body = req.body || {};
  const data = body.data;
  if (!data || data.app !== 'keeyo' || !Array.isArray(data.keys) || !Array.isArray(data.services) || !Array.isArray(data.registrations)) {
    throw new ApiError(400, 'That does not look like a Keeyo backup file');
  }
  if (data.keys.length > 5000 || data.services.length > 20000 || data.registrations.length > 50000) {
    throw new ApiError(400, 'Backup file is too large');
  }
  const catalog = Array.isArray(data.catalog) ? data.catalog.slice(0, 2000) : [];
  const uid = req.user.id;

  tx(() => {
    db.prepare('DELETE FROM registrations WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM services WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM keys WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM catalog_items WHERE user_id = ?').run(uid);

    for (const raw of catalog) {
      let item;
      try { item = sanitizeCatalogItem(raw); } catch { continue; }
      db.prepare('INSERT INTO catalog_items (user_id, type, value, extra) VALUES (?, ?, ?, ?)')
        .run(uid, item.type, item.value, JSON.stringify(item.extra));
    }

    const keyIds = new Map();
    for (const raw of data.keys) {
      const k = sanitizeKey(raw);
      let secret = '';
      if (typeof raw.secret === 'string') {
        secret = raw.secret.startsWith('enc:') ? (ENC_RE.test(raw.secret) ? raw.secret : '') : raw.secret.slice(0, 500);
      }
      const credId = typeof raw.credentialId === 'string' && /^[A-Za-z0-9_-]{0,1024}$/.test(raw.credentialId) ? raw.credentialId : '';
      const pem = typeof raw.publicKeyPem === 'string' && raw.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----') && raw.publicKeyPem.length < 4200 ? raw.publicKeyPem : '';
      const alg = [-7, -257, -8].includes(Number(raw.credentialAlg)) ? Number(raw.credentialAlg) : -7;
      const verifiedAt = typeof raw.verifiedAt === 'string' ? raw.verifiedAt.slice(0, 40) : '';
      const info = db.prepare(`
        INSERT INTO keys (user_id, name, vendor, model, serial, color, form_factor, status, purchased_at, notes,
          image, credential_id, public_key, credential_alg, secret, verified_at, prf_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uid, k.name, k.vendor, k.model, k.serial, k.color, k.formFactor, k.status, k.purchasedAt, k.notes,
        k.image, credId, credId ? pem : '', alg, secret, verifiedAt, raw.prfEnabled ? 1 : 0);
      const newId = Number(info.lastInsertRowid);
      logEvent(uid, newId, 'created', 'Restored from backup import');
      keyIds.set(raw.id, newId);
    }

    const serviceIds = new Map();
    for (const raw of data.services) {
      const s = sanitizeService(raw);
      const info = db.prepare('INSERT INTO services (user_id, name, url, icon, notes) VALUES (?, ?, ?, ?, ?)')
        .run(uid, s.name, s.url, s.icon, s.notes);
      serviceIds.set(raw.id, Number(info.lastInsertRowid));
    }

    for (const raw of data.registrations) {
      const keyId = keyIds.get(raw.keyId);
      const serviceId = serviceIds.get(raw.serviceId);
      if (!keyId || !serviceId) continue;
      const r = sanitizeRegistration(raw);
      db.prepare(`
        INSERT INTO registrations (user_id, key_id, service_id, kind, account, totp_app, notes, revoked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uid, keyId, serviceId, r.kind, r.account, r.totpApp, r.notes, r.revoked);
    }
  });

  res.json({ ok: true });
});

module.exports = { router, ApiError };
