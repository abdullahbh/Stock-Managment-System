// FEATURE 1: the "working day" that new entries default to, only advancing when the owner
// closes it, and off which new bills / purchases / returns roll forward instead of being blocked.
require('./sqlite-shim.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require(__dirname + '/../database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smwday-')), 'test.db'), {});

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}
function checkThrows(name, fn, msgPart) {
  try { fn(); failures++; console.log(`FAIL ${name}  (did not throw)`); }
  catch (e) {
    const ok = !msgPart || String(e.message).toLowerCase().includes(msgPart.toLowerCase());
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  msg=${e.message}`}`);
  }
}
// LOCAL date helpers, matching database.js (NOT toISOString, which is UTC)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const stem = (s) => s.replace(/-/g, '');

const T0 = ymd(new Date());            // local today
const T1 = addDays(T0, 1);

db.addProduct({ sku_code: 'P1', name: 'Prod One', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 100000 });
const p1 = db.getAllProducts()[0];
const bill = (over) => Object.assign({
  prefix: 'WD', customer_code: 'C1', customer_name: 'Shop A', van: 'VAN 01',
  items: [{ product_id: p1.id, kind: 'SALE', pcs: 10, unit_price: 10 }],
}, over || {});

// ── the working day starts at local today ────────────────────────
check('getCurrentDay initializes to local today', db.getCurrentDay(), T0);
check('getSettings().current_day present', db.getSettings().current_day, T0);

// ── a new bill with NO date lands on the working day ─────────────
const b0 = db.createBill(bill({ customer_code: 'C1', van: 'VAN 01' }));   // no bill_date
check('new bill with no date lands on the working day', b0.bill_date, T0);
check('stored bill_date matches the working day', db.getBillById(b0.id).bill_date, T0);
check('bill number stems from the working day', b0.bill_number, `WD-${stem(T0)}-001`);

// ── closing the working day advances it and locks the old one ────
const closed = db.closeDay(T0);
check('closeDay returns the new working day', closed.current_day, T1);
check('the old day is now closed', db.isDayClosed(T0), true);
check('getCurrentDay is now the next day', db.getCurrentDay(), T1);

// ── a new bill after closing lands on the NEW working day ────────
const b1 = db.createBill(bill({ customer_code: 'C2', van: 'VAN 02' }));   // no bill_date
check('new bill lands on the new working day, not the closed one', b1.bill_date, T1);
check('it did not land on the closed day', b1.bill_date !== T0, true);

// ── re-opening an earlier day resumes it as the working day ──────
const reopened = db.openDay(T0);
check('openDay on the last-closed day moves the working day back to it', reopened.current_day, T0);
check('getCurrentDay resumed the earlier day', db.getCurrentDay(), T0);

// ── a bill on an explicitly CLOSED date ROLLS FORWARD (never throws) ──
db.closeDay('2020-05-05');
const rolled = db.createBill(bill({ bill_date: '2020-05-05', customer_code: 'C9', van: 'VAN 09' }));
check('closed-date bill rolls to the next open day (no throw)', rolled.bill_date, '2020-05-06');
check('the returned bill_date is the rolled date', db.getBillById(rolled.id).bill_date, '2020-05-06');
check('the bill number stem matches the effective (rolled) date', rolled.bill_number, `WD-20200506-001`);

// ── but a locked day still refuses edits and deletes ────────────
db.closeDay('2020-05-06');   // lock the day the rolled bill actually landed on
checkThrows('deleteBill on a closed day still throws', () => db.deleteBill(rolled.id), 'closed');
checkThrows('updateBill on a closed day still throws',
  () => db.updateBill(rolled.id, bill({ bill_date: '2020-05-06', customer_code: 'C9', van: 'VAN 09' })), 'closed');
check('the locked bill survived the rejected delete/update', !!db.getBillById(rolled.id), true);

// ── createPurchase rolls forward off a closed date ──────────────
db.closeDay('2021-03-03');
const pu = db.createPurchase({ purchase_date: '2021-03-03', supplier: 'S', items: [{ product_id: p1.id, pcs: 100, unit_cost: 6 }] });
check('createPurchase rolls forward off a closed date', pu.purchase_date, '2021-03-04');
check('stored purchase_date is the rolled date', db.getPurchaseById(pu.id).purchase_date, '2021-03-04');

// ── createSalesReturn rolls forward off a closed date ───────────
db.closeDay('2021-06-06');
const ret = db.createSalesReturn({ prefix: 'WR', return_date: '2021-06-06', customer_code: 'C1', customer_name: 'Shop A',
  van: 'VAN 01', items: [{ product_id: p1.id, kind: 'GOOD', pcs: 5, unit_price: 10 }] });
check('createSalesReturn rolls forward off a closed date', ret.return_date, '2021-06-07');
check('stored return_date is the rolled date', db.getSalesReturnById(ret.id).return_date, '2021-06-07');

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
