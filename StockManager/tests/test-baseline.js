// Baseline harness: exercise database.js billing against a temp DB.
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_JS = __dirname + '/../database.js';
const db = require(DB_JS);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smtest-'));
const dbPath = path.join(tmp, 'test.db');
db.initialize(dbPath, { company_name: 'Test Co' });

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}

// product: 100 pcs stock, price 10
db.addProduct({ sku_code: 'P1', name: 'Prod One', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 1000 });
const prod = db.getAllProducts()[0];

// flat trade-offer scheme: 150 off bills >= 500
db.addScheme({ name: 'Flat150', type: 'TRADE_OFFER', offer_amount: 150, min_bill: 500, active: 1 });

// bill: 60 pcs * 10 = 600 subtotal, tax 10% = 60, manual TO 20, line TO 5, discount 25
const r1 = db.createBill({
  bill_date: '2026-08-29', customer_code: 'C1', customer_name: 'Shop A', van: 'V1',
  tax_pct: 10, discount: 25, manual_trade_offer: 20,
  items: [{ product_id: prod.id, kind: 'SALE', pcs: 60, unit_price: 10, trade_offer: 5 }],
});
check('subtotal', r1.subtotal, 600);
check('trade_offer (manual20 + line5 + flat150)', r1.trade_offer, 175);
check('total (600 + 60tax - 175TO - 25disc)', r1.total, 460);

// scheme below threshold: bill of 300 -> no scheme TO
const r2 = db.createBill({
  bill_date: '2026-08-29', customer_code: 'C2', customer_name: 'Shop B', van: 'V1',
  tax_pct: 0, discount: 0, manual_trade_offer: 0,
  items: [{ product_id: prod.id, kind: 'SALE', pcs: 30, unit_price: 10 }],
});
check('below-threshold TO', r2.trade_offer, 0);
check('below-threshold total', r2.total, 300);

// stock decremented: 1000 - 60 - 30
check('stock after bills', db.getAllProducts()[0].stock_qty, 910);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
