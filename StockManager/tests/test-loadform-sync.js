// Editing (or deleting) a bill that is on a load form refreshes that load form's loaded
// quantities from the current bills, while keeping the return columns the user entered.
require('./sqlite-shim.js');
const path = require('path'), fs = require('fs'), os = require('os');
const db = require(path.join(__dirname, '..', 'database.js'));
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lfsync-')), 't.db'), {});

let f = 0;
const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); if (!ok) f++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`); };
const D = '2026-08-29';
[['A', 'Alpha'], ['B', 'Beta'], ['C', 'Gamma']].forEach(([c, n]) =>
  db.addProduct({ sku_code: c, name: n, price: 10, cost: 5, pcs_per_dozen: 12, stock_qty: 10000 }));
const P = Object.fromEntries(db.getAllProducts().map(p => [p.sku_code, p.id]));
const line = (lf, sku) => db.getLoadForm(lf.id).lines.find(l => l.sku_code === sku) || {};

// a bill with A(24) and B(12) on van V1, then a load form for it
const bill = db.createBill({ bill_date: D, customer_code: 'C1', customer_name: 'Shop', van: 'V1', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.A, kind: 'SALE', pcs: 24, unit_price: 10 }, { product_id: P.B, kind: 'SALE', pcs: 12, unit_price: 10 }] });
const free = db.listBillsForLoad({ date_from: D, date_to: D, van: 'V1' });
const lf = db.generateLoadForm({ van: 'V1', form_date: D, bill_ids: free.map(b => b.id) });
check('load form starts with A=24, B=12', [line(lf, 'A').pieces, line(lf, 'B').pieces], [24, 12]);
check('booking amount = bill total', db.getLoadForm(lf.id).booking_amount, bill.total);

// the driver records 3 returned-good pieces of A on the load form
const aLine = db.getLoadForm(lf.id).lines.find(l => l.sku_code === 'A');
db.updateLoadFormLine({ id: aLine.id, load2_pcs: 0, rtg_pcs: 3, dented_pcs: 0, leak_pcs: 0, replace_pcs: 0, scheme_note: '' });

// EDIT the bill: A 24->36, drop B, add C(12)
db.updateBill(bill.id, { bill_date: D, customer_code: 'C1', customer_name: 'Shop', van: 'V1', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.A, kind: 'SALE', pcs: 36, unit_price: 10 }, { product_id: P.C, kind: 'SALE', pcs: 12, unit_price: 10 }] });

check('load form now reflects the edit: A=36', line(lf, 'A').pieces, 36);
check('the returned-good pieces the user entered are kept', line(lf, 'A').rtg_pcs, 3);
check('removed product B is gone from the load form', db.getLoadForm(lf.id).lines.some(l => l.sku_code === 'B'), false);
check('added product C appears on the load form', line(lf, 'C').pieces, 12);
check('load form lines stay in numeric code order', db.getLoadForm(lf.id).lines.map(l => l.sku_code), ['A', 'C']);
check('booking amount refreshed to the edited total', db.getLoadForm(lf.id).booking_amount, db.getBillById(bill.id).total);

// a SECOND bill added to the same van + a fresh load form covering both, then edit one
const bill2 = db.createBill({ bill_date: D, customer_code: 'C2', customer_name: 'Shop 2', van: 'V2', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.A, kind: 'SALE', pcs: 10, unit_price: 10 }] });
const bill3 = db.createBill({ bill_date: D, customer_code: 'C3', customer_name: 'Shop 3', van: 'V2', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.A, kind: 'SALE', pcs: 5, unit_price: 10 }] });
const free2 = db.listBillsForLoad({ date_from: D, date_to: D, van: 'V2' });
const lf2 = db.generateLoadForm({ van: 'V2', form_date: D, bill_ids: free2.map(b => b.id) });
check('two-bill load form aggregates A=15', line(lf2, 'A').pieces, 15);
db.updateBill(bill2.id, { bill_date: D, customer_code: 'C2', customer_name: 'Shop 2', van: 'V2', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.A, kind: 'SALE', pcs: 20, unit_price: 10 }] });
check('editing one bill re-aggregates the shared load form (20 + 5)', line(lf2, 'A').pieces, 25);
// deleting a bill re-aggregates the load form to the remaining bill
db.deleteBill(bill3.id);
check('deleting a bill leaves the load form with only the other bill (20)', line(lf2, 'A').pieces, 20);
check('bill_count dropped to 1', db.getLoadForm(lf2.id).bill_count, 1);

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
process.exit(f ? 1 : 0);
