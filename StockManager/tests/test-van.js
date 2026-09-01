// Van is compulsory on bills: no bill may be created or updated without one.
require('./sqlite-shim.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require(__dirname + '/../database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smvan-')), 'test.db'), {});

let failures = 0;
function check(name, cond) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
}
function checkThrows(name, fn, msgPart) {
  try { fn(); failures++; console.log(`FAIL ${name}  (did not throw)`); }
  catch (e) {
    const ok = !msgPart || String(e.message).toLowerCase().includes(msgPart.toLowerCase());
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  msg=${e.message}`}`);
  }
}
const t = new Date();
const D = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

db.addProduct({ sku_code: 'P1', name: 'Prod One', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 5000 });
const p1 = db.getAllProducts()[0];
const bill = (over) => Object.assign({
  bill_date: D, customer_code: 'C1', customer_name: 'Shop A', van: 'VAN 01',
  tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: p1.id, kind: 'SALE', pcs: 10, unit_price: 10 }],
}, over || {});

// ── create ──────────────────────────────────────────────────────
checkThrows('create rejects a missing van', () => db.createBill(bill({ van: undefined })), 'van');
checkThrows('create rejects an empty van', () => db.createBill(bill({ van: '' })), 'van');
checkThrows('create rejects a blank (spaces) van', () => db.createBill(bill({ van: '   ' })), 'van');
check('no bill was written by the rejected calls', db.getAllBills({}).length === 0);
check('stock untouched by the rejected calls', db.getAllProducts()[0].stock_qty === 5000);

const ok = db.createBill(bill({ customer_code: 'C1' }));
check('create succeeds with a van', !!ok.id);
check('van stored on the bill', db.getBillById(ok.id).van === 'VAN 01');
check('van remembered for the dropdown', db.listMasters('van').some(m => m.name === 'VAN 01'));

// ── update ──────────────────────────────────────────────────────
const asEdit = (over) => bill(Object.assign({ customer_code: 'C1', customer_name: 'Shop A' }, over || {}));
checkThrows('update rejects a missing van', () => db.updateBill(ok.id, asEdit({ van: undefined })), 'van');
checkThrows('update rejects a blank van', () => db.updateBill(ok.id, asEdit({ van: '  ' })), 'van');
check('bill still has its original van after rejected updates', db.getBillById(ok.id).van === 'VAN 01');
check('items survived the rejected updates', (db.getBillById(ok.id).items || []).length === 1);
check('stock survived the rejected updates', db.getAllProducts()[0].stock_qty === 4990);

const up = db.updateBill(ok.id, asEdit({ van: 'VAN 02' }));
check('update succeeds with a van', !!up.id);
check('van changed on the bill', db.getBillById(ok.id).van === 'VAN 02');

// ── the same-van-same-day duplicate guard still fires ────────────
checkThrows('duplicate shop+van+day still blocked',
  () => db.createBill(bill({ customer_code: 'C1', van: 'VAN 02' })), 'already billed');

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
