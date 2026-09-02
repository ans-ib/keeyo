'use strict';

function rejectCrossSite(req, res, next) {
  if (req.method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Cross-site requests are not allowed' });
    return;
  }
  next();
}

module.exports = { rejectCrossSite };
