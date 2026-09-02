'use strict';

const sessions = require('../auth/sessions');
const users = require('../auth/users');
const accessTokens = require('../auth/access-tokens');

function requireAuth(req, res, next) {
  const bearer = accessTokens.fromHeader(req.headers.authorization);
  if (bearer) {
    const user = accessTokens.authenticate(bearer);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired access token' });
      return;
    }
    req.user = user;
    next();
    return;
  }
  const user = sessions.currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in', needsSetup: users.count() === 0 });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function requireSession(req, res, next) {
  if (req.user && req.user.token) {
    res.status(403).json({ error: 'Not available to access tokens — sign in to manage this' });
    return;
  }
  next();
}

function enforceTokenScope(req, res, next) {
  if (req.user && req.user.token && req.user.token.scope === 'read' && req.method !== 'GET') {
    res.status(403).json({ error: 'This access token is read-only' });
    return;
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSession, enforceTokenScope };
