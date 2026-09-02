'use strict';

const express = require('express');
const { ApiError } = require('../lib/errors');
const { intId } = require('../lib/validate');
const { hashPassword } = require('../lib/password');
const { requireAdmin } = require('../middleware/require-auth');
const users = require('../auth/users');

const router = express.Router();

router.use('/users', requireAdmin);

router.get('/users', (req, res) => res.json(users.list()));

router.post('/users', (req, res) => {
  const body = req.body || {};
  const { username, password } = users.parseCredentials(body);
  if (users.findByUsername(username)) throw new ApiError(400, 'That username is taken');
  users.create({ username, passwordHash: hashPassword(password), isAdmin: !!body.isAdmin });
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = intId(req.params.id);
  if (id === req.user.id) throw new ApiError(400, 'You cannot delete your own account');
  if (!users.exists(id)) throw new ApiError(404, 'User not found');
  users.remove(id);
  res.json({ ok: true });
});

module.exports = router;
