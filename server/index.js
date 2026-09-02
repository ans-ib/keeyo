'use strict';

const config = require('./config');
const { createApp } = require('./app');
const registry = require('./registry');

registry.init();

createApp().listen(config.port, config.host, () => {
  console.log(`Keeyo is running on http://${config.host}:${config.port} (data dir: ${config.dataDir})`);
});
