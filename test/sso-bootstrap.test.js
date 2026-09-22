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
  lastTokenBody: '',
  profile: { preferred_username: 'Cosmos.Owner' },
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
      return;
    }
    if (req.url.startsWith('/token')) {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        idp.lastTokenBody = body;
        const idToken = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
          iss: idp.base,
          aud: '__route_keeyo',
          exp: Math.floor(Date.now() / 1000) + 600,
          nonce: idp.nonce,
          sub: 'owner-1',
          ...idp.profile,
        })}.sig`;
        res.end(JSON.stringify({ id_token: idToken }));
      });
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  return new Promise((resolve) => idp.http.listen(0, server.hostname, () => {
    idp.base = `http://${server.hostname}:${idp.http.address().port}`;
    resolve();
  }));
}

async function completeFlow() {
  const start = await fetch(server.base + '/api/oidc/login', { redirect: 'manual' });
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location'));
  idp.nonce = loc.searchParams.get('nonce');
  const cb = await fetch(
    server.base + `/api/oidc/callback?state=${loc.searchParams.get('state')}&code=x`,
    { redirect: 'manual' },
  );
  return cb;
}

test.before(async () => {
  await server.start();
  await startIdp();
  process.env.KEEYO_OIDC_ISSUER = idp.base;
  process.env.KEEYO_OIDC_CLIENT_ID = '__route_keeyo';
  process.env.KEEYO_OIDC_NAME = 'Cosmos';
  process.env.KEEYO_OIDC_ADMIN_BOOTSTRAP = '1';
});

test.after(async () => {
  delete process.env.KEEYO_OIDC_ISSUER;
  delete process.env.KEEYO_OIDC_CLIENT_ID;
  delete process.env.KEEYO_OIDC_NAME;
  delete process.env.KEEYO_OIDC_ADMIN_BOOTSTRAP;
  await server.stop();
  await new Promise((r) => idp.http.close(r));
});

test('bootstrap mode gates setup behind the identity provider', async () => {
  const status = await call('/status', { noCookie: true });
  assert.equal(status.data.needsSetup, false, 'no setup screen when SSO bootstraps the admin');
  assert.equal(status.data.sso.enabled, true, 'public client without a secret still configures SSO');
  assert.equal(status.data.sso.name, 'Cosmos');

  const setup = await call('/setup', { body: { username: 'racer', password: 'racerpass123' }, noCookie: true });
  assert.equal(setup.status, 403, 'the first-visit admin race is closed');
});

test('first SSO sign-in becomes the admin, without a client secret', async () => {
  const cb = await completeFlow();
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/');
  server.cookie = (cb.headers.get('set-cookie') || '').split(';')[0];

  assert.ok(!idp.lastTokenBody.includes('client_secret'), 'public clients must not send a secret');
  assert.match(idp.lastTokenBody, /code_verifier=/, 'PKCE verifier is sent');

  const me = await call('/me');
  assert.equal(me.data.username, 'cosmos.owner');
  assert.equal(me.data.isAdmin, true, 'the bootstrap user is the admin');
});

test('bootstrap applies only once — later SSO users are ordinary members', async () => {
  idp.profile = { preferred_username: 'Second.User' };
  const cb = await completeFlow();
  assert.equal(cb.status, 302);
  const cookie = (cb.headers.get('set-cookie') || '').split(';')[0];
  const me = await (await fetch(server.base + '/api/me', { headers: { cookie } })).json();
  assert.equal(me.username, 'second.user');
  assert.equal(me.isAdmin, false);

  const setup = await call('/setup', { body: { username: 'racer', password: 'racerpass123' }, noCookie: true });
  assert.equal(setup.status, 403, 'setup stays closed once accounts exist');
});
