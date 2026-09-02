// Runs every StockManager test suite and prints a pass/fail summary.
//   node tests/run-all.js          (from the app root, or from tests/)
// DB suites load the app's database.js through a node-ABI better-sqlite3 (sqlite-shim.js);
// UI suites drive the real renderer (renderer-dist/index.html) in jsdom.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const list = fs.readdirSync(HERE).filter(f => /^test-.+\.js$/.test(f) || f === 'preview-check.js').sort();
// UI suites use jsdom and must NOT preload the sqlite shim; everything else is a DB suite.
const UI = new Set(['test-billrate.js', 'test-freegroup-ui.js', 'test-editbill-rate.js', 'test-ui-forms.js', 'test-van-dropdown.js', 'test-workingday-ui.js', 'test-purchase-edit-ui.js']);

let failed = 0;
const results = [];
for (const f of list) {
  const args = UI.has(f) ? [f] : ['-r', './sqlite-shim.js', f];
  const started = process.hrtime.bigint();
  let ok = true, tail = '';
  try {
    const out = execFileSync(process.execPath, args, { cwd: HERE, encoding: 'utf8',
      env: Object.assign({}, process.env, { NODE_PATH: path.join(HERE, 'node_modules') }) });
    tail = (out.trim().split('\n').pop() || '').trim();
    if (!/ALL PASS|PREVIEW MATCHES/.test(tail)) { ok = false; }
  } catch (e) {
    ok = false;
    tail = ((e.stdout || '') + (e.stderr || '')).trim().split('\n').filter(Boolean).pop() || e.message;
  }
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  if (!ok) failed++;
  results.push({ f, ok, tail, ms });
  console.log(`${ok ? ' PASS ' : ' FAIL '} ${f.padEnd(24)} ${tail}  (${ms}ms)`);
}

console.log('\n' + '─'.repeat(60));
console.log(`${results.length} suites · ${results.length - failed} passed · ${failed} failed`);
if (failed) { console.log('\nFailing suites:'); results.filter(r => !r.ok).forEach(r => console.log('  ' + r.f + '  →  ' + r.tail)); }
process.exit(failed ? 1 : 0);
