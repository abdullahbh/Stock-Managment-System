// A bill-linked return may only credit the product that was actually on that bill line,
// at no more than the price the shop was charged, and never at a negative rate.
require('./sqlite-shim.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require(__dirname + '/../database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smrg-')), 'test.db'), {});

let failures = 0;
const check = (name, cond) => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); };
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

db.addProduct({ sku_code: 'ALPHA', name: 'Alpha', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 1000 });
db.addProduct({ sku_code: 'GAMMA', name: 'Gamma', price: 300, cost: 200, pcs_per_dozen: 12, stock_qty: 1000 });
const alpha = db.getAllProducts().find(p => p.sku_code === 'ALPHA');
const gamma = db.getAllProducts().find(p => p.sku_code === 'GAMMA');

// bill carries 100 pcs of Alpha only
const b = db.createBill({ bill_date: D, customer_code: 'C1', customer_name: 'Shop A', van: 'V1',
  tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: alpha.id, kind: 'SALE', pcs: 100, unit_price: 10 }] });
const billed = db.getBillById(b.id).items.find(i => i.product_id === alpha.id);
const gammaOpen = db.getAllProducts().find(p => p.id === gamma.id).stock_qty;
const ret = (over) => Object.assign({ return_date: D, prefix: 'HR', bill_id: b.id, bill_number: b.bill_number,
  customer_code: 'C1', customer_name: 'Shop A', van: 'V1', tax_pct: 0,
  items: [{ bill_item_id: billed.id, product_id: alpha.id, kind: 'GOOD', pcs: 10 }] }, over || {});

// ── the product must match the bill line it names ────────────────
checkThrows('a valid bill line cannot credit a different product',
  () => db.createSalesReturn(ret({ items: [{ bill_item_id: billed.id, product_id: gamma.id, kind: 'GOOD', pcs: 100 }] })),
  'not on bill');
check('no stock was conjured for the other product',
  db.getAllProducts().find(p => p.id === gamma.id).stock_qty === gammaOpen);
check('nothing was written', db.getAllSalesReturns({}).length === 0);

checkThrows('a line with no bill line is refused on a bill-linked return',
  () => db.createSalesReturn(ret({ items: [{ product_id: alpha.id, kind: 'GOOD', pcs: 5 }] })), 'not on bill');
checkThrows('a bill line from another bill is refused',
  () => db.createSalesReturn(ret({ items: [{ bill_item_id: 999999, product_id: alpha.id, kind: 'GOOD', pcs: 5 }] })), 'not on bill');

// ── the rate can never exceed what was charged, nor go negative ───
const over = db.createSalesReturn(ret({ items: [{ bill_item_id: billed.id, product_id: alpha.id, kind: 'GOOD', pcs: 10, unit_price: 10000 }] }));
check('an inflated rate is capped at the billed rate (10 x 10)', over.total === 100);
const neg = db.createSalesReturn(ret({ items: [{ bill_item_id: billed.id, product_id: alpha.id, kind: 'GOOD', pcs: 10, unit_price: -50 }] }));
check('a negative rate credits nothing rather than adding to sales', neg.total === 0);
check('both returns still restocked their pieces',
  db.getAllProducts().find(p => p.id === alpha.id).stock_qty === 1000 - 100 + 20);

// ── the honest path still works ──────────────────────────────────
const good = db.createSalesReturn(ret({ items: [{ bill_item_id: billed.id, product_id: alpha.id, kind: 'GOOD', pcs: 5, unit_price: 10 }] }));
check('a correct return is accepted', good.total === 50);

// ── van-first bulk returns are unaffected by the bill-line rule ───
const bulk = db.createSalesReturn({ return_date: D, prefix: 'HR', van: 'V1', tax_pct: 0,
  items: [{ product_id: gamma.id, kind: 'GOOD', pcs: 4, unit_price: 300 }] });
check('a van-first bulk return still accepts bare lines', bulk.total === 1200);
check('bulk return restocked', db.getAllProducts().find(p => p.id === gamma.id).stock_qty === gammaOpen + 4);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
