'use strict';

// Single sign-on via OpenID Connect (authorization code flow + PKCE), aimed at
// self-hosted identity providers — Authentik, Authelia, Keycloak, Pocket ID and
// friends all speak this. Zero dependencies: discovery and the token exchange
// are plain fetches, PKCE is node:crypto.
//
// ID-token signature verification is deliberately skipped: the token arrives
// directly from the token endpoint over TLS, where OIDC Core 3.1.3.7 allows TLS
// server validation in place of signature checks. Claims (iss, aud, exp, nonce)
// are still validated.
//
// Configuration (all required to enable, read at call time so tests can inject):
//   KEEYO_OIDC_ISSUER       e.g. https://auth.example.com/application/o/keeyo/
//   KEEYO_OIDC_CLIENT_ID
//   KEEYO_OIDC_CLIENT_SECRET
// Optional:
//   KEEYO_OIDC_NAME         button label in the UI (default "SSO")
//   KEEYO_OIDC_AUTO_CREATE  "0" to refuse SSO logins for unknown usernames (default on)

const crypto = require('node:crypto');
const { db } = require('./db');

function setting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

// Environment variables win (operator-controlled, immutable from the web UI);
// otherwise the admin-configured values from Settings → Security apply.
function config() {
  const envIssuer = (process.env.KEEYO_OIDC_ISSUER || '').replace(/\/+$/, '');
  if (envIssuer && process.env.KEEYO_OIDC_CLIENT_ID && process.env.KEEYO_OIDC_CLIENT_SECRET) {
    return {
      issuer: envIssuer,
      clientId: process.env.KEEYO_OIDC_CLIENT_ID,
      clientSecret: process.env.KEEYO_OIDC_CLIENT_SECRET,
      name: process.env.KEEYO_OIDC_NAME || 'SSO',
      autoCreate: process.env.KEEYO_OIDC_AUTO_CREATE !== '0',
      scopes: process.env.KEEYO_OIDC_SCOPES || 'openid profile email',
      usernameClaim: process.env.KEEYO_OIDC_USERNAME_CLAIM || 'preferred_username',
      authUrl: '',
      tokenUrl: '',
      logoutUrl: process.env.KEEYO_OIDC_LOGOUT_URL || '',
      requireVerified: process.env.KEEYO_OIDC_REQUIRE_VERIFIED === '1',
      disablePassword: process.env.KEEYO_OIDC_DISABLE_PASSWORD === '1',
      envLocked: true,
    };
  }
  if (setting('oidc_enabled') !== '1') return null;
  const issuer = setting('oidc_issuer').replace(/\/+$/, '');
  const clientId = setting('oidc_client_id');
  const clientSecret = setting('oidc_client_secret');
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    name: setting('oidc_name') || 'SSO',
    autoCreate: setting('oidc_auto_create') !== '0',
    scopes: setting('oidc_scopes') || 'openid profile email',
    usernameClaim: setting('oidc_username_claim') || 'preferred_username',
    authUrl: setting('oidc_auth_url'),
    tokenUrl: setting('oidc_token_url'),
    logoutUrl: setting('oidc_logout_url'),
    requireVerified: setting('oidc_require_verified') === '1',
    disablePassword: setting('oidc_disable_password') === '1',
    envLocked: false,
  };
}

function envLocked() {
  return !!(process.env.KEEYO_OIDC_ISSUER && process.env.KEEYO_OIDC_CLIENT_ID && process.env.KEEYO_OIDC_CLIENT_SECRET);
}

let discovery = null; // { issuer, authorization_endpoint, token_endpoint, fetchedAt }

async function discover() {
  const cfg = config();
  if (!cfg) throw new Error('SSO is not configured');
  // Manually pinned endpoints skip discovery entirely (for providers without
  // a /.well-known/openid-configuration document).
  if (cfg.authUrl && cfg.tokenUrl) {
    return {
      forIssuer: cfg.issuer,
      issuer: cfg.issuer,
      authorization_endpoint: cfg.authUrl,
      token_endpoint: cfg.tokenUrl,
      fetchedAt: Date.now(),
    };
  }
  if (discovery && discovery.forIssuer === cfg.issuer && Date.now() - discovery.fetchedAt < 60 * 60 * 1000) {
    return discovery;
  }
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (HTTP ${res.status})`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery document is missing endpoints');
  }
  discovery = {
    forIssuer: cfg.issuer,
    issuer: doc.issuer,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    fetchedAt: Date.now(),
  };
  return discovery;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function newFlow(redirectUri) {
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { state, nonce, verifier, challenge, redirectUri, expires: Date.now() + 10 * 60 * 1000 };
}

function authUrl(disco, cfg, flow) {
  const u = new URL(disco.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', flow.redirectUri);
  u.searchParams.set('scope', cfg.scopes || 'openid profile email');
  u.searchParams.set('state', flow.state);
  u.searchParams.set('nonce', flow.nonce);
  u.searchParams.set('code_challenge', flow.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

async function exchangeCode(disco, cfg, flow, code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: flow.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: flow.verifier,
  });
  const res = await fetch(disco.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (HTTP ${res.status})`);
  const tokens = await res.json();
  if (!tokens.id_token) throw new Error('The identity provider returned no ID token');
  return tokens.id_token;
}

// Decode + validate claims of an ID token received straight from the token endpoint.
function validateIdToken(idToken, disco, cfg, expectedNonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed ID token payload');
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== disco.issuer) throw new Error('ID token issuer mismatch');
  if (!aud.includes(cfg.clientId)) throw new Error('ID token audience mismatch');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw new Error('ID token expired');
  if (claims.nonce !== expectedNonce) throw new Error('ID token nonce mismatch');
  return claims;
}

// Map IdP claims to a valid Keeyo username, honoring the configured
// identifier claim first (default preferred_username), then falling back.
function usernameFrom(claims, cfg) {
  const primary = cfg && cfg.usernameClaim ? claims[cfg.usernameClaim] : claims.preferred_username;
  let raw = primary || claims.preferred_username || (claims.email ? String(claims.email).split('@')[0] : '') || claims.sub || '';
  let name = String(raw).toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 40);
  if (name.length < 3) name = `sso-${name}`.slice(0, 40);
  return name;
}

module.exports = { config, envLocked, setting, discover, newFlow, authUrl, exchangeCode, validateIdToken, usernameFrom };
