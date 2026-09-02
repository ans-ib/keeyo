'use strict';

const express = require('express');
const { intId } = require('../lib/validate');
const registrations = require('../inventory/registrations');

const router = express.Router();

router.post('/registrations', (req, res) => res.json(registrations.create(req.user.id, req.body || {})));

router.put('/registrations/:id', (req, res) => {
  res.json(registrations.update(req.user.id, intId(req.params.id), req.body || {}));
});

router.delete('/registrations/:id', (req, res) => {
  registrations.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
