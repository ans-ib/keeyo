'use strict';

const config = require('../config');
const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str } = require('../lib/validate');
const smtp = require('../lib/smtp');

const SETTING_KEYS = [
  'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_pass',
  'smtp_from', 'smtp_from_name',
];

const SECURITIES = ['tls', 'starttls', 'none'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function envLocked() {
  return !!config.smtpFromEnv();
}

function current() {
  const fromEnv = config.smtpFromEnv();
  if (fromEnv) return fromEnv;
  if (setting('smtp_enabled') !== '1') return null;
  const host = setting('smtp_host');
  const from = setting('smtp_from');
  if (!host || !from) return null;
  return {
    host,
    port: Number(setting('smtp_port')) || 587,
    security: SECURITIES.includes(setting('smtp_security')) ? setting('smtp_security') : 'starttls',
    user: setting('smtp_user'),
    pass: setting('smtp_pass'),
    from,
    fromName: setting('smtp_from_name') || 'Keeyo',
    envLocked: false,
  };
}

function adminView() {
  return {
    envLocked: envLocked(),
    configured: !!current(),
    enabled: setting('smtp_enabled') === '1',
    host: setting('smtp_host'),
    port: Number(setting('smtp_port')) || 587,
    security: SECURITIES.includes(setting('smtp_security')) ? setting('smtp_security') : 'starttls',
    user: setting('smtp_user'),
    hasPass: !!setting('smtp_pass'),
    from: setting('smtp_from'),
    fromName: setting('smtp_from_name') || 'Keeyo',
  };
}

function update(body) {
  if (envLocked()) throw new ApiError(400, 'SMTP is configured through environment variables — change it there');
  if (body.clear === true) {
    tx(() => {
      const del = db.prepare('DELETE FROM settings WHERE key = ?');
      for (const key of SETTING_KEYS) del.run(key);
    });
    return { configured: false };
  }

  const enabled = body.enabled === true;
  const host = str(body.host, { label: 'Host', max: 300 });
  const port = Number(body.port) || 587;
  const security = SECURITIES.includes(body.security) ? body.security : 'starttls';
  const user = str(body.user, { label: 'Username', max: 300 });
  const pass = str(body.pass, { label: 'Password', max: 500 });
  const from = str(body.from, { label: 'From address', max: 300 });
  const fromName = str(body.fromName, { label: 'From name', max: 80 });

  if (enabled) {
    if (!host) throw new ApiError(400, 'Host is required');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError(400, 'Port must be 1-65535');
    if (!EMAIL_RE.test(from)) throw new ApiError(400, 'From address must be a valid email address');
  }

  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => {
    put.run('smtp_enabled', enabled ? '1' : '0');
    put.run('smtp_host', host);
    put.run('smtp_port', String(port));
    put.run('smtp_security', security);
    put.run('smtp_user', user);
    if (pass) put.run('smtp_pass', pass);
    put.run('smtp_from', from);
    put.run('smtp_from_name', fromName);
  });
  return { configured: !!current() };
}

async function send(to, subject, text) {
  const cfg = current();
  if (!cfg) throw new ApiError(400, 'Email is not configured');
  await smtp.send(cfg, { to, subject, text });
}

module.exports = { current, envLocked, adminView, update, send };
