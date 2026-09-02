'use strict';

const express = require('express');
const { ApiError } = require('../lib/errors');
const { intId, AAGUID_RE } = require('../lib/validate');
const { requireAdmin } = require('../middleware/require-auth');
const catalog = require('../inventory/catalog');
const registry = require('../registry');

const router = express.Router();

router.post('/catalog', (req, res) => res.json(catalog.add(req.user.id, req.body || {})));

router.put('/catalog/:id', (req, res) => {
  res.json(catalog.update(req.user.id, intId(req.params.id), req.body || {}));
});

router.delete('/catalog/:id', (req, res) => {
  catalog.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

router.get('/registry', (req, res) => res.json(registry.status()));

router.post('/registry/refresh', requireAdmin, (req, res, next) => {
  registry.refresh()
    .then((status) => res.json(status))
    .catch((err) => next(new ApiError(502, err.message)));
});

router.get('/aaguid/:aaguid', (req, res) => {
  const aaguid = String(req.params.aaguid || '').toLowerCase();
  if (!AAGUID_RE.test(aaguid)) throw new ApiError(400, 'Invalid AAGUID');
  const hit = registry.lookup(aaguid);
  res.json({ aaguid, found: !!hit, name: hit ? hit.name : '', icon: hit ? hit.icon : '' });
});

module.exports = router;
