'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` }, noCookie: true });

let readToken;
let writeToken;

test.before(async () => {
  await server.start();
  await server.setupAdmin();
  await call('/keys', { body: { name: 'Seed key', formFactor: 'usb-a' } });
});
test.after(() => server.stop());

test('tokens are created with a one-time secret and listed without it', async () => {
  const created = await call('/tokens', { body: { name: 'CI export', scope: 'read', expiresInDays: 30 } });
  assert.equal(created.status, 200);
  assert.match(created.data.token, /^keeyo_[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.data.scope, 'read');
  assert.ok(created.data.expiresAt, 'expiry stored');
  readToken = created.data;

  const rw = await call('/tokens', { body: { name: 'Home automation', scope: 'write' } });
  assert.equal(rw.status, 200);
  assert.equal(rw.data.expiresAt, '', 'no expiry by default');
  writeToken = rw.data;

  const list = await call('/tokens');
  assert.equal(list.data.length, 2);
  assert.equal(list.data[0].token, undefined, 'the secret is never listed');
  assert.equal(list.data[0].prefix, readToken.token.slice(0, 12));

  const bad = await call('/tokens', { body: { name: '', scope: 'read' } });
  assert.equal(bad.status, 400);
  const badExpiry = await call('/tokens', { body: { name: 'x', expiresInDays: 7 } });
  assert.equal(badExpiry.status, 400);
});

test('a bearer token authenticates API calls and records last use', async () => {
  const me = await call('/me', bearer(readToken.token));
  assert.equal(me.status, 200);
  assert.equal(me.data.username, 'admin');
  assert.equal(me.data.token.scope, 'read');

  const data = await call('/data', bearer(readToken.token));
  assert.equal(data.status, 200);
  assert.equal(data.data.keys.length, 1);

  const list = await call('/tokens');
  const used = list.data.find((t) => t.id === readToken.id);
  assert.ok(used.lastUsedAt, 'last use is recorded');
});

test('read-only tokens cannot write; write tokens can', async () => {
  const blocked = await call('/keys', { body: { name: 'Nope', formFactor: 'usb-a' }, ...bearer(readToken.token) });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.error, /read-only/);

  const ok = await call('/keys', { body: { name: 'Via token', formFactor: 'usb-c' }, ...bearer(writeToken.token) });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.name, 'Via token');
});

test('tokens can never manage the account, other tokens, or admin settings', async () => {
  for (const [path, opts] of [
    ['/tokens', {}],
    ['/tokens', { body: { name: 'escalate' } }],
    ['/account/mfa', {}],
    ['/login-keys', {}],
    ['/me/password', { method: 'PUT', body: { current: 'x', next: 'testpass456' } }],
    ['/me/email', { method: 'PUT', body: { email: 'a@b.c' } }],
    ['/users', {}],
    ['/admin/sso', {}],
  ]) {
    const r = await call(path, { ...opts, ...bearer(writeToken.token) });
    assert.equal(r.status, 403, `${opts.method || (opts.body ? 'POST' : 'GET')} ${path} must be session-only`);
  }
});

test('invalid, revoked and expired tokens are refused', async () => {
  const garbage = await call('/data', bearer('keeyo_not-a-real-token'));
  assert.equal(garbage.status, 401);
  const wrongScheme = await call('/data', { headers: { Authorization: `Basic ${readToken.token}` }, noCookie: true });
  assert.equal(wrongScheme.status, 401);

  const revoke = await call(`/tokens/${readToken.id}`, { method: 'DELETE' });
  assert.equal(revoke.status, 200);
  const after = await call('/data', bearer(readToken.token));
  assert.equal(after.status, 401, 'a revoked token stops working immediately');
  assert.equal((await call(`/tokens/${readToken.id}`, { method: 'DELETE' })).status, 404);

  const expired = await call('/tokens', { body: { name: 'short', expiresInDays: 30 } });
  const { db } = require('../server/db');
  db.prepare("UPDATE access_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(expired.data.id);
  const stale = await call('/data', bearer(expired.data.token));
  assert.equal(stale.status, 401, 'an expired token is refused');
});

test('tokens are capped per account', async () => {
  const existing = (await call('/tokens')).data.length;
  for (let i = existing; i < 20; i++) {
    const r = await call('/tokens', { body: { name: `bulk ${i}` } });
    assert.equal(r.status, 200);
  }
  const over = await call('/tokens', { body: { name: 'one too many' } });
  assert.equal(over.status, 400);
});
