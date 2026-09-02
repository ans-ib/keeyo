'use strict';

const express = require('express');
const { intId } = require('../lib/validate');
const keys = require('../inventory/keys');
const events = require('../inventory/events');
const reveal = require('../inventory/reveal');

const router = express.Router();

router.post('/keys', (req, res) => res.json(keys.create(req.user.id, req.body || {})));

router.put('/keys/:id', (req, res) => {
  res.json(keys.update(req.user.id, intId(req.params.id), req.body || {}));
});

router.delete('/keys/:id', (req, res) => {
  keys.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

router.post('/keys/:id/verify', (req, res) => {
  res.json(keys.markVerified(req.user.id, intId(req.params.id)));
});

router.get('/keys/:id/events', (req, res) => {
  const id = intId(req.params.id);
  keys.get(req.user.id, id);
  res.json(events.listForKey(id));
});

router.post('/keys/:id/reveal-challenge', (req, res) => {
  res.json(reveal.begin(req.user.id, intId(req.params.id)));
});

router.post('/keys/:id/reveal', (req, res) => {
  res.json({ secret: reveal.complete(req.user.id, intId(req.params.id), req.body || {}, req.hostname) });
});

module.exports = router;
