'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/server');

const server = createTestServer();
const { call } = server;

let keyId;

test.before(async () => {
  await server.start();
  await server.setupAdmin();
  keyId = (await call('/keys', { body: { name: 'Main key', vendor: 'Yubico', formFactor: 'usb-c' } })).data.id;
});
test.after(() => server.stop());

test('inline service creation reuses same-named services; explicit creation refuses duplicates', async () => {
  const before = (await call('/data')).data.services.length;
  const r1 = await call('/registrations', {
    body: { keyId, service: { name: 'Gmail', url: 'gmail.com' }, kind: 'passkey' },
  });
  assert.equal(r1.status, 200);
  const r2 = await call('/registrations', {
    body: { keyId, service: { name: 'gmail' }, kind: 'totp', totpApp: 'Yubico Authenticator' },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.serviceId, r1.data.serviceId, 'case-insensitive same name reuses the service');
  assert.equal((await call('/data')).data.services.length, before + 1, 'only one Gmail service exists');

  const dupe = await call('/services', { body: { name: 'GMAIL' } });
  assert.equal(dupe.status, 400, 'explicit duplicate creation is refused');
});

test('a registration needs a service and an existing key', async () => {
  const noService = await call('/registrations', { body: { keyId, kind: 'passkey' } });
  assert.equal(noService.status, 400);
  const noKey = await call('/registrations', { body: { keyId: 999999, service: { name: 'X' } } });
  assert.equal(noKey.status, 404);
});

test('service icons accept uploads and catalog URLs but nothing else', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const uploaded = await call('/services', { body: { name: 'Uploaded', icon: png } });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.data.icon, png);

  const catalog = await call('/services', { body: { name: 'Catalog', icon: 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/github.png' } });
  assert.equal(catalog.status, 200);
  const dashboard = await call('/services', { body: { name: 'Dashboard', icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/proxmox.png' } });
  assert.equal(dashboard.status, 200);
  const ddg = await call('/services', { body: { name: 'Duck', icon: 'https://icons.duckduckgo.com/ip3/github.com.ico' } });
  assert.equal(ddg.status, 200);

  const foreign = await call('/services', { body: { name: 'Foreign', icon: 'https://evil.example/icon.png' } });
  assert.equal(foreign.status, 400);
  const script = await call('/services', { body: { name: 'Script', icon: 'data:text/html;base64,PHNjcmlwdD4=' } });
  assert.equal(script.status, 400);
  const huge = await call('/services', { body: { name: 'Huge', icon: 'data:image/png;base64,' + 'A'.repeat(130000) } });
  assert.equal(huge.status, 400);

  const offline = await call('/icons/search?source=selfhst&q=github');
  assert.equal(offline.status, 503, 'catalog search is off while KEEYO_OFFLINE is set');
  const unknown = await call('/icons/search?source=nope&q=github');
  assert.equal(unknown.status, 400);
});

test('services can be edited and deleted', async () => {
  const svc = await call('/services', { body: { name: 'Proton', url: 'proton.me' } });
  assert.equal(svc.status, 200);
  const upd = await call(`/services/${svc.data.id}`, { method: 'PUT', body: { name: 'Proton Mail', url: 'proton.me', icon: 'favicon' } });
  assert.equal(upd.data.name, 'Proton Mail');
  assert.equal(upd.data.icon, 'favicon');
  const del = await call(`/services/${svc.data.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await call(`/services/${svc.data.id}`, { method: 'DELETE' })).status, 404);
});

test('registrations support the revoked flag', async () => {
  const reg = await call('/registrations', {
    body: { keyId, service: { name: 'GitHub', url: 'github.com' }, kind: 'passkey', account: 'me' },
  });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.revoked, 0);
  const upd = await call(`/registrations/${reg.data.id}`, { method: 'PUT', body: { ...reg.data, revoked: true } });
  assert.equal(upd.data.revoked, 1);
  const events = await call(`/keys/${keyId}/events`);
  assert.ok(events.data.some((e) => e.kind === 'revoked'));
});

test('registrations can be moved between keys', async () => {
  const k2 = await call('/keys', { body: { name: 'Second key', vendor: 'Token2', formFactor: 'usb-a', color: '#4ade80' } });
  const reg = (await call('/data')).data.registrations[0];
  const moved = await call(`/registrations/${reg.id}`, { method: 'PUT', body: { ...reg, keyId: k2.data.id } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.keyId, k2.data.id);
  const evNew = await call(`/keys/${k2.data.id}/events`);
  assert.ok(evNew.data.some((e) => e.kind === 'registration-added'), 'move logged on the new key');
  const evOld = await call(`/keys/${keyId}/events`);
  assert.ok(evOld.data.some((e) => e.kind === 'registration-removed'), 'move logged on the old key');
});

test('deleting a service removes its registrations', async () => {
  const data = await call('/data');
  const gmail = data.data.services.find((s) => s.name === 'Gmail');
  assert.ok(gmail);
  await call(`/services/${gmail.id}`, { method: 'DELETE' });
  const after = await call('/data');
  assert.ok(!after.data.registrations.some((r) => r.serviceId === gmail.id));
});

test('custom catalog entries dedupe, rename with cascade, and can be removed', async () => {
  const a = await call('/catalog', { body: { type: 'vendor', value: 'HyperFIDO' } });
  assert.equal(a.status, 200);
  const b = await call('/catalog', { body: { type: 'vendor', value: 'hyperfido' } });
  assert.equal(b.data.id, a.data.id, 'case-insensitive duplicate returns the existing entry');
  const bad = await call('/catalog', { body: { type: 'color', value: 'red' } });
  assert.equal(bad.status, 400);

  const model = await call('/catalog', { body: { type: 'model', value: 'K5', extra: { vendor: 'HyperFIDO', formFactor: 'usb-a' } } });
  const key = await call('/keys', { body: { name: 'Hyper key', vendor: 'HyperFIDO', model: 'K5', formFactor: 'usb-a' } });

  const renamed = await call(`/catalog/${a.data.id}`, { method: 'PUT', body: { value: 'HyperSecu' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.value, 'HyperSecu');
  const data = await call('/data');
  assert.equal(data.data.keys.find((k) => k.id === key.data.id).vendor, 'HyperSecu', 'keys follow a vendor rename');
  assert.equal(data.data.catalog.find((c) => c.id === model.data.id).extra.vendor, 'HyperSecu', 'models follow a vendor rename');

  const other = await call('/catalog', { body: { type: 'vendor', value: 'Acme' } });
  const clash = await call(`/catalog/${other.data.id}`, { method: 'PUT', body: { value: 'hypersecu' } });
  assert.equal(clash.status, 400, 'renaming onto an existing entry is refused');

  assert.equal((await call(`/catalog/${a.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await call(`/catalog/${a.data.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await call('/catalog/999999', { method: 'PUT', body: { value: 'x' } })).status, 404);
});
