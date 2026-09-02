'use strict';

const express = require('express');
const inventory = require('../inventory');
const backup = require('../inventory/backup');

const router = express.Router();

router.get('/data', (req, res) => res.json(inventory.snapshot(req.user.id)));

router.get('/export', (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="keeyo-backup-${date}.json"`);
  res.json(backup.exportFor(req.user.id));
});

router.post('/import', (req, res) => {
  backup.importFor(req.user.id, (req.body || {}).data);
  res.json({ ok: true });
});

module.exports = router;
