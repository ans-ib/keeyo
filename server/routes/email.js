'use strict';

const express = require('express');
const { ApiError } = require('../lib/errors');
const { asyncRoute } = require('../lib/async-route');
const { requireAuth, requireSession, requireAdmin } = require('../middleware/require-auth');
const rateLimit = require('../auth/rate-limit');
const emailCfg = require('../auth/email');
const reset = require('../auth/reset');

const router = express.Router();

router.post('/reset/request', asyncRoute(async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit.allowed(ip)) throw new ApiError(429, 'Too many attempts. Try again in a few minutes.');
  rateLimit.recordFailure(ip);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    await reset.request((req.body || {}).identifier, baseUrl);
  } catch (err) {
    console.error('password reset email failed:', err.message);
  }
  res.json({ ok: true });
}));

router.post('/reset/complete', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit.allowed(ip)) throw new ApiError(429, 'Too many attempts. Try again in a few minutes.');
  const body = req.body || {};
  try {
    reset.complete(body.token, body.password);
  } catch (err) {
    rateLimit.recordFailure(ip);
    throw err;
  }
  rateLimit.clear(ip);
  res.json({ ok: true });
});

router.get('/admin/smtp', requireAuth, requireSession, requireAdmin, (req, res) => res.json(emailCfg.adminView()));

router.put('/admin/smtp', requireAuth, requireSession, requireAdmin, (req, res) => {
  res.json({ ok: true, ...emailCfg.update(req.body || {}) });
});

router.post('/admin/smtp/test', requireAuth, requireSession, requireAdmin, asyncRoute(async (req, res) => {
  const to = String((req.body || {}).to || req.user.email || '');
  if (!to) throw new ApiError(400, 'Set your account email first, or provide an address');
  await emailCfg.send(to, 'Keeyo test email', 'Email from Keeyo works. Nothing else to see here.');
  res.json({ ok: true });
}));

module.exports = router;
