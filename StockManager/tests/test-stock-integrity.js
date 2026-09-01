// test-stock-integrity.js
// Verifies stock is never silently wrong across the full lifecycle of edits and deletes.
// RUN: cd <dir> && NODE_PATH=$PWD/node_modules node -r ./sqlite-shim.js test-stock-integrity.js
//
// Every expected number below is derived by hand from first principles (opening stock
// minus the pcs of the CURRENT line set), never by echoing the function's own output.
// Canonical stock is always in PIECES. SALE/FREE/REPLACE all move stock; FREE/REPLACE
// are not billed. GOOD returns restock; DAMAGED returns are written off.

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const DB_JS = __dirname + '/../database.js';
const db = require(DB_JS);

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}
function checkThrows(name, fn, regex) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) { failures++; console.log(`FAIL ${name}  expected throw matching ${regex}, but nothing was thrown`); return; }
  const ok = regex.test(threw.message);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  message=${JSON.stringify(threw.message)} did not match ${regex}`}`);
}

function freshDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-stock-'));
  db.initialize(path.join(tmp, 'test.db'), {});
}
function newProduct(o) { return db.addProduct(o).id; }         // returns product id
function stockOf(id) {
  const p = db.getAllProducts().find(x => x.id === id);
  return p ? p.stock_qty : null;
}
function billCount() { return db.getAllBills().length; }

// Run a section in isolation so one unexpected throw can't hide the rest of the suite.
function section(label, fn) {
  console.log(`\n--- ${label} ---`);
  try { fn(); }
  catch (e) { failures++; console.log(`FAIL ${label}: UNEXPECTED ERROR  ${e && e.message}`); }
}

// ===================================================================
// A. updateBill lifecycle: qty up/down, product swap, add/remove line,
//    SALE->REPLACE toggle. After each edit the net stock effect must equal
//    exactly the current line set. Delete must restore pre-bill stock EXACTLY.
//    Opening: A=1000, B=500, C=300. No schemes (pure line-for-line stock).
// ===================================================================
section('A. updateBill stock across edits + delete', () => {
  freshDb();
  const A = newProduct({ sku_code: 'A', name: 'Prod A', price: 10, cost: 6, stock_qty: 1000 });
  const B = newProduct({ sku_code: 'B', name: 'Prod B', price: 20, cost: 6, stock_qty: 500 });
  const C = newProduct({ sku_code: 'C', name: 'Prod C', price: 5,  cost: 6, stock_qty: 300 });
  const OPEN = { [A]: 1000, [B]: 500, [C]: 300 };

  // Invariant helper: expected stock for a product = opening - sum(pcs on current line set).
  // Independent of the restore/subtract mechanism inside updateBill, so it is a real cross-check.
  function assertLineSet(tag, lineset /* [{p,pcs}] */) {
    const need = {};
    for (const l of lineset) need[l.p] = (need[l.p] || 0) + l.pcs;
    for (const p of [A, B, C]) check(`A: ${tag} stock(${p})`, stockOf(p), OPEN[p] - (need[p] || 0));
  }

  const base = { customer_code: 'C1', customer_name: 'Shop 1', van: 'V1', bill_date: '2026-08-10' };
  const r = db.createBill({ ...base, items: [
    { product_id: A, kind: 'SALE', pcs: 60 },
    { product_id: B, kind: 'SALE', pcs: 24 },
  ]});
  const billId = r.id;
  // after create: A 1000-60=940, B 500-24=476, C 300
  assertLineSet('after create {A60,B24}', [{ p: A, pcs: 60 }, { p: B, pcs: 24 }]);

  // edit 1: line A qty UP 60 -> 100  => A 900, B 476, C 300
  db.updateBill(billId, { ...base, items: [
    { product_id: A, kind: 'SALE', pcs: 100 }, { product_id: B, kind: 'SALE', pcs: 24 } ]});
  assertLineSet('edit1 qty up {A100,B24}', [{ p: A, pcs: 100 }, { p: B, pcs: 24 }]);

  // edit 2: line A qty DOWN 100 -> 30  => A 970, B 476, C 300
  db.updateBill(billId, { ...base, items: [
    { product_id: A, kind: 'SALE', pcs: 30 }, { product_id: B, kind: 'SALE', pcs: 24 } ]});
  assertLineSet('edit2 qty down {A30,B24}', [{ p: A, pcs: 30 }, { p: B, pcs: 24 }]);

  // edit 3: change PRODUCT of the 30-pc line from A -> C (bug-1 area).
  // Stock must move OFF C (new) and back to A (old): A 1000, B 476, C 270.
  db.updateBill(billId, { ...base, items: [
    { product_id: C, kind: 'SALE', pcs: 30 }, { product_id: B, kind: 'SALE', pcs: 24 } ]});
  assertLineSet('edit3 product swap A->C {C30,B24}', [{ p: C, pcs: 30 }, { p: B, pcs: 24 }]);
  check('A: edit3 OLD product A fully restored', stockOf(A), 1000);
  check('A: edit3 NEW product C debited', stockOf(C), 270);

  // edit 4: ADD a line (A, 12)  => A 988, B 476, C 270
  db.updateBill(billId, { ...base, items: [
    { product_id: C, kind: 'SALE', pcs: 30 }, { product_id: B, kind: 'SALE', pcs: 24 },
    { product_id: A, kind: 'SALE', pcs: 12 } ]});
  assertLineSet('edit4 add {C30,B24,A12}', [{ p: C, pcs: 30 }, { p: B, pcs: 24 }, { p: A, pcs: 12 }]);

  // edit 5: REMOVE the B line  => A 988, B 500, C 270
  db.updateBill(billId, { ...base, items: [
    { product_id: C, kind: 'SALE', pcs: 30 }, { product_id: A, kind: 'SALE', pcs: 12 } ]});
  assertLineSet('edit5 remove B {C30,A12}', [{ p: C, pcs: 30 }, { p: A, pcs: 12 }]);

  // edit 6: toggle the A line SALE -> REPLACE (still moves stock, but NOT billed)
  //   stock same as edit5: A 988, B 500, C 270 ; subtotal = only C 30*5 = 150
  db.updateBill(billId, { ...base, items: [
    { product_id: C, kind: 'SALE', pcs: 30 }, { product_id: A, kind: 'REPLACE', pcs: 12 } ]});
  assertLineSet('edit6 SALE->REPLACE {C30,A12(repl)}', [{ p: C, pcs: 30 }, { p: A, pcs: 12 }]);
  check('A: edit6 REPLACE not billed (subtotal = C 30*5)', db.getBillById(billId).subtotal, 150);

  // delete the bill -> every product back to pre-bill EXACTLY
  db.deleteBill(billId);
  check('A: after delete A == opening', stockOf(A), 1000);
  check('A: after delete B == opening', stockOf(B), 500);
  check('A: after delete C == opening', stockOf(C), 300);
  check('A: after delete no bills remain', billCount(), 0);
});

// ===================================================================
// B. createPurchase adds stock; deletePurchase restores it.
//    deletePurchase blocked on a closed day and when stock would go negative.
//    Opening: D=50.
// ===================================================================
section('B. purchase create/delete + guards', () => {
  freshDb();
  const D = newProduct({ sku_code: 'D', name: 'Prod D', price: 10, cost: 6, stock_qty: 50 });

  const p1 = db.createPurchase({ purchase_date: '2026-07-02', vehicle_no: 'X', supplier: 'S',
    items: [{ product_id: D, pcs: 100, unit_cost: 6 }] });
  check('B: stock after purchase (+100)', stockOf(D), 150);     // 50 + 100
  db.deletePurchase(p1.id);
  check('B: stock after deletePurchase (-100)', stockOf(D), 50); // back to opening

  // closed-day guard
  const p2 = db.createPurchase({ purchase_date: '2026-07-02', vehicle_no: 'X', supplier: 'S',
    items: [{ product_id: D, pcs: 100, unit_cost: 6 }] });
  check('B: stock after 2nd purchase (+100)', stockOf(D), 150);
  db.closeDay('2026-07-02');
  checkThrows('B: deletePurchase blocked on closed day',
    () => db.deletePurchase(p2.id),
    /Date 2026-07-02 is closed\. Re-open it to delete purchases\./);
  check('B: stock unchanged after blocked (closed)', stockOf(D), 150);
  db.openDay('2026-07-02');

  // negative-stock guard: sell 90 first (stock 150 -> 60), purchase added 100 > 60
  db.createBill({ customer_code: 'C1', customer_name: 'Shop', van: 'V1', bill_date: '2026-07-03',
    items: [{ product_id: D, kind: 'SALE', pcs: 90 }] });
  check('B: stock after resale of 90', stockOf(D), 60);          // 150 - 90
  checkThrows('B: deletePurchase blocked when stock would go negative',
    () => db.deletePurchase(p2.id),
    /Cannot delete: Prod D stock would go negative \(have 60, purchase added 100\)/);
  check('B: stock unchanged after blocked (negative)', stockOf(D), 60);
});

// ===================================================================
// C. Closed-day gates on createBill / updateBill / deleteBill /
//    createSalesReturn / deleteSalesReturn (open/close around each).
//    Opening: E=1000.
// ===================================================================
section('C. closed-day gates on every write', () => {
  freshDb();
  const E = newProduct({ sku_code: 'E', name: 'Prod E', price: 10, cost: 6, stock_qty: 1000 });
  const DAY = '2026-06-01';
  const base = { customer_code: 'C1', customer_name: 'Shop', van: 'V1', bill_date: DAY };

  // createBill blocked on closed day, writes nothing
  db.closeDay(DAY);
  checkThrows('C: createBill blocked (closed)',
    () => db.createBill({ ...base, items: [{ product_id: E, kind: 'SALE', pcs: 10 }] }),
    /Date 2026-06-01 is closed\. Re-open it to add bills\./);
  check('C: createBill wrote no bill', billCount(), 0);
  check('C: createBill left stock intact', stockOf(E), 1000);
  db.openDay(DAY);

  // real bill for the remaining gate tests: 10 pcs -> stock 990
  const bill = db.createBill({ ...base, items: [{ product_id: E, kind: 'SALE', pcs: 10 }] });
  check('C: stock after bill', stockOf(E), 990);

  // updateBill blocked on closed day
  db.closeDay(DAY);
  checkThrows('C: updateBill blocked (closed)',
    () => db.updateBill(bill.id, { ...base, items: [{ product_id: E, kind: 'SALE', pcs: 20 }] }),
    /Date 2026-06-01 is closed\. Re-open it to edit bills\./);
  check('C: updateBill left stock intact', stockOf(E), 990);

  // deleteBill blocked on closed day
  checkThrows('C: deleteBill blocked (closed)',
    () => db.deleteBill(bill.id),
    /Date 2026-06-01 is closed\. Re-open it to delete bills\./);
  check('C: deleteBill left stock intact', stockOf(E), 990);
  db.openDay(DAY);

  // createSalesReturn blocked on closed day
  const src = db.getBillForReturn(bill.id);
  const saleLine = src.items.find(i => i.kind === 'SALE' && i.product_id === E);
  db.closeDay(DAY);
  checkThrows('C: createSalesReturn blocked (closed)',
    () => db.createSalesReturn({ return_date: DAY, bill_id: bill.id, bill_number: src.bill_number,
      customer_code: 'C1', van: 'V1', items: [
        { bill_item_id: saleLine.bill_item_id, product_id: E, kind: 'GOOD', pcs: 5, unit_price: 10 }] }),
    /Date 2026-06-01 is closed\. Re-open it to add returns\./);
  check('C: createSalesReturn left stock intact', stockOf(E), 990);
  db.openDay(DAY);

  // a real return (GOOD 5) -> stock 995, then deleteSalesReturn blocked on closed day
  const ret = db.createSalesReturn({ return_date: DAY, bill_id: bill.id, bill_number: src.bill_number,
    customer_code: 'C1', van: 'V1', items: [
      { bill_item_id: saleLine.bill_item_id, product_id: E, kind: 'GOOD', pcs: 5, unit_price: 10 }] });
  check('C: stock after GOOD return (+5)', stockOf(E), 995);
  db.closeDay(DAY);
  checkThrows('C: deleteSalesReturn blocked (closed)',
    () => db.deleteSalesReturn(ret.id),
    /Date 2026-06-01 is closed\. Re-open it to delete returns\./);
  check('C: deleteSalesReturn left stock intact', stockOf(E), 995);
  db.openDay(DAY);
});

// ===================================================================
// D. Insufficient stock: a bill for more pcs than on hand throws and writes
//    nothing (row count AND stock unchanged). Plus: a van-less bill writes nothing.
//    Opening: F=40.
// ===================================================================
section('D. insufficient stock / van guard write nothing', () => {
  freshDb();
  const F = newProduct({ sku_code: 'F', name: 'Prod F', price: 10, cost: 6, stock_qty: 40 });

  checkThrows('D: createBill over stock throws',
    () => db.createBill({ customer_code: 'C1', van: 'V1', bill_date: '2026-05-01',
      items: [{ product_id: F, kind: 'SALE', pcs: 50 }] }),
    /Insufficient stock for Prod F \(need 50, have 40\)/);
  check('D: over-stock wrote no bill', billCount(), 0);
  check('D: over-stock left stock intact', stockOf(F), 40);

  checkThrows('D: createBill without van throws',
    () => db.createBill({ customer_code: 'C1', van: '', bill_date: '2026-05-01',
      items: [{ product_id: F, kind: 'SALE', pcs: 10 }] }),
    /van/i);
  check('D: van-less wrote no bill', billCount(), 0);
  check('D: van-less left stock intact', stockOf(F), 40);
});

// ===================================================================
// E. Full round-trip: purchase 100 -> bill 60 (+ free goods) ->
//    return 20 GOOD + 5 DAMAGED -> delete return -> delete bill -> delete purchase.
//    Assert stock at EVERY step; ends exactly at opening (0).
//    Per-product FREE scheme on G: buy 60 -> free 6.  Opening: G=0.
//    Stock trail: 100 -> 34 -> 54 -> 34 -> 100 -> 0.
// ===================================================================
section('E. full lifecycle round-trip', () => {
  freshDb();
  const G = newProduct({ sku_code: 'G', name: 'Prod G', price: 10, cost: 6, stock_qty: 0 });
  db.addScheme({ name: 'G buy60 free6', type: 'FREE_GOODS', product_id: G, buy_pcs: 60, free_pcs: 6, active: 1 });

  // purchase 100 -> stock 100
  const pur = db.createPurchase({ purchase_date: '2026-04-01', supplier: 'S',
    items: [{ product_id: G, pcs: 100, unit_cost: 6 }] });
  check('E: stock after purchase', stockOf(G), 100);

  // bill 60 SALE -> auto FREE 6 ; stock moves 60 + 6 = 66 -> 34
  const bill = db.createBill({ customer_code: 'C1', customer_name: 'Shop', van: 'V1',
    bill_date: '2026-04-02', items: [{ product_id: G, kind: 'SALE', pcs: 60 }] });
  check('E: stock after bill (SALE60 + FREE6 = 66 out)', stockOf(G), 34);
  const items = db.getBillById(bill.id).items;
  const freeLine = items.find(i => i.kind === 'FREE');
  check('E: free-goods line fired (6 pcs)', freeLine ? freeLine.pcs : null, 6);
  check('E: FREE not billed (subtotal = 60*10)', db.getBillById(bill.id).subtotal, 600);

  // return 20 GOOD + 5 DAMAGED off the SALE line ; GOOD restocks, DAMAGED written off -> +20 -> 54
  const src = db.getBillForReturn(bill.id);
  const saleLine = src.items.find(i => i.kind === 'SALE');
  const ret = db.createSalesReturn({ return_date: '2026-04-02', bill_id: bill.id, bill_number: src.bill_number,
    customer_code: 'C1', van: 'V1', items: [
      { bill_item_id: saleLine.bill_item_id, product_id: G, kind: 'GOOD',    pcs: 20, unit_price: 10 },
      { bill_item_id: saleLine.bill_item_id, product_id: G, kind: 'DAMAGED', pcs: 5,  unit_price: 10 } ] });
  check('E: return restocked only GOOD (20)', ret.restocked, 20);
  check('E: stock after return (+20 GOOD, DAMAGED written off)', stockOf(G), 54);

  // delete return -> reverse the 20 GOOD -> 34
  db.deleteSalesReturn(ret.id);
  check('E: stock after delete return (-20)', stockOf(G), 34);

  // delete bill -> restore SALE 60 + FREE 6 -> 100
  db.deleteBill(bill.id);
  check('E: stock after delete bill (+66)', stockOf(G), 100);

  // delete purchase -> -100 -> 0 (opening)
  db.deletePurchase(pur.id);
  check('E: stock after delete purchase == opening 0', stockOf(G), 0);
});

// ===================================================================
// F. Negative-stock guard on deleteSalesReturn:
//    return restocks, pieces resold, then delete blocked with the way-out message.
//    Opening: H=100. bill 30 -> 70 ; return 30 GOOD -> 100 ; resell 90 -> 10 ;
//    delete return needs 30 back but only 10 on hand -> blocked, way-out = 20 pcs.
// ===================================================================
section('F. deleteSalesReturn negative-stock guard', () => {
  freshDb();
  const H = newProduct({ sku_code: 'H', name: 'Prod H', price: 10, cost: 6, stock_qty: 100 });

  const bill = db.createBill({ customer_code: 'C1', customer_name: 'Shop', van: 'V1',
    bill_date: '2026-03-01', items: [{ product_id: H, kind: 'SALE', pcs: 30 }] });
  check('F: stock after bill 30', stockOf(H), 70);

  const src = db.getBillForReturn(bill.id);
  const saleLine = src.items.find(i => i.kind === 'SALE');
  const ret = db.createSalesReturn({ return_date: '2026-03-01', bill_id: bill.id, bill_number: src.bill_number,
    customer_code: 'C1', van: 'V1', items: [
      { bill_item_id: saleLine.bill_item_id, product_id: H, kind: 'GOOD', pcs: 30, unit_price: 10 }] });
  check('F: stock after GOOD return 30', stockOf(H), 100);

  // resell 90 (different shop/day so no duplicate) -> stock 10
  db.createBill({ customer_code: 'C2', customer_name: 'Shop2', van: 'V1', bill_date: '2026-03-02',
    items: [{ product_id: H, kind: 'SALE', pcs: 90 }] });
  check('F: stock after reselling 90', stockOf(H), 10);

  checkThrows('F: deleteSalesReturn blocked (would go negative), way-out message',
    () => db.deleteSalesReturn(ret.id),
    /Cannot delete: Prod H stock would go negative \(have 10, return added 30\)\. Put 20 pcs back in/);
  check('F: stock unchanged after blocked delete', stockOf(H), 10);
});

// ===================================================================
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
