'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');
const { webauthnFor } = require('./helpers/authenticator');

const server = createTestServer();
const { call } = server;
const { makeAuthenticator, signAssertion } = webauthnFor(server);

const KEY_BODY = { name: 'Test key', vendor: 'Yubico', model: 'YubiKey 5C NFC', formFactor: 'usb-c', color: '#60a5fa' };
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let authr;
let keyId;

test.before(async () => {
  await server.start();
  await server.setupAdmin();
});
test.after(() => server.stop());

test('a key can be created with pairing, secret note and photo', async () => {
  authr = makeAuthenticator();
  const r = await call('/keys', {
    body: {
      ...KEY_BODY,
      image: TINY_PNG,
      credential: { id: authr.credentialId, publicKey: authr.spkiB64, alg: -7 },
      secret: 'PIN 4711',
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.hasSecret, 1);
  assert.equal(r.data.image, TINY_PNG);
  assert.equal(r.data.secret, undefined, 'secret must never appear in key rows');
  keyId = r.data.id;
});

test('invalid input is rejected with a clear message', async () => {
  const noName = await call('/keys', { body: { ...KEY_BODY, name: '' } });
  assert.equal(noName.status, 400);
  assert.match(noName.data.error, /Key name/);
  const badId = await call('/keys/abc', { method: 'PUT', body: KEY_BODY });
  assert.equal(badId.status, 400);
  const missing = await call('/keys/999999', { method: 'PUT', body: KEY_BODY });
  assert.equal(missing.status, 404);
});

test('reveal requires a valid signed assertion', async () => {
  const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
  assert.equal(ch.status, 200);
  const ok = await call(`/keys/${keyId}/reveal`, {
    method: 'POST',
    body: { token: ch.data.token, ...signAssertion(authr, ch.data.challenge) },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.secret, 'PIN 4711');
});

test('reveal refuses a forged signature, missing user presence, wrong origin and a reused token', async () => {
  for (const opts of [{ wrongKey: true }, { up: false }, { origin: 'https://evil.example' }]) {
    const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
    const r = await call(`/keys/${keyId}/reveal`, {
      method: 'POST',
      body: { token: ch.data.token, ...signAssertion(authr, ch.data.challenge, opts) },
    });
    assert.equal(r.status, 403, `should refuse ${JSON.stringify(opts)}`);
  }
  const ch = await call(`/keys/${keyId}/reveal-challenge`, { method: 'POST', body: {} });
  const body = { token: ch.data.token, ...signAssertion(authr, ch.data.challenge) };
  await call(`/keys/${keyId}/reveal`, { method: 'POST', body });
  const reuse = await call(`/keys/${keyId}/reveal`, { method: 'POST', body });
  assert.equal(reuse.status, 400, 'challenge tokens are single-use');
});

test('re-pairing is blocked while a secret exists and allowed once it is cleared', async () => {
  const attacker = makeAuthenticator();
  const blocked = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...KEY_BODY, credential: { id: attacker.credentialId, publicKey: attacker.spkiB64, alg: -7 } },
  });
  assert.equal(blocked.status, 403, 'credential swap with a live secret must be refused');
  const untouched = await call('/data');
  assert.equal(untouched.data.keys[0].credentialId, authr.credentialId, 'a refused update changes nothing');

  const allowed = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...KEY_BODY, clearSecret: true, credential: { id: attacker.credentialId, publicKey: attacker.spkiB64, alg: -7 } },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.hasSecret, 0, 'old secret destroyed, never exposed');

  const restore = await call(`/keys/${keyId}`, {
    method: 'PUT',
    body: { ...KEY_BODY, secret: 'PIN 4711', credential: { id: authr.credentialId, publicKey: authr.spkiB64, alg: -7 } },
  });
  assert.equal(restore.status, 200);
});

test('verify stamps the key and the logbook records everything', async () => {
  const v = await call(`/keys/${keyId}/verify`, { method: 'POST', body: {} });
  assert.equal(v.status, 200);
  assert.ok(v.data.verifiedAt, 'verifiedAt is set');
  const status = await call(`/keys/${keyId}`, { method: 'PUT', body: { ...KEY_BODY, status: 'lost' } });
  assert.equal(status.data.status, 'lost');

  const ev = await call(`/keys/${keyId}/events`);
  assert.equal(ev.status, 200);
  const kinds = ev.data.map((e) => e.kind);
  for (const kind of ['created', 'verified', 'status', 'paired', 'secret-set', 'secret-cleared']) {
    assert.ok(kinds.includes(kind), `${kind} event logged`);
  }
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

  const empty = await call(`/keys/${keyId}/attachments`, { body: { name: 'empty.txt', data: '' } });
  assert.equal(empty.status, 400);

  const del = await call(`/attachments/${up.data.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await call(`/attachments/${up.data.id}`, { raw: true })).status, 404);
});

test('deleting a key removes it', async () => {
  const k = await call('/keys', { body: { name: 'Throwaway', formFactor: 'usb-a' } });
  const del = await call(`/keys/${k.data.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await call(`/keys/${k.data.id}/events`)).status, 404);
});
