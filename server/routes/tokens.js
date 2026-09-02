'use strict';

const express = require('express');
const { intId } = require('../lib/validate');
const accessTokens = require('../auth/access-tokens');

const router = express.Router();

router.get('/tokens', (req, res) => res.json(accessTokens.list(req.user.id)));

router.post('/tokens', (req, res) => res.json(accessTokens.create(req.user.id, req.body || {})));

router.delete('/tokens/:id', (req, res) => {
  accessTokens.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
