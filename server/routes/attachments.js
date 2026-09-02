'use strict';

const express = require('express');
const { intId } = require('../lib/validate');
const attachments = require('../inventory/attachments');

const router = express.Router();

router.post('/keys/:id/attachments', (req, res) => {
  res.json(attachments.add(req.user.id, intId(req.params.id), req.body || {}));
});

router.get('/attachments/:id', (req, res) => {
  const file = attachments.read(req.user.id, intId(req.params.id));
  res.setHeader('Content-Type', file.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/["\\\r\n]/g, '_')}"`);
  res.send(Buffer.from(file.data));
});

router.delete('/attachments/:id', (req, res) => {
  attachments.remove(req.user.id, intId(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
