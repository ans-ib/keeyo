'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');
const { webauthnFor } = require('./helpers/authenticator');
const { totpCode } = require('./helpers/totp');

const server = createTestServer();
const { call } = server;
const { makeAuthenticator, signAssertion, creationClientData } = webauthnFor(server);

const PASSWORD = 'testpass123';
let authr;
let totpSecret;

async function passwordStep() {
  await server.signOut();
  return call('/login', { body: { username: 'admin', password: PASSWORD } });
}

test.before(async () => {
  await server.start();
  await server.setupAdmin('admin', PASSWORD);
});
test.after(() => server.stop());

test('enrolling a sign-in key verifies the creation ceremony', async () => {
  authr = makeAuthenticator();
  const ch = await call('/login-keys/challenge', { method: 'POST', body: {} });
  assert.equal(ch.status, 200);

  const badOrigin = await call('/login-keys', {
    body: {
      token: ch.data.token, name: 'x', credentialId: authr.credentialId,
      publicKey: authr.spkiB64, alg: -7,
      clientDataJSON: creationClientData(ch.data.challenge, 'https://evil.example'),
    },
  });
  assert.equal(badOrigin.status, 403, 'enrollment from a foreign origin must be refused');

  const ch2 = await call('/login-keys/challenge', { method: 'POST', body: {} });
  const ok = await call('/login-keys', {
    body: {
      token: ch2.data.token, name: 'Test MFA key', credentialId: authr.credentialId,
      publicKey: authr.spkiB64, alg: -7,
      clientDataJSON: creationClientData(ch2.data.challenge),
    },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.name, 'Test MFA key');

  const ch3 = await call('/login-keys/challenge', { method: 'POST', body: {} });
  const dupe = await call('/login-keys', {
    body: {
      token: ch3.data.token, name: 'Again', credentialId: authr.credentialId,
      publicKey: authr.spkiB64, alg: -7,
      clientDataJSON: creationClientData(ch3.data.challenge),
    },
  });
  assert.equal(dupe.status, 400, 'the same credential cannot be enrolled twice');
});

test('login requires the password AND the enrolled key', async () => {
  const step1 = await passwordStep();
  assert.equal(step1.data.mfaRequired, true, 'password alone must not create a session');
  assert.equal(step1.data.methods.webauthn, true);
  assert.equal((await call('/data')).status, 401, 'no session before the second factor');

  const forged = await call('/login/mfa', {
    body: { mfaToken: step1.data.mfaToken, ...signAssertion(authr, step1.data.challenge, { wrongKey: true }) },
  });
  assert.equal(forged.status, 403);

  const step1b = await passwordStep();
  const unknown = await call('/login/mfa', {
    body: { mfaToken: step1b.data.mfaToken, ...signAssertion(makeAuthenticator(), step1b.data.challenge) },
  });
  assert.equal(unknown.status, 403, 'a key that is not enrolled is refused');

  const step1c = await passwordStep();
  const ok = await call('/login/mfa', {
    body: { mfaToken: step1c.data.mfaToken, ...signAssertion(authr, step1c.data.challenge) },
  });
  assert.equal(ok.status, 200);
  assert.equal((await call('/me')).data.username, 'admin');
});

test('authenticator app: setup, confirm and sign in with a code', async () => {
  const setup = await call('/account/totp/setup', { method: 'POST', body: {} });
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\/Keeyo:admin\?secret=/);
  totpSecret = setup.data.secret;

  const bad = await call('/account/totp/confirm', { body: { code: '000000' } });
  assert.equal(bad.status, 400, 'a wrong code must not enable TOTP');
  const ok = await call('/account/totp/confirm', { body: { code: totpCode(totpSecret) } });
  assert.equal(ok.status, 200);
  assert.equal((await call('/account/mfa')).data.totpEnabled, true);

  const step1 = await passwordStep();
  assert.equal(step1.data.methods.totp, true);
  assert.equal(step1.data.methods.webauthn, true, 'the sign-in key from earlier is still enrolled');

  const okCode = totpCode(totpSecret, 1);
  const wrongCode = okCode.slice(0, 5) + String((Number(okCode[5]) + 1) % 10);
  const wrong = await call('/login/mfa', { body: { mfaToken: step1.data.mfaToken, code: wrongCode } });
  assert.equal(wrong.status, 401);
  const done = await call('/login/mfa', { body: { mfaToken: step1.data.mfaToken, code: okCode } });
  assert.equal(done.status, 200, 'a wrong code must not invalidate the mfa token');
  assert.equal((await call('/me')).data.username, 'admin');

  const step2 = await passwordStep();
  const replay = await call('/login/mfa', { body: { mfaToken: step2.data.mfaToken, code: okCode } });
  assert.equal(replay.status, 401, 'TOTP codes are single-use');
  const again = await call('/login/mfa', {
    body: { mfaToken: step2.data.mfaToken, ...signAssertion(authr, step2.data.challenge) },
  });
  assert.equal(again.status, 200, 'method fallback works on the same mfa token');
});

test('recovery codes: generate, single-use sign-in, regeneration invalidates', async () => {
  const gen = await call('/account/recovery-codes', { method: 'POST', body: {} });
  assert.equal(gen.status, 200);
  assert.equal(gen.data.codes.length, 10);
  assert.match(gen.data.codes[0], /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  const step1 = await passwordStep();
  assert.equal(step1.data.methods.recovery, true);
  const ok = await call('/login/mfa', { body: { mfaToken: step1.data.mfaToken, recoveryCode: gen.data.codes[0] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.recoveryRemaining, 9);

  const step2 = await passwordStep();
  const reuse = await call('/login/mfa', { body: { mfaToken: step2.data.mfaToken, recoveryCode: gen.data.codes[0] } });
  assert.equal(reuse.status, 401, 'a spent recovery code must be dead');
  const ok2 = await call('/login/mfa', { body: { mfaToken: step2.data.mfaToken, recoveryCode: gen.data.codes[1] } });
  assert.equal(ok2.status, 200);

  const gen2 = await call('/account/recovery-codes', { method: 'POST', body: {} });
  const step3 = await passwordStep();
  const old = await call('/login/mfa', { body: { mfaToken: step3.data.mfaToken, recoveryCode: gen.data.codes[2] } });
  assert.equal(old.status, 401, 'regeneration must invalidate the old set');
  const fresh = await call('/login/mfa', { body: { mfaToken: step3.data.mfaToken, recoveryCode: gen2.data.codes[0] } });
  assert.equal(fresh.status, 200);
});

test('recovery codes are wiped when the last second factor is removed', async () => {
  const off = await call('/account/totp', { method: 'DELETE' });
  assert.equal(off.status, 200);
  let s = await call('/account/mfa');
  assert.equal(s.data.totpEnabled, false);
  assert.ok(s.data.recovery.remaining > 0, 'codes survive while a sign-in key remains');

  const keys = await call('/login-keys');
  for (const k of keys.data) await call(`/login-keys/${k.id}`, { method: 'DELETE' });
  s = await call('/account/mfa');
  assert.equal(s.data.loginKeys, 0);
  assert.equal(s.data.recovery.total, 0, 'no second factor left, so no recovery codes');

  const refused = await call('/account/recovery-codes', { method: 'POST', body: {} });
  assert.equal(refused.status, 400, 'codes cannot exist without a second factor');

  const plain = await passwordStep();
  assert.equal(plain.status, 200);
  assert.equal(plain.data.mfaRequired, undefined, 'sign-in falls back to password only');
});
