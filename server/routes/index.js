'use strict';

const express = require('express');
const { requireAuth, requireSession, enforceTokenScope } = require('../middleware/require-auth');

const SESSION_ONLY = ['/me/password', '/me/email', '/login-keys', '/account', '/tokens', '/users', '/admin'];

const api = express.Router();

api.use(require('./status'));
api.use(require('./sign-in'));
api.use(require('./sso'));
api.use(require('./email'));

api.use(requireAuth);
api.use(enforceTokenScope);
api.use(SESSION_ONLY, requireSession);

api.use(require('./account'));
api.use(require('./tokens'));
api.use(require('./users'));
api.use(require('./inventory'));
api.use(require('./keys'));
api.use(require('./attachments'));
api.use(require('./services'));
api.use(require('./registrations'));
api.use(require('./catalog'));

module.exports = api;
