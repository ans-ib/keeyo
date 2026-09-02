'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');
const { makeAuthenticator } = require('./helpers/authenticator');

const server = createTestServer();
const { call } = server;

test.before(async () => {
  await server.start();
  await server.setupAdmin();
});
test.after(() => server.stop());

test('export/import round-trips keys, secrets, pairing, catalog and revoked flags', async () => {
  const authr = makeAuthenticator();
  const key = await call('/keys', {
    body: {
      name: 'Backed up', vendor: 'Yubico', model: 'YubiKey 5C', formFactor: 'usb-c',
      credential: { id: authr.credentialId, publicKey: authr.spkiB64, alg: -7 },
      secret: 'PIN 4711',
    },
  });
  const reg = await call('/registrations', { body: { keyId: key.data.id, service: { name: 'GitHub' }, kind: 'passkey' } });
  await call(`/registrations/${reg.data.id}`, { method: 'PUT', body: { ...reg.data, revoked: true } });
  await call('/catalog', { body: { type: 'vendor', value: 'HyperFIDO' } });

  const exp = await call('/export', { raw: true });
  assert.match(exp.headers.get('content-disposition'), /keeyo-backup-/);
  const payload = await exp.json();
  assert.equal(payload.app, 'keeyo');
  assert.equal(payload.keys[0].secret, 'PIN 4711');
  assert.equal(payload.keys[0].credentialId, authr.credentialId);

  const imp = await call('/import', { body: { data: payload } });
  assert.equal(imp.status, 200);
  const d = await call('/data');
  assert.equal(d.data.keys.length, 1);
  assert.equal(d.data.keys[0].hasSecret, 1);
  assert.equal(d.data.keys[0].credentialId, authr.credentialId, 'pairing survives import');
  assert.ok(d.data.registrations.some((r) => r.revoked === 1), 'revoked flag survives import');
  assert.ok(d.data.catalog.some((c) => c.value === 'HyperFIDO'), 'catalog survives import');
  assert.notEqual(d.data.keys[0].id, key.data.id, 'imported rows get fresh ids');
});

test('a file that is not a Keeyo backup is refused', async () => {
  const r = await call('/import', { body: { data: { app: 'other' } } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Keeyo backup/);
});
