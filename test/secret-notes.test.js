'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestServer } = require('./helpers/server');
const { webauthnFor } = require('./helpers/authenticator');

const server = createTestServer();
const { call } = server;
const { makeAuthenticator, signAssertion } = webauthnFor(server);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function encryptNoteLikeClient(plaintext, prfOutput, saltBytes) {
  const hkdf = await crypto.webcrypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  const key = await crypto.webcrypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: new TextEncoder().encode('keeyo-secret-note-v1') },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  return { envelope: `enc:v1:${b64url(saltBytes)}:${b64url(iv)}:${b64url(ct)}`, key };
}

test.before(async () => {
  await server.start();
  await server.setupAdmin();
});
test.after(() => server.stop());

test('the client recipe round-trips', async () => {
  const prfOutput = crypto.webcrypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.webcrypto.getRandomValues(new Uint8Array(32));
  const { envelope, key } = await encryptNoteLikeClient('PIN 314159', prfOutput, salt);
  const parts = envelope.split(':');
  assert.equal(parts.length, 5);
  const plain = await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(parts[3], 'base64url') }, key, Buffer.from(parts[4], 'base64url'));
  assert.equal(new TextDecoder().decode(plain), 'PIN 314159');
});

test('the server stores envelopes opaquely and hands out the PRF salt', async () => {
  const authr = makeAuthenticator();
  const prfOutput = crypto.webcrypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.webcrypto.getRandomValues(new Uint8Array(32));
  const { envelope } = await encryptNoteLikeClient('PIN 2718', prfOutput, salt);

  const k = await call('/keys', {
    body: {
      name: 'PRF key', vendor: 'Yubico', model: 'YubiKey 5C NFC', formFactor: 'usb-c', color: '#a78bfa',
      credential: { id: authr.credentialId, publicKey: authr.spkiB64, alg: -7, prfEnabled: true },
      secret: envelope,
    },
  });
  assert.equal(k.status, 200);
  assert.equal(k.data.prfEnabled, 1, 'prf capability stored');
  assert.equal(k.data.secretEncrypted, 1, 'envelope recognized as encrypted');

  const ch = await call(`/keys/${k.data.id}/reveal-challenge`, { method: 'POST', body: {} });
  assert.equal(ch.data.encrypted, true);
  assert.equal(ch.data.prfSalt, b64url(salt), 'challenge carries the PRF salt');

  const rev = await call(`/keys/${k.data.id}/reveal`, {
    method: 'POST',
    body: { token: ch.data.token, ...signAssertion(authr, ch.data.challenge) },
  });
  assert.equal(rev.status, 200);
  assert.equal(rev.data.secret, envelope, 'server returns ciphertext only');

  const bad = await call(`/keys/${k.data.id}`, {
    method: 'PUT',
    body: { name: 'PRF key', vendor: 'Yubico', model: 'YubiKey 5C NFC', formFactor: 'usb-c', color: '#a78bfa', secret: 'enc:v1:x' },
  });
  assert.equal(bad.status, 400);

  const exp = await call('/export');
  const imp = await call('/import', { body: { data: exp.data } });
  assert.equal(imp.status, 200);
  const restored = (await call('/data')).data.keys.find((x) => x.name === 'PRF key');
  assert.equal(restored.secretEncrypted, 1);
  assert.equal(restored.prfEnabled, 1);
});

test('reveal is refused for keys without a pairing or without a note', async () => {
  const plain = await call('/keys', { body: { name: 'Unpaired', formFactor: 'usb-a', secret: 'PIN 1' } });
  const noPair = await call(`/keys/${plain.data.id}/reveal-challenge`, { method: 'POST', body: {} });
  assert.equal(noPair.status, 400);

  const authr = makeAuthenticator();
  const paired = await call('/keys', {
    body: { name: 'No note', formFactor: 'usb-a', credential: { id: authr.credentialId, publicKey: authr.spkiB64, alg: -7 } },
  });
  const noNote = await call(`/keys/${paired.data.id}/reveal-challenge`, { method: 'POST', body: {} });
  assert.equal(noNote.status, 400);
});
