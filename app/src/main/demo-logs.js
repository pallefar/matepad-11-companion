'use strict';

const { makeDemoLogs } = require('./demo');

function seedDemoLogsIfNeeded(store, logger) {
  if (store.isDemo() && logger.ring.length === 0) {
    logger.seed(makeDemoLogs());
  }
}

module.exports = { seedDemoLogsIfNeeded };
