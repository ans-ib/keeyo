'use strict';

const express = require('express');
const config = require('../config');
const { ApiError } = require('../lib/errors');
const { str } = require('../lib/validate');
const { hashPassword, verifyPassword } = require('../lib/password');
const challenges = require('../lib/challenges');
const webauthn = require('../lib/webauthn');
const users = require('../auth/users');
const sessions = require('../auth/sessions');
const rateLimit = require('../auth/rate-limit');
const mfa = require('../auth/mfa');
const sso = require('../auth/sso');

const router = express.Router();

function throttle(req) {
  const ip = req.ip || 'unknown';
  if (!rateLimit.allowed(ip)) throw new ApiError(429, 'Too many failed attempts. Try again in a few minutes.');
  return ip;
}

function finishSignIn(req, res, ip, userId, extra = {}) {
  rateLimit.clear(ip);
  sessions.create(req, res, userId);
  res.json({ ok: true, ...extra });
}

router.post('/setup', (req, res) => {
  if (users.count() > 0) throw new ApiError(403, 'Setup has already been completed');
  const { username, password } = users.parseCredentials(req.body || {});
  const id = users.create({ username, passwordHash: hashPassword(password), isAdmin: true });
  sessions.create(req, res, id);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const ip = throttle(req);
  const body = req.body || {};
  const username = str(body.username, { label: 'Username', max: 40 }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = users.findByUsername(username);

  const cfg = sso.current();
  const passwordOk = !!user && verifyPassword(password, user.passwordHash);
  if (cfg && cfg.disablePassword && !(passwordOk && user.isAdmin)) {
    rateLimit.recordFailure(ip);
    throw new ApiError(403, `Password sign-in is disabled — use "${cfg.name}" instead`);
  }
  if (!passwordOk) {
    rateLimit.recordFailure(ip);
    throw new ApiError(401, 'Wrong username or password');
  }

  const methods = config.mfaDisabled ? null : mfa.methodsFor(user.id);
  if (methods) {
    const { token, challenge } = challenges.issue('mfa', { userId: user.id });
    res.json({
      mfaRequired: true,
      mfaToken: token,
      challenge,
      credentialIds: methods.credentialIds,
      methods: { webauthn: methods.webauthn, totp: methods.totp, recovery: methods.recovery },
    });
    return;
  }
  finishSignIn(req, res, ip, user.id);
});

router.post('/login/mfa', (req, res) => {
  const ip = throttle(req);
  const body = req.body || {};

  if (body.code !== undefined) {
    const entry = challenges.peek(body.mfaToken, 'mfa');
    if (!mfa.verifyTotpLogin(entry.userId, body.code)) {
      rateLimit.recordFailure(ip);
      throw new ApiError(401, 'Wrong code — check the app and try again');
    }
    challenges.consume(body.mfaToken, 'mfa');
    finishSignIn(req, res, ip, entry.userId);
    return;
  }

  if (body.recoveryCode !== undefined) {
    const entry = challenges.peek(body.mfaToken, 'mfa');
    if (!mfa.consumeRecoveryCode(entry.userId, body.recoveryCode)) {
      rateLimit.recordFailure(ip);
      throw new ApiError(401, 'That recovery code is not valid — each one works only once');
    }
    challenges.consume(body.mfaToken, 'mfa');
    finishSignIn(req, res, ip, entry.userId, { recoveryRemaining: mfa.recoveryStatus(entry.userId).remaining });
    return;
  }

  const entry = challenges.consume(body.mfaToken, 'mfa');
  const credential = mfa.findLoginCredential(entry.userId, body.credentialId);
  if (!credential) {
    rateLimit.recordFailure(ip);
    throw new ApiError(403, 'That security key is not enrolled for this account');
  }
  try {
    webauthn.verifyAssertion({ hostname: req.hostname, credential, challenge: entry.challenge, body });
  } catch (err) {
    rateLimit.recordFailure(ip);
    throw err;
  }
  finishSignIn(req, res, ip, entry.userId);
});

router.post('/logout', (req, res) => {
  const via = sessions.currentVia(req);
  sessions.destroy(req, res);
  const cfg = sso.current();
  const redirect = via === 'sso' && cfg && cfg.logoutUrl ? cfg.logoutUrl : undefined;
  res.json({ ok: true, redirect });
});

module.exports = router;
