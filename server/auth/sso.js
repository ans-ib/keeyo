'use strict';

const config = require('../config');
const { db, tx } = require('../db');
const { ApiError } = require('../lib/errors');
const { str, optionalUrl } = require('../lib/validate');
const oidc = require('./oidc');
const users = require('./users');

const SETTING_KEYS = [
  'oidc_enabled', 'oidc_issuer', 'oidc_client_id', 'oidc_client_secret', 'oidc_name',
  'oidc_auto_create', 'oidc_scopes', 'oidc_username_claim', 'oidc_auth_url', 'oidc_token_url',
  'oidc_logout_url', 'oidc_require_verified', 'oidc_disable_password',
];

const DEFAULT_NAME = 'SSO';
const DEFAULT_SCOPES = 'openid profile email';
const DEFAULT_USERNAME_CLAIM = 'preferred_username';

function setting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function envLocked() {
  return !!config.oidcFromEnv();
}

function current() {
  const fromEnv = config.oidcFromEnv();
  if (fromEnv) return fromEnv;
  if (setting('oidc_enabled') !== '1') return null;
  const issuer = setting('oidc_issuer').replace(/\/+$/, '');
  const clientId = setting('oidc_client_id');
  const clientSecret = setting('oidc_client_secret');
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    name: setting('oidc_name') || DEFAULT_NAME,
    autoCreate: setting('oidc_auto_create') !== '0',
    scopes: setting('oidc_scopes') || DEFAULT_SCOPES,
    usernameClaim: setting('oidc_username_claim') || DEFAULT_USERNAME_CLAIM,
    authUrl: setting('oidc_auth_url'),
    tokenUrl: setting('oidc_token_url'),
    logoutUrl: setting('oidc_logout_url'),
    requireVerified: setting('oidc_require_verified') === '1',
    disablePassword: setting('oidc_disable_password') === '1',
    envLocked: false,
  };
}

function adminView() {
  return {
    envLocked: envLocked(),
    configured: !!current(),
    enabled: setting('oidc_enabled') === '1',
    issuer: setting('oidc_issuer'),
    clientId: setting('oidc_client_id'),
    hasSecret: !!setting('oidc_client_secret'),
    name: setting('oidc_name') || DEFAULT_NAME,
    autoCreate: setting('oidc_auto_create') !== '0',
    scopes: setting('oidc_scopes') || DEFAULT_SCOPES,
    usernameClaim: setting('oidc_username_claim') || DEFAULT_USERNAME_CLAIM,
    authUrl: setting('oidc_auth_url'),
    tokenUrl: setting('oidc_token_url'),
    logoutUrl: setting('oidc_logout_url'),
    requireVerified: setting('oidc_require_verified') === '1',
    disablePassword: setting('oidc_disable_password') === '1',
  };
}

function clear() {
  tx(() => {
    const del = db.prepare('DELETE FROM settings WHERE key = ?');
    for (const key of SETTING_KEYS) del.run(key);
  });
}

function update(body) {
  if (envLocked()) throw new ApiError(400, 'SSO is configured through environment variables — change it there');
  if (body.clear === true) {
    clear();
    return { configured: false };
  }

  const enabled = body.enabled === true;
  const issuer = optionalUrl(body.issuer, 'Issuer URL').replace(/\/+$/, '');
  const clientId = str(body.clientId, { label: 'Client ID', max: 200 });
  const clientSecret = str(body.clientSecret, { label: 'Client secret', max: 500 });
  const name = str(body.name, { label: 'Provider name', max: 40 }) || DEFAULT_NAME;
  const scopes = str(body.scopes, { label: 'Scopes', max: 200 }) || DEFAULT_SCOPES;
  const usernameClaim = str(body.usernameClaim, { label: 'User identifier field', max: 60 }) || DEFAULT_USERNAME_CLAIM;
  const authUrl = optionalUrl(body.authUrl, 'Auth URL');
  const tokenUrl = optionalUrl(body.tokenUrl, 'Token URL');
  const logoutUrl = optionalUrl(body.logoutUrl, 'Logout URL');

  if (enabled) {
    if (!issuer) throw new ApiError(400, 'Issuer URL is required');
    if (!clientId) throw new ApiError(400, 'Client ID is required');
    if (!clientSecret && !setting('oidc_client_secret')) throw new ApiError(400, 'Client secret is required');
    if ((authUrl && !tokenUrl) || (!authUrl && tokenUrl)) {
      throw new ApiError(400, 'Set both Auth URL and Token URL to bypass discovery, or neither');
    }
    if (!scopes.split(/\s+/).includes('openid')) throw new ApiError(400, 'Scopes must include "openid"');
  }

  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => {
    put.run('oidc_enabled', enabled ? '1' : '0');
    put.run('oidc_issuer', issuer);
    put.run('oidc_client_id', clientId);
    if (clientSecret) put.run('oidc_client_secret', clientSecret);
    put.run('oidc_name', name);
    put.run('oidc_auto_create', body.autoCreate === false ? '0' : '1');
    put.run('oidc_scopes', scopes);
    put.run('oidc_username_claim', usernameClaim);
    put.run('oidc_auth_url', authUrl);
    put.run('oidc_token_url', tokenUrl);
    put.run('oidc_logout_url', logoutUrl);
    put.run('oidc_require_verified', body.requireVerified === true ? '1' : '0');
    put.run('oidc_disable_password', body.disablePassword === true ? '1' : '0');
  });
  return { configured: !!current() };
}

function resolveUser(claims, cfg) {
  const username = oidc.usernameFrom(claims, cfg);
  const existing = users.findByUsername(username);
  if (existing) return existing.id;
  if (!cfg.autoCreate) throw new Error(`No Keeyo account named "${username}" — ask your admin to create it`);
  if (cfg.requireVerified && claims.email_verified !== true) {
    throw new Error('Your email address is not verified at the identity provider');
  }
  return users.create({ username, passwordHash: users.SSO_PASSWORD, isAdmin: false });
}

module.exports = { current, envLocked, adminView, update, resolveUser };
