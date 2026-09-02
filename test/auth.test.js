'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

test.before(() => server.start());
test.after(() => server.stop());

test('security headers are set', async () => {
  const res = await fetch(server.base + '/');
  assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('first-run setup creates the admin and signs in', async () => {
  const s = await call('/status');
  assert.equal(s.data.needsSetup, true);
  await server.setupAdmin();
  const me = await call('/me');
  assert.equal(me.data.username, 'admin');
  assert.equal(me.data.isAdmin, true);
});

test('setup cannot run twice', async () => {
  const r = await call('/setup', { body: { username: 'again', password: 'testpass123' } });
  assert.equal(r.status, 403);
});

test('unauthenticated access is refused', async () => {
  const r = await call('/data', { noCookie: true });
  assert.equal(r.status, 401);
});

test('cross-site writes are refused', async () => {
  const r = await call('/keys', { body: { name: 'x' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(r.status, 403);
});

test('wrong password is refused', async () => {
  const r = await call('/login', { body: { username: 'admin', password: 'nope-nope' }, noCookie: true });
  assert.equal(r.status, 401);
});

test('password change signs out other sessions', async () => {
  const other = await call('/login', { body: { username: 'admin', password: 'testpass123' }, noCookie: true, raw: true });
  const otherCookie = (other.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(otherCookie.startsWith('keeyo_session='), 'second session established');

  const wrong = await call('/me/password', { method: 'PUT', body: { current: 'bad', next: 'testpass456' } });
  assert.equal(wrong.status, 400);
  const pw = await call('/me/password', { method: 'PUT', body: { current: 'testpass123', next: 'testpass456' } });
  assert.equal(pw.status, 200);

  const otherMe = await fetch(server.base + '/api/me', { headers: { cookie: otherCookie } });
  assert.equal(otherMe.status, 401, 'other session must be signed out');
  assert.equal((await call('/me')).status, 200, 'current session survives');
});

test('admins manage users; a user cannot delete their own account', async () => {
  const created = await call('/users', { body: { username: 'reader', password: 'readerpass1', isAdmin: false } });
  assert.equal(created.status, 200);
  const dupe = await call('/users', { body: { username: 'reader', password: 'readerpass1' } });
  assert.equal(dupe.status, 400);

  const list = await call('/users');
  const reader = list.data.find((u) => u.username === 'reader');
  assert.ok(reader);
  assert.equal(reader.isAdmin, false);

  const me = await call('/me');
  const self = await call(`/users/${me.data.id}`, { method: 'DELETE' });
  assert.equal(self.status, 400);

  const gone = await call(`/users/${reader.id}`, { method: 'DELETE' });
  assert.equal(gone.status, 200);
});

test('non-admins are kept out of admin endpoints', async () => {
  await call('/users', { body: { username: 'plain', password: 'plainpass1', isAdmin: false } });
  const adminCookie = server.cookie;
  server.cookie = '';
  const login = await call('/login', { body: { username: 'plain', password: 'plainpass1' } });
  assert.equal(login.status, 200);
  assert.equal((await call('/users')).status, 403);
  assert.equal((await call('/admin/sso')).status, 403);
  server.cookie = adminCookie;
});

test('profile edits rename the account and validate the email', async () => {
  const bad = await call('/me/profile', { method: 'PUT', body: { username: 'x' } });
  assert.equal(bad.status, 400);
  const badEmail = await call('/me/profile', { method: 'PUT', body: { email: 'not-an-email' } });
  assert.equal(badEmail.status, 400);
  const r = await call('/me/profile', { method: 'PUT', body: { username: 'Admin2', email: 'admin@example.com' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.username, 'admin2');
  const me = await call('/me');
  assert.equal(me.data.username, 'admin2');
  assert.equal(me.data.email, 'admin@example.com');
  assert.equal(me.data.sso, false);
  const back = await call('/me/profile', { method: 'PUT', body: { username: 'admin', email: '' } });
  assert.equal(back.status, 200);
  assert.equal((await call('/me')).data.email, '');
});

test('the only administrator cannot delete their account while members remain', async () => {
  const wrongPassword = await call('/me', { method: 'DELETE', body: { password: 'nope-nope' } });
  assert.equal(wrongPassword.status, 400);
  const blocked = await call('/me', { method: 'DELETE', body: { password: 'testpass456' } });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /administrator/);
  assert.equal((await call('/me')).status, 200, 'the account still exists');
});

test('a member can delete their own account', async () => {
  const login = await call('/login', { body: { username: 'plain', password: 'plainpass1' }, noCookie: true, raw: true });
  const memberCookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const res = await fetch(server.base + '/api/me', {
    method: 'DELETE',
    headers: { cookie: memberCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'plainpass1' }),
  });
  assert.equal(res.status, 200);
  const users = await call('/users');
  assert.ok(!users.data.some((u) => u.username === 'plain'), 'the member is gone');
});

test('logout clears the session', async () => {
  await server.signOut();
  assert.equal((await call('/me')).status, 401);
});

test('an administrator can delete everyone and return the instance to first-run', async () => {
  await call('/login', { body: { username: 'admin', password: 'testpass456' } });
  const r = await call('/me', { method: 'DELETE', body: { password: 'testpass456', deleteMembers: true } });
  assert.equal(r.status, 200);
  assert.equal((await call('/status', { noCookie: true })).data.needsSetup, true);
});
