'use strict';

const express = require('express');
const { intId } = require('../lib/validate');
const { asyncRoute } = require('../lib/async-route');
const services = require('../inventory/services');
const icons = require('../inventory/icons');

const router = express.Router();

router.get('/icons/search', asyncRoute(async (req, res) => {
  res.json({ results: await icons.search(String(req.query.source || ''), req.query.q) });
}));

router.post('/services', (req, res) => res.json(services.create(req.user.id, req.body || {})));

router.put('/services/:id', (req, res) => {
  res.json(services.update(req.user.id, intId(req.params.id), req.body || {}));
});

router.delete('/services/:id', (req, res) => {
  services.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
