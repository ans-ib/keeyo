'use strict';

const crypto = require('node:crypto');
const { ExpiringStore } = require('../lib/expiring-store');

const FLOW_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

const flows = new ExpiringStore({ ttlMs: FLOW_TTL_MS, maxEntries: 500 });
let discoveryCache = null;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

async function discover(cfg) {
  if (cfg.authUrl && cfg.tokenUrl) {
    return { issuer: cfg.issuer, authorization_endpoint: cfg.authUrl, token_endpoint: cfg.tokenUrl };
  }
  if (discoveryCache && discoveryCache.forIssuer === cfg.issuer && Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS) {
    return discoveryCache;
  }
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (HTTP ${res.status})`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery document is missing endpoints');
  }
  discoveryCache = {
    forIssuer: cfg.issuer,
    issuer: doc.issuer,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    fetchedAt: Date.now(),
  };
  return discoveryCache;
}

function beginFlow(redirectUri) {
  const verifier = b64url(crypto.randomBytes(48));
  const flow = {
    state: b64url(crypto.randomBytes(24)),
    nonce: b64url(crypto.randomBytes(24)),
    verifier,
    challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
    redirectUri,
  };
  flows.set(flow.state, flow);
  return flow;
}

function takeFlow(state) {
  return flows.take(String(state || ''));
}

function authorizationUrl(disco, cfg, flow) {
  const url = new URL(disco.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', flow.redirectUri);
  url.searchParams.set('scope', cfg.scopes || 'openid profile email');
  url.searchParams.set('state', flow.state);
  url.searchParams.set('nonce', flow.nonce);
  url.searchParams.set('code_challenge', flow.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
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

function validateIdToken(idToken, disco, cfg, expectedNonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed ID token payload');
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== disco.issuer) throw new Error('ID token issuer mismatch');
  if (!audience.includes(cfg.clientId)) throw new Error('ID token audience mismatch');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw new Error('ID token expired');
  if (claims.nonce !== expectedNonce) throw new Error('ID token nonce mismatch');
  return claims;
}

function usernameFrom(claims, cfg) {
  const primary = cfg && cfg.usernameClaim ? claims[cfg.usernameClaim] : claims.preferred_username;
  const raw = primary
    || claims.preferred_username
    || (claims.email ? String(claims.email).split('@')[0] : '')
    || claims.sub
    || '';
  let name = String(raw).toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 40);
  if (name.length < 3) name = `sso-${name}`.slice(0, 40);
  return name;
}

module.exports = { discover, beginFlow, takeFlow, authorizationUrl, exchangeCode, validateIdToken, usernameFrom };
