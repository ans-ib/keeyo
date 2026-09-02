'use strict';

const path = require('node:path');
const express = require('express');
const config = require('./config');
const { securityHeaders } = require('./middleware/security-headers');
const { rejectCrossSite } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/error-handler');
const api = require('./routes');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(securityHeaders);

  app.use('/api', rejectCrossSite);
  app.use('/api', api);
  app.use('/api', notFound);

  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
