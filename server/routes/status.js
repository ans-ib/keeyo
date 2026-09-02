'use strict';

const express = require('express');
const sessions = require('../auth/sessions');
const users = require('../auth/users');
const sso = require('../auth/sso');
const reset = require('../auth/reset');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/status', (req, res) => {
  const cfg = sso.current();
  res.json({
    needsSetup: users.count() === 0,
    authenticated: !!sessions.currentUser(req),
    sso: cfg ? { enabled: true, name: cfg.name, passwordDisabled: !!cfg.disablePassword } : { enabled: false },
    resetAvailable: reset.available(),
  });
});

module.exports = router;
