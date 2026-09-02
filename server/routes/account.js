'use strict';

const express = require('express');
const { ApiError } = require('../lib/errors');
const { intId } = require('../lib/validate');
const { hashPassword, verifyPassword } = require('../lib/password');
const challenges = require('../lib/challenges');
const webauthn = require('../lib/webauthn');
const users = require('../auth/users');
const sessions = require('../auth/sessions');
const mfa = require('../auth/mfa');

const router = express.Router();

router.get('/me', (req, res) => res.json(req.user));

router.put('/me/profile', (req, res) => {
  const body = req.body || {};
  const sso = users.isSso(req.user.id);
  let username = req.user.username;
  if (body.username !== undefined) {
    if (sso) {
      if (String(body.username).trim().toLowerCase() !== req.user.username) {
        throw new ApiError(400, 'Single sign-on accounts keep the username from the identity provider');
      }
    } else {
      username = users.rename(req.user.id, body.username);
    }
  }
  const email = body.email !== undefined ? users.setEmail(req.user.id, body.email) : req.user.email;
  res.json({ ok: true, username, email });
});

router.put('/me/email', (req, res) => {
  const email = users.setEmail(req.user.id, (req.body || {}).email);
  res.json({ ok: true, email });
});

router.put('/me/password', (req, res) => {
  const body = req.body || {};
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (next.length < 8) throw new ApiError(400, 'New password must be at least 8 characters');
  if (!verifyPassword(current, users.passwordHashOf(req.user.id))) throw new ApiError(400, 'Current password is wrong');
  users.setPasswordHash(req.user.id, hashPassword(next));
  sessions.revokeOthers(req.user.id, sessions.currentToken(req));
  res.json({ ok: true });
});

router.delete('/me', (req, res) => {
  const body = req.body || {};
  if (users.isSso(req.user.id)) {
    if (String(body.confirm || '').trim().toLowerCase() !== req.user.username) {
      throw new ApiError(400, 'Type your username to confirm');
    }
  } else if (!verifyPassword(typeof body.password === 'string' ? body.password : '', users.passwordHashOf(req.user.id))) {
    throw new ApiError(400, 'Password is wrong');
  }
  const result = users.removeAccount(req.user.id, { deleteMembers: body.deleteMembers === true });
  sessions.destroy(req, res);
  res.json({ ok: true, ...result });
});

router.get('/login-keys', (req, res) => res.json(mfa.listLoginKeys(req.user.id)));

router.post('/login-keys/challenge', (req, res) => {
  res.json(challenges.issue('enroll', { userId: req.user.id }));
});

router.post('/login-keys', (req, res) => {
  const body = req.body || {};
  const entry = challenges.consume(body.token, 'enroll');
  if (entry.userId !== req.user.id) throw new ApiError(403, 'Challenge belongs to another session');
  const fields = mfa.parseLoginKey(body);
  webauthn.verifyClientData(Buffer.from(String(body.clientDataJSON || ''), 'base64url'), {
    type: 'webauthn.create',
    challenge: entry.challenge,
    hostname: req.hostname,
  });
  res.json(mfa.enrollLoginKey(req.user.id, fields));
});

router.delete('/login-keys/:id', (req, res) => {
  mfa.removeLoginKey(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

router.get('/account/mfa', (req, res) => res.json(mfa.status(req.user.id)));

router.post('/account/totp/setup', (req, res) => res.json(mfa.beginTotpSetup(req.user)));

router.post('/account/totp/confirm', (req, res) => {
  mfa.confirmTotpSetup(req.user.id, (req.body || {}).code);
  res.json({ ok: true });
});

router.delete('/account/totp', (req, res) => {
  mfa.disableTotp(req.user.id);
  res.json({ ok: true });
});

router.post('/account/recovery-codes', (req, res) => {
  res.json({ codes: mfa.generateRecoveryCodes(req.user.id) });
});

module.exports = router;
