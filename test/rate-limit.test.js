'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

test.before(async () => {
  await server.start();
  await server.setupAdmin();
  await server.signOut();
});
test.after(() => server.stop());

test('the login limiter cannot be bypassed by spoofing X-Forwarded-For', async () => {
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

  const locked = await call('/login', { body: { username: 'admin', password: 'testpass123' }, noCookie: true });
  assert.equal(locked.status, 429, 'even the right password waits for the window to pass');
});
