'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

const mock = { http: null, port: 0, messages: [] };

function startSmtp() {
  mock.http = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let current = '';
    socket.write('220 mock ready\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            mock.messages.push(current);
            current = '';
            inData = false;
            socket.write('250 accepted\r\n');
          } else {
            current += (line.startsWith('..') ? line.slice(1) : line) + '\n';
          }
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) socket.write('250-mock\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (cmd.startsWith('AUTH')) socket.write('235 ok\r\n');
        else if (cmd.startsWith('MAIL') || cmd.startsWith('RCPT')) socket.write('250 ok\r\n');
        else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => mock.http.listen(0, '127.0.0.1', () => {
    mock.port = mock.http.address().port;
    resolve();
  }));
}

async function waitForMail(count) {
  for (let i = 0; i < 100; i++) {
    if (mock.messages.length >= count) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('mail never arrived');
}

test.before(async () => {
  await server.start();
  await startSmtp();
  await server.setupAdmin();
});

test.after(async () => {
  await server.stop();
  await new Promise((r) => mock.http.close(r));
});

test('admin configures SMTP and the login page advertises reset', async () => {
  const before = await call('/status', { noCookie: true });
  assert.equal(before.data.resetAvailable, false);

  const denied = await call('/admin/smtp', { method: 'PUT', body: { enabled: true }, noCookie: true });
  assert.equal(denied.status, 401);

  const bad = await call('/admin/smtp', { method: 'PUT', body: { enabled: true, host: '', from: 'x' } });
  assert.equal(bad.status, 400);

  const put = await call('/admin/smtp', {
    method: 'PUT',
    body: {
      enabled: true, host: '127.0.0.1', port: mock.port, security: 'none',
      user: 'mailer', pass: 'mailpass', from: 'keeyo@example.test', fromName: 'Keeyo Test',
    },
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.configured, true);

  const view = await call('/admin/smtp');
  assert.equal(view.data.hasPass, true);
  assert.equal(view.data.from, 'keeyo@example.test');

  const after = await call('/status', { noCookie: true });
  assert.equal(after.data.resetAvailable, true);
});

test('test email goes through the account address', async () => {
  const noEmail = await call('/admin/smtp/test', { method: 'POST', body: {} });
  assert.equal(noEmail.status, 400);

  const setEmail = await call('/me/email', { method: 'PUT', body: { email: 'Admin@Example.Test' } });
  assert.equal(setEmail.status, 200);
  assert.equal(setEmail.data.email, 'admin@example.test');
  assert.equal((await call('/me')).data.email, 'admin@example.test');

  const sent = await call('/admin/smtp/test', { method: 'POST', body: {} });
  assert.equal(sent.status, 200);
  await waitForMail(1);
  assert.match(mock.messages[0], /Subject: Keeyo test email/);
  assert.match(mock.messages[0], /To: <admin@example.test>/);
  assert.match(mock.messages[0], /From: Keeyo Test <keeyo@example.test>/);
});

test('password reset round trip: request, link, complete, single use', async () => {
  const unknown = await call('/reset/request', { body: { identifier: 'nobody' }, noCookie: true });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.ok, true);

  const mailCount = mock.messages.length;
  const r = await call('/reset/request', { body: { identifier: 'admin' }, noCookie: true });
  assert.equal(r.status, 200);
  await waitForMail(mailCount + 1);
  assert.equal(mock.messages.length, mailCount + 1, 'unknown identifiers must not produce mail');

  const message = mock.messages[mock.messages.length - 1];
  const match = message.match(/#\/reset\/([A-Za-z0-9_-]+)/);
  assert.ok(match, 'mail carries a reset link');
  const token = match[1];

  const short = await call('/reset/complete', { body: { token, password: 'tiny' }, noCookie: true });
  assert.equal(short.status, 400);

  const done = await call('/reset/complete', { body: { token, password: 'brand-new-pass-1' }, noCookie: true });
  assert.equal(done.status, 200);

  const oldSession = await call('/me');
  assert.equal(oldSession.status, 401, 'reset revokes existing sessions');
  server.cookie = '';

  const oldPw = await call('/login', { body: { username: 'admin', password: 'testpass123' }, noCookie: true });
  assert.equal(oldPw.status, 401);

  const reuse = await call('/reset/complete', { body: { token, password: 'another-pass-12' }, noCookie: true });
  assert.equal(reuse.status, 400, 'tokens are single use');

  const login = await call('/login', { body: { username: 'admin', password: 'brand-new-pass-1' } });
  assert.equal(login.status, 200);
  assert.equal((await call('/me')).data.username, 'admin');
});

test('reset by email address works and clearing SMTP disables the flow', async () => {
  const mailCount = mock.messages.length;
  await call('/reset/request', { body: { identifier: 'ADMIN@example.test' }, noCookie: true });
  await waitForMail(mailCount + 1);

  const cleared = await call('/admin/smtp', { method: 'PUT', body: { clear: true } });
  assert.equal(cleared.status, 200);
  assert.equal((await call('/status', { noCookie: true })).data.resetAvailable, false);
  assert.equal((await call('/admin/smtp')).data.hasPass, false);
});
