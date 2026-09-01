// The load form lists its products by CODE in numeric order (2, 4, 12, 13, 123, 124) —
// not as text (12, 123, 124, 13, 2, 4), which is how the printout came out wrong.
require('./sqlite-shim.js');
const path = require('path'), fs = require('fs'), os = require('os');
const db = require(require('path').join(__dirname, '..', 'database.js'));
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lford-')), 't.db'), {});

let f = 0;
const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); if (!ok) f++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`); };
const D = '2026-08-29';

// products with codes that expose text-vs-number sorting
const codes = ['12', '123', '124', '13', '15', '18', '2', '21', '22', '36', '4'];
codes.forEach((c, i) => db.addProduct({ sku_code: c, name: 'Product ' + c, price: 10 + i, cost: 5, pcs_per_dozen: 12, stock_qty: 5000 }));
const P = Object.fromEntries(db.getAllProducts().map(p => [p.sku_code, p.id]));

// one bill on van V1 containing every product, so the load form aggregates them all
db.createBill({ bill_date: D, customer_code: 'C1', customer_name: 'Shop A', van: 'V1', tax_pct: 0, discount: 0, scheme_off: true,
  items: codes.map(c => ({ product_id: P[c], kind: 'SALE', pcs: 12, unit_price: 10 })) });

const free = db.listBillsForLoad({ date_from: D, date_to: D, van: 'V1' });
const lf = db.generateLoadForm({ van: 'V1', form_date: D, bill_ids: free.map(b => b.id) });
const got = db.getLoadForm(lf.id).lines.map(l => l.sku_code);

check('load form lines are in NUMERIC code order',
  got, ['2', '4', '12', '13', '15', '18', '21', '22', '36', '123', '124']);

// a non-numeric code sorts sensibly alongside numeric ones (numeric first, then text)
db.addProduct({ sku_code: 'A9', name: 'Alpha', price: 9, cost: 4, pcs_per_dozen: 12, stock_qty: 100 });
db.createBill({ bill_date: D, customer_code: 'C2', customer_name: 'Shop B', van: 'V2', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: db.getAllProducts().find(p => p.sku_code === 'A9').id, kind: 'SALE', pcs: 6, unit_price: 9 },
          { product_id: P['2'], kind: 'SALE', pcs: 6, unit_price: 10 },
          { product_id: P['13'], kind: 'SALE', pcs: 6, unit_price: 10 }] });
const free2 = db.listBillsForLoad({ date_from: D, date_to: D, van: 'V2' });
const lf2 = db.generateLoadForm({ van: 'V2', form_date: D, bill_ids: free2.map(b => b.id) });
const got2 = db.getLoadForm(lf2.id).lines.map(l => l.sku_code);
check('numeric codes come before an alpha code, numbers still in order', got2, ['2', '13', 'A9']);

// the Products list uses the same numeric-code order
check('products list is in numeric code order',
  db.getAllProducts().map(p => p.sku_code).slice(0, 11),
  ['2', '4', '12', '13', '15', '18', '21', '22', '36', '123', '124']);

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
process.exit(f ? 1 : 0);
