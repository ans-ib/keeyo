'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTestServer() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'keeyo-test-'));
  process.env.KEEYO_OFFLINE = '1';
  delete process.env.TRUST_PROXY;
  delete process.env.KEEYO_DISABLE_MFA;

  const server = {
    hostname: '127.0.0.1',
    base: '',
    cookie: '',
    http: null,

    start() {
      const { createApp } = require('../../server/app');
      return new Promise((resolve) => {
        server.http = createApp().listen(0, server.hostname, () => {
          server.base = `http://${server.hostname}:${server.http.address().port}`;
          resolve();
        });
      });
    },

    stop() {
      return new Promise((resolve) => server.http.close(resolve));
    },

    async call(pathname, { method, body, headers = {}, raw, noCookie } = {}) {
      const res = await fetch(server.base + '/api' + pathname, {
        method: method || (body ? 'POST' : 'GET'),
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(noCookie ? {} : { cookie: server.cookie }),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie && !noCookie) server.cookie = setCookie.split(';')[0];
      if (raw) return res;
      return { status: res.status, data: await res.json().catch(() => ({})) };
    },

    async setupAdmin(username = 'admin', password = 'testpass123') {
      const r = await server.call('/setup', { body: { username, password } });
      if (r.status !== 200) throw new Error(`setup failed: ${JSON.stringify(r.data)}`);
      return r;
    },

    async signOut() {
      await server.call('/logout', { method: 'POST', body: {} });
      server.cookie = '';
    },
  };

  return server;
}

module.exports = { createTestServer };
