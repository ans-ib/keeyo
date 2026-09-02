'use strict';

const path = require('node:path');

function flag(name) {
  const value = process.env[name];
  return value === '1' || value === 'true';
}

const config = {
  port: Number(process.env.PORT || 5390),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  trustProxy: flag('TRUST_PROXY'),

  jsonBodyLimit: '16mb',

  session: {
    cookieName: 'keeyo_session',
    ttlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  },

  mfaDisabled: flag('KEEYO_DISABLE_MFA'),

  registry: {
    offline: flag('KEEYO_OFFLINE'),
    mdsUrl: process.env.MDS_URL || 'https://mds3.fidoalliance.org/',
    communityUrl: process.env.AAGUID_COMMUNITY_URL
      || 'https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/main/combined_aaguid.json',
    refreshDays: Number(process.env.REGISTRY_REFRESH_DAYS || 7),
  },
};

function oidcFromEnv() {
  const issuer = (process.env.KEEYO_OIDC_ISSUER || '').replace(/\/+$/, '');
  const clientId = process.env.KEEYO_OIDC_CLIENT_ID || '';
  const clientSecret = process.env.KEEYO_OIDC_CLIENT_SECRET || '';
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
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

function smtpFromEnv() {
  const host = process.env.KEEYO_SMTP_HOST || '';
  const from = process.env.KEEYO_SMTP_FROM || '';
  if (!host || !from) return null;
  const security = ['tls', 'starttls', 'none'].includes(process.env.KEEYO_SMTP_SECURITY)
    ? process.env.KEEYO_SMTP_SECURITY
    : 'starttls';
  return {
    host,
    port: Number(process.env.KEEYO_SMTP_PORT) || (security === 'tls' ? 465 : 587),
    security,
    user: process.env.KEEYO_SMTP_USER || '',
    pass: process.env.KEEYO_SMTP_PASS || '',
    from,
    fromName: process.env.KEEYO_SMTP_FROM_NAME || 'Keeyo',
    envLocked: true,
  };
}

module.exports = { ...config, oidcFromEnv, smtpFromEnv };
