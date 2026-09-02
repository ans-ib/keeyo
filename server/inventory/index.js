'use strict';

const keys = require('./keys');
const services = require('./services');
const registrations = require('./registrations');
const catalog = require('./catalog');
const attachments = require('./attachments');

function snapshot(userId) {
  return {
    keys: keys.list(userId),
    services: services.list(userId),
    registrations: registrations.list(userId),
    catalog: catalog.list(userId),
    attachments: attachments.list(userId),
  };
}

module.exports = { snapshot };
