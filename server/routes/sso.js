'use strict';

const express = require('express');
const { ApiError } = require('../lib/errors');
const { asyncRoute } = require('../lib/async-route');
const { requireAuth, requireSession, requireAdmin } = require('../middleware/require-auth');
const users = require('../auth/users');
const sessions = require('../auth/sessions');
const oidc = require('../auth/oidc');
const sso = require('../auth/sso');

const router = express.Router();

function redirectWithError(res, message) {
  res.redirect('/?ssoError=' + encodeURIComponent(String(message).slice(0, 200)));
}

router.get('/oidc/login', asyncRoute(async (req, res) => {
  const cfg = sso.current();
  if (!cfg) throw new ApiError(404, 'SSO is not configured');
  if (users.count() === 0) {
    redirectWithError(res, 'Complete the first-run setup before signing in with SSO');
    return;
  }
  const disco = await oidc.discover(cfg);
  const flow = oidc.beginFlow(`${req.protocol}://${req.get('host')}/api/oidc/callback`);
  res.redirect(oidc.authorizationUrl(disco, cfg, flow));
}));

router.get('/oidc/callback', async (req, res) => {
  const cfg = sso.current();
  if (!cfg) {
    res.redirect('/');
    return;
  }
  try {
    const flow = oidc.takeFlow(req.query.state);
    if (!flow) throw new Error('Sign-in attempt expired — try again');
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const code = String(req.query.code || '');
    if (!code) throw new Error('The identity provider returned no authorization code');

    const disco = await oidc.discover(cfg);
    const idToken = await oidc.exchangeCode(disco, cfg, flow, code);
    const claims = oidc.validateIdToken(idToken, disco, cfg, flow.nonce);
    const userId = sso.resolveUser(claims, cfg);
    sessions.create(req, res, userId, 'sso');
    res.redirect('/');
  } catch (err) {
    redirectWithError(res, err.message || 'SSO sign-in failed');
  }
});

router.get('/admin/sso', requireAuth, requireSession, requireAdmin, (req, res) => res.json(sso.adminView()));

router.put('/admin/sso', requireAuth, requireSession, requireAdmin, (req, res) => {
  res.json({ ok: true, ...sso.update(req.body || {}) });
});

module.exports = router;
