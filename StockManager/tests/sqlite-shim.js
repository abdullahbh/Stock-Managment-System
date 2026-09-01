// The app's own node_modules ships an Electron-ABI better-sqlite3 that plain node
// cannot dlopen; point every require of it at the copy installed here.
const Module = require('module');
const real = require.resolve('better-sqlite3');
const _resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return _resolve.call(this, request === 'better-sqlite3' ? real : request, ...rest);
};
