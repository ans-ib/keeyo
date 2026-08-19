'use strict';

// End-to-end API tests. Zero test dependencies: node:test + fetch against a
// real server instance on an ephemeral port, with a simulated WebAuthn
// authenticator (real P-256 keypairs and signatures).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'keeyo-test-'));
process.env.KEEYO_OFFLINE = '1';
delete process.env.TRUST_PROXY;
delete process.env.KEEYO_DISABLE_MFA;

const app = require('../server/index.js');

let server;
let base;
let cookie = '';
const HOSTNAME = '127.0.0.1';

test.before(() => new Promise((resolve) => {
  server = app.listen(0, HOSTNAME, () => {
    base = `http://${HOSTNAME}:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(pathname, { method, body, headers = {}, raw, noCookie } = {}) {
  const res = await fetch(base + '/api' + pathname, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(noCookie ? {} : { cookie }),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && !noCookie) cookie = setCookie.split(';')[0];
  if (raw) return res;
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ---- simulated WebAuthn authenticator ----

function makeAuthenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    credentialId: crypto.randomBytes(32).toString('base64url'),
    spkiB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey,
  };
}

function authDataFor(hostname, { up = true } = {}) {
  const rpIdHash = crypto.createHash('sha256').update(hostname).digest();
  return Buffer.concat([rpIdHash, Buffer.from([up ? 0x01 : 0x00]), Buffer.alloc(4)]);
}

function signAssertion(authr, challenge, { up = true, origin = null, wrongKey = false } = {}) {
  const clientData = Buffer.from(JSON.stringify({
    type: 'webauthn.get',
    challenge,
    origin: origin || base,
  }));
  const authData = authDataFor(HOSTNAME, { up });
  const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]);
  const key = wrongKey ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : authr.privateKey;
  return {
    credentialId: authr.credentialId,
    clientDataJSON: clientData.toString('base64url'),
    authenticatorData: authData.toString('base64url'),
    signature: crypto.sign('sha256', signed, key).toString('base64url'),
  };
}

function creationClientData(challenge, origin = null) {
  return Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: origin || base }))
    .toString('base64url');
}

// ---- tests ----

test('security headers are set', async () => {
  const res = await fetch(base + '/');
  assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('first-run setup creates the admin and signs in', async () => {
  const s = await call('/status');
  assert.equal(s.data.needsSetup, true);
  const r = await call('/setup', { body: { username: 'admin', password: 'testpass123' } });
  assert.equal(r.status, 200);
  const me = await call('/me');
  assert.equal(me.data.username, 'admin');
  assert.equal(me.data.isAdmin, true);
});

test('unauthenticated access is refused', async () => {
  const r = await call('/data', { noCookie: true });
  assert.equal(r.status, 401);
});

let keyAuthr;
let keyId;

test('key with pairing, secret and image', async () => {
  keyAuthr = makeAuthenticator();
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const r = await call('/keys', {
    body: {
      name: 'Test key', vendor: 'Yubico', model: 'YubiKey 5C NFC', formFactor: 'usb-c', color: '#60a5fa',
      image: tinyPng,
      credential: { id: keyAuthr.credentialId, publicKey: keyAuthr.spkiB64, alg: -7 },
      secret: 'PIN 4711',
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.hasSecret, 1);
  assert.equal(r.data.image, tinyPng);
  assert.equal(r.data.secret, undefined, 'secret must never appear in key rows');
  keyId = r.data.id;
});

test('reveal requires a valid signed assertion', async () => {
  const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
  assert.equal(ch.status, 200);
  const ok = await call(`/keys/${keyId}/reveal`, {
    method: 'POST',
    body: { token: ch.data.token, ...signAssertion(keyAuthr, ch.data.challenge) },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.secret, 'PIN 4711');
});

test('reveal refuses forged signature, missing user presence, wrong origin, reused token', async () => {
  for (const opts of [{ wrongKey: true }, { up: false }, { origin: 'https://evil.example' }]) {
    const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
    const r = await call(`/keys/${keyId}/reveal`, {
      method: 'POST',
      body: { token: ch.data.token, ...signAssertion(keyAuthr, ch.data.challenge, opts) },
    });
    assert.equal(r.status, 403, `should refuse ${JSON.stringify(opts)}`);
  }
  const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
  await call(`/keys/${keyId}/reveal`, { method: 'POST', body: { token: ch.data.token, ...signAssertion(keyAuthr, ch.data.challenge) } });
  const reuse = await call(`/keys/${keyId}/reveal`, { method: 'POST', body: { token: ch.data.token, ...signAssertion(keyAuthr, ch.data.challenge) } });
  assert.equal(reuse.status, 400, 'challenge tokens are single-use');
});

test('re-pairing is blocked while a secret exists, allowed when cleared', async () => {
  const attacker = makeAuthenticator();
  const keyBody = { name: 'Test key', vendor: 'Yubico', model: 'YubiKey 5C NFC', formFactor: 'usb-c', color: '#60a5fa' };
  const blocked = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...keyBody, credential: { id: attacker.credentialId, publicKey: attacker.spkiB64, alg: -7 } },
  });
  assert.equal(blocked.status, 403, 'credential swap with live secret must be refused');

  const allowed = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...keyBody, clearSecret: true, credential: { id: attacker.credentialId, publicKey: attacker.spkiB64, alg: -7 } },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.hasSecret, 0, 'old secret destroyed, never exposed');
  // restore original pairing + secret for later tests
  const restore = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...keyBody, secret: 'PIN 4711', credential: { id: keyAuthr.credentialId, publicKey: keyAuthr.spkiB64, alg: -7 } },
  });
  assert.equal(restore.status, 200);
});

test('registrations support the revoked flag', async () => {
  const reg = await call('/registrations', {
    body: { keyId, service: { name: 'GitHub', url: 'github.com' }, kind: 'passkey', account: 'me' },
  });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.revoked, 0);
  const upd = await call(`/registrations/${reg.data.id}`, { method: 'PUT', body: { ...reg.data, revoked: true } });
  assert.equal(upd.data.revoked, 1);
});

test('attachments round-trip and are size-capped', async () => {
  const content = Buffer.from('receipt data');
  const up = await call(`/keys/${keyId}/attachments`, {
    body: { name: 'receipt.txt', mime: 'text/plain', data: content.toString('base64') },
  });
  assert.equal(up.status, 200);
  const dl = await call(`/attachments/${up.data.id}`, { raw: true });
  assert.equal(dl.status, 200);
  assert.ok(Buffer.from(await dl.arrayBuffer()).equals(content));
  assert.match(dl.headers.get('content-disposition'), /attachment/);
});

test('export/import round-trips keys, secrets, pairing and revoked flags', async () => {
  const exp = await call('/export');
  assert.equal(exp.data.keys[0].secret, 'PIN 4711');
  const imp = await call('/import', { body: { data: exp.data } });
  assert.equal(imp.status, 200);
  const d = await call('/data');
  assert.equal(d.data.keys[0].hasSecret, 1);
  assert.equal(d.data.registrations[0].revoked, 1);
  keyId = d.data.keys[0].id;
});

test('verify endpoint stamps the key and the logbook records everything', async () => {
  const v = await call(`/keys/${keyId}/verify`, { method: 'POST', body: {} });
  assert.equal(v.status, 200);
  assert.ok(v.data.verifiedAt, 'verifiedAt is set');
  const ev = await call(`/keys/${keyId}/events`);
  assert.equal(ev.status, 200);
  const kinds = ev.data.map((e) => e.kind);
  assert.ok(kinds.includes('verified'), 'verified event logged');
  assert.ok(kinds.includes('created'), 'creation event logged');
});

test('registrations can be moved between keys', async () => {
  const k2 = await call('/keys', { body: { name: 'Second key', vendor: 'Token2', formFactor: 'usb-a', color: '#4ade80' } });
  const d = await call('/data');
  const reg = d.data.registrations[0];
  const moved = await call(`/registrations/${reg.id}`, { method: 'PUT', body: { ...reg, keyId: k2.data.id } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.keyId, k2.data.id);
  const evNew = await call(`/keys/${k2.data.id}/events`);
  assert.ok(evNew.data.some((e) => e.kind === 'registration-added'), 'move logged on the new key');
  // move it back
  await call(`/registrations/${reg.id}`, { method: 'PUT', body: { ...reg, keyId } });
});

let mfaAuthr;

test('MFA: enroll a sign-in key with verified creation ceremony', async () => {
  mfaAuthr = makeAuthenticator();
  const ch = await call('/login-keys/challenge', { method: 'POST', body: {} });
  assert.equal(ch.status, 200);

  const badOrigin = await call('/login-keys', {
    body: {
      token: ch.data.token, name: 'x', credentialId: mfaAuthr.credentialId,
      publicKey: mfaAuthr.spkiB64, alg: -7,
      clientDataJSON: creationClientData(ch.data.challenge, 'https://evil.example'),
    },
  });
  assert.equal(badOrigin.status, 403, 'enrollment from a foreign origin must be refused');

  const ch2 = await call('/login-keys/challenge', { method: 'POST', body: {} });
  const ok = await call('/login-keys', {
    body: {
      token: ch2.data.token, name: 'Test MFA key', credentialId: mfaAuthr.credentialId,
      publicKey: mfaAuthr.spkiB64, alg: -7,
      clientDataJSON: creationClientData(ch2.data.challenge),
    },
  });
  assert.equal(ok.status, 200);
});

test('MFA: login requires password AND the enrolled key', async () => {
  await call('/logout', { method: 'POST', body: {} });
  cookie = '';

  const step1 = await call('/login', { body: { username: 'admin', password: 'testpass123' } });
  assert.equal(step1.data.mfaRequired, true, 'password alone must not create a session');
  assert.equal((await call('/data')).status, 401, 'no session before second factor');

  const forged = await call('/login/mfa', {
    body: { mfaToken: step1.data.mfaToken, ...signAssertion(mfaAuthr, step1.data.challenge, { wrongKey: true }) },
  });
  assert.equal(forged.status, 403);

  const step1b = await call('/login', { body: { username: 'admin', password: 'testpass123' } });
  const ok = await call('/login/mfa', {
    body: { mfaToken: step1b.data.mfaToken, ...signAssertion(mfaAuthr, step1b.data.challenge) },
  });
  assert.equal(ok.status, 200);
  assert.equal((await call('/me')).data.username, 'admin');
});

test('password change signs out other sessions', async () => {
  const otherLoginStep1 = await call('/login', { body: { username: 'admin', password: 'testpass123' }, noCookie: true });
  // complete a second session
  const res = await fetch(base + '/api/login/mfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken: otherLoginStep1.data.mfaToken, ...signAssertion(mfaAuthr, otherLoginStep1.data.challenge) }),
  });
  const otherCookie = (res.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(otherCookie, 'second session established');

  const pw = await call('/me/password', { method: 'PUT', body: { current: 'testpass123', next: 'testpass456' } });
  assert.equal(pw.status, 200);
  const other = await fetch(base + '/api/me', { headers: { cookie: otherCookie } });
  assert.equal(other.status, 401, 'other session must be signed out');
  assert.equal((await call('/me')).status, 200, 'current session survives');
});

test('rate limiter cannot be bypassed by spoofing X-Forwarded-For', async () => {
  let status = 0;
  for (let i = 0; i < 11; i++) {
    const r = await call('/login', {
      body: { username: 'admin', password: 'wrong-password' },
      headers: { 'X-Forwarded-For': `10.0.0.${i}` },
      noCookie: true,
    });
    status = r.status;
  }
  assert.equal(status, 429, 'spoofed XFF must not evade the limiter when TRUST_PROXY is unset');
});
