// Runs database.js off the main thread — every call arrives as { id, method, args }.
const { parentPort } = require('worker_threads');
const db = require('./database');

parentPort.on('message', (m) => {
  const { id, method, args } = m || {};
  try {
    if (typeof db[method] !== 'function') throw new Error('Unknown database method: ' + method);
    parentPort.postMessage({ id, result: db[method](...(args || [])) });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
