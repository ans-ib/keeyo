'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

const idp = {
  base: '',
  nonce: '',
  profile: { preferred_username: 'SSO.User', email: 'sso@example.com' },
  http: null,
};

function encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function startIdp() {
  idp.http = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/.well-known/openid-configuration')) {
      res.end(JSON.stringify({
        issuer: idp.base,
        authorization_endpoint: `${idp.base}/authorize`,
        token_endpoint: `${idp.base}/token`,
      }));
    } else if (req.url.startsWith('/token')) {
      const header = encode({ alg: 'RS256', typ: 'JWT' });
      const payload = encode({
        iss: idp.base,
        aud: 'keeyo-test',
        exp: Math.floor(Date.now() / 1000) + 600,
        nonce: idp.nonce,
        sub: 'abc123',
        ...idp.profile,
      });
      res.end(JSON.stringify({ id_token: `${header}.${payload}.fakesig` }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  return new Promise((resolve) => idp.http.listen(0, server.hostname, () => {
    idp.base = `http://${server.hostname}:${idp.http.address().port}`;
    resolve();
  }));
}

async function beginSso() {
  const r = await fetch(server.base + '/api/oidc/login', { redirect: 'manual' });
  assert.equal(r.status, 302);
  const location = new URL(r.headers.get('location'));
  idp.nonce = location.searchParams.get('nonce');
  return location;
}

async function finishSso(location, code = 'fake') {
  return fetch(server.base + `/api/oidc/callback?state=${location.searchParams.get('state')}&code=${code}`, { redirect: 'manual' });
}

function setEnv() {
  process.env.KEEYO_OIDC_ISSUER = idp.base;
  process.env.KEEYO_OIDC_CLIENT_ID = 'keeyo-test';
  process.env.KEEYO_OIDC_CLIENT_SECRET = 'shhh';
  process.env.KEEYO_OIDC_NAME = 'Authentik';
}

function clearEnv() {
  delete process.env.KEEYO_OIDC_ISSUER;
  delete process.env.KEEYO_OIDC_CLIENT_ID;
  delete process.env.KEEYO_OIDC_CLIENT_SECRET;
  delete process.env.KEEYO_OIDC_NAME;
}

test.before(async () => {
  await server.start();
  await startIdp();
  await server.setupAdmin();
});
test.after(async () => {
  clearEnv();
  await new Promise((r) => idp.http.close(r));
  await server.stop();
});

test('without configuration SSO is off', async () => {
  const st = await call('/status', { noCookie: true });
  assert.equal(st.data.sso.enabled, false);
  const r = await fetch(server.base + '/api/oidc/login', { redirect: 'manual' });
  assert.equal(r.status, 404);
});

test('environment-configured code flow with PKCE signs in and auto-creates the user', async () => {
  setEnv();
  try {
    const st = await call('/status', { noCookie: true });
    assert.equal(st.data.sso.enabled, true, 'status must advertise SSO when configured');
    assert.equal(st.data.sso.name, 'Authentik');

    const location = await beginSso();
    assert.equal(`${location.origin}${location.pathname}`, `${idp.base}/authorize`);
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(location.searchParams.get('code_challenge'), 'PKCE challenge present');

    const cb = await finishSso(location);
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('location'), '/', 'successful SSO redirects home');
    const ssoCookie = (cb.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(ssoCookie.startsWith('keeyo_session='), 'session cookie issued');
    const me = await (await fetch(server.base + '/api/me', { headers: { cookie: ssoCookie } })).json();
    assert.equal(me.username, 'sso.user', 'user auto-created from preferred_username');
    assert.equal(me.isAdmin, false, 'SSO users are never auto-admins');

    const pw = await call('/login', { body: { username: 'sso.user', password: 'sso' }, noCookie: true });
    assert.equal(pw.status, 401, 'SSO-created accounts have no usable password');

    const replay = await finishSso(location);
    assert.match(decodeURIComponent(replay.headers.get('location') || ''), /expired/, 'a replayed state is refused');

    const locked = await call('/admin/sso', { method: 'PUT', body: { enabled: true } });
    assert.equal(locked.status, 400, 'environment variables lock the admin panel');
    assert.equal((await call('/admin/sso')).data.envLocked, true);
  } finally {
    clearEnv();
  }
});

test('admin-configured SSO: password policy, verified email, provider logout, clearing', async () => {
  const off = await call('/status', { noCookie: true });
  assert.equal(off.data.sso.enabled, false, 'SSO disappears when unconfigured');

  const incomplete = await call('/admin/sso', { method: 'PUT', body: { enabled: true, issuer: idp.base } });
  assert.equal(incomplete.status, 400);

  const put = await call('/admin/sso', {
    method: 'PUT',
    body: {
      enabled: true, issuer: idp.base, clientId: 'keeyo-test', clientSecret: 's3cret',
      name: 'Authentik', autoCreate: true, requireVerified: true, disablePassword: true,
      logoutUrl: `${idp.base}/goodbye`, scopes: 'openid profile email', usernameClaim: 'preferred_username',
    },
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.configured, true);
  const on = await call('/status', { noCookie: true });
  assert.equal(on.data.sso.enabled, true, 'admin-configured SSO advertises on the sign-in screen');
  assert.equal(on.data.sso.passwordDisabled, true);
  assert.equal((await call('/admin/sso')).data.hasSecret, true);

  await call('/users', { body: { username: 'plainuser', password: 'plainpass123', isAdmin: false } });
  const blocked = await call('/login', { body: { username: 'plainuser', password: 'plainpass123' }, noCookie: true });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.error, /disabled/);
  const adminOk = await call('/login', { body: { username: 'admin', password: 'testpass123' }, noCookie: true });
  assert.equal(adminOk.status, 200, 'admins keep password sign-in as the lockout hatch');

  idp.profile = { preferred_username: 'Fresh.One', email: 'f@example.com', email_verified: false };
  let cb = await finishSso(await beginSso());
  assert.match(decodeURIComponent(cb.headers.get('location') || ''), /not verified/);

  idp.profile.email_verified = true;
  cb = await finishSso(await beginSso());
  assert.equal(cb.headers.get('location'), '/');
  const freshCookie = (cb.headers.get('set-cookie') || '').split(';')[0];
  const out = await fetch(server.base + '/api/logout', {
    method: 'POST',
    headers: { cookie: freshCookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal((await out.json()).redirect, `${idp.base}/goodbye`, 'SSO sessions chain into the provider logout');

  await call('/admin/sso', { method: 'PUT', body: { clear: true } });
  const off2 = await call('/status', { noCookie: true });
  assert.equal(off2.data.sso.enabled, false);
  assert.equal((await call('/admin/sso')).data.hasSecret, false, 'clearing must forget the secret');
});
