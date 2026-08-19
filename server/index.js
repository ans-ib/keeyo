'use strict';

const path = require('node:path');
const express = require('express');
const { DATA_DIR } = require('./db');
const { router, ApiError } = require('./routes');
const mds = require('./mds');

mds.init();

const PORT = Number(process.env.PORT || 5390);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '16mb' }));

// Light CSRF protection: browsers send Sec-Fetch-Site on modern requests;
// same-site cookies + rejecting declared cross-site writes covers the rest.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Cross-site requests are not allowed' });
    return;
  }
  next();
});

app.use('/api', router);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// JSON error handler (must have 4 args for express to treat it as one)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, HOST, () => {
  console.log(`Keeyo is running on http://${HOST}:${PORT} (data dir: ${DATA_DIR})`);
});
