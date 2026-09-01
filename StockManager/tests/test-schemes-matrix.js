// test-schemes-matrix.js — exhaustive scheme correctness for StockManager.
// RUN: cd <dir> && NODE_PATH=$PWD/node_modules node -r ./sqlite-shim.js test-schemes-matrix.js
//
// Every expectation below is derived by hand from the bill inputs, NEVER by reading the
// function's own output back. Drives the REAL billing path createBill() -> getBillById().
// Each test runs on its own fresh temp DB so global TRADE_OFFER / group schemes never leak.

const os = require('os'), fs = require('fs'), path = require('path');
const db = require(__dirname + '/../database.js');

// ---- independent rounding (re-derived from spec "round to 2 dp", not copied from app) ----
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '\n        expected ' + e + '\n        actual   ' + a); }
}
function checkThrows(name, fn, re) {
  try { fn(); fail++; console.log('FAIL  ' + name + ' (expected throw, none)'); }
  catch (e) {
    if (re.test(e.message)) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + ' (wrong error: ' + e.message + ')'); }
  }
}

// ---- fixtures ----
function newDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schm-'));
  db.initialize(path.join(dir, 't.sqlite'));
}
let _sku = 0;
function prod(o) {
  const base = { sku_code: 'P' + (++_sku), name: 'P' + _sku, unit: 'pcs', pcs_per_dozen: 12,
                 price: 10, cost: 5, stock_qty: 1000000, min_stock: 0, grp: '' };
  return db.addProduct(Object.assign(base, o)).id;
}
let _van = 0;
function bill(o) {
  // blank customer_code -> the (shop,van,date) duplicate check is skipped; van is required and supplied.
  const r = db.createBill(Object.assign({ van: 'V' + (++_van) }, o));
  return db.getBillById(r.id);
}
const freeOf = (full) => full.items.filter(i => i.kind === 'FREE').map(i => ({ sku: i.sku_code, pcs: i.pcs, note: i.note }));
function prodStock(id) { return db.getAllProducts().find(p => p.id === id).stock_qty; }

// ================================================================
// FREE GOODS — per-product
// ================================================================
(function per_product() {
  // scheme: buy 12 -> 1 free.
  newDb();
  let X = prod({ sku_code: 'X', name: 'X', price: 10 });
  db.addScheme({ name: 'perX', type: 'FREE_GOODS', product_id: X, buy_pcs: 12, free_pcs: 1, active: 1 });

  // exactly at threshold: 12 -> floor(12/12)*1 = 1 free
  check('pp: at threshold 12 -> 1 free', freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'X', pcs: 1, note: 'perX' }]);
  // one under: 11 -> 0 free (SQL buy_pcs<=11 excludes buy_pcs 12)
  check('pp: one under 11 -> no free', freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 11 }] })),
        []);
  // 2x bundle: 24 -> floor(24/12)*1 = 2 free
  check('pp: 24 -> 2 free', freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 24 }] })),
        [{ sku: 'X', pcs: 2, note: 'perX' }]);
  // 3x bundle: 36 -> 3 free
  check('pp: 36 -> 3 free', freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 36 }] })),
        [{ sku: 'X', pcs: 3, note: 'perX' }]);
  // non-multiple: 30 -> floor(30/12)*1 = 2 free
  check('pp: 30 -> 2 free (floor)', freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 30 }] })),
        [{ sku: 'X', pcs: 2, note: 'perX' }]);
})();

(function per_product_free_gt1() {
  // free_pcs > 1: buy 10 -> 3 free
  newDb();
  let Y = prod({ sku_code: 'Y', name: 'Y', price: 10 });
  db.addScheme({ name: 'perY', type: 'FREE_GOODS', product_id: Y, buy_pcs: 10, free_pcs: 3, active: 1 });
  check('pp: buy10 free3, at 10 -> 3 free', freeOf(bill({ items: [{ product_id: Y, kind: 'SALE', pcs: 10 }] })),
        [{ sku: 'Y', pcs: 3, note: 'perY' }]);
  // 25 -> floor(25/10)*3 = 6 free
  check('pp: buy10 free3, at 25 -> 6 free', freeOf(bill({ items: [{ product_id: Y, kind: 'SALE', pcs: 25 }] })),
        [{ sku: 'Y', pcs: 6, note: 'perY' }]);
})();

(function per_product_best_ratio() {
  // two per-product schemes on ONE product; higher free/buy ratio wins.
  // r-low: buy10 free1 = 0.100 ; r-high: buy12 free2 = 0.1667  -> r-high selected.
  newDb();
  let D = prod({ sku_code: 'D', name: 'D', price: 10 });
  db.addScheme({ name: 'r-low', type: 'FREE_GOODS', product_id: D, buy_pcs: 10, free_pcs: 1, active: 1 });
  db.addScheme({ name: 'r-high', type: 'FREE_GOODS', product_id: D, buy_pcs: 12, free_pcs: 2, active: 1 });
  // buy 24 -> r-high: floor(24/12)*2 = 4 free (r-low would give floor(24/10)*1 = 2)
  check('pp: best-ratio picks r-high -> 4 free', freeOf(bill({ items: [{ product_id: D, kind: 'SALE', pcs: 24 }] })),
        [{ sku: 'D', pcs: 4, note: 'r-high' }]);
})();

// ================================================================
// FREE GOODS — group
// ================================================================
(function group_basic() {
  // group 'COLA' with flavours A,B,C ; scheme buy 24 across the group -> 2 free, to most-bought flavour.
  newDb();
  let A = prod({ sku_code: 'A', name: 'A', price: 10, grp: 'COLA' });
  let B = prod({ sku_code: 'B', name: 'B', price: 10, grp: 'COLA' });
  prod({ sku_code: 'C', name: 'C', price: 10, grp: 'COLA' }); // in the group but absent from bills below
  db.addScheme({ name: 'grpCola', type: 'FREE_GOODS', grp: 'COLA', buy_pcs: 24, free_pcs: 2, active: 1 });

  // mixed flavours summing to threshold: 12A + 12B = 24 -> 2 free. Tie on most-bought -> first-listed (A).
  check('grp: 12A+12B=24 -> 2 free to A (tie->first listed)',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }, { product_id: B, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'A', pcs: 2, note: 'grpCola' }]);

  // same tie, B listed first -> free goes to B. (deterministic: earliest of the tied max wins)
  check('grp: tie with B listed first -> 2 free to B',
        freeOf(bill({ items: [{ product_id: B, kind: 'SALE', pcs: 12 }, { product_id: A, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'B', pcs: 2, note: 'grpCola' }]);

  // most-bought (no tie): 30A + 18B = 48 -> floor(48/24)*2 = 4 free, to A (30>18)
  check('grp: 30A+18B=48 -> 4 free to most-bought A',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 30 }, { product_id: B, kind: 'SALE', pcs: 18 }] })),
        [{ sku: 'A', pcs: 4, note: 'grpCola' }]);
  // ...and if B is the most-bought: 18A + 30B = 48 -> 4 free to B
  check('grp: 18A+30B=48 -> 4 free to most-bought B',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 18 }, { product_id: B, kind: 'SALE', pcs: 30 }] })),
        [{ sku: 'B', pcs: 4, note: 'grpCola' }]);

  // just under threshold: 12A + 11B = 23 -> floor(23/24)*2 = 0 -> no free
  check('grp: 12A+11B=23 -> no free',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }, { product_id: B, kind: 'SALE', pcs: 11 }] })),
        []);

  // only some flavours appear: bill is 24A only (B,C absent) -> group still fires on grp total -> 2 free to A
  check('grp: only A present, 24 -> 2 free to A',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 24 }] })),
        [{ sku: 'A', pcs: 2, note: 'grpCola' }]);
})();

(function group_best_ratio_one_per_group() {
  // two group schemes on the SAME grp -> exactly one fires (best qualifying ratio).
  // gLow: buy24 free2 = 0.0833 ; gHigh: buy24 free3 = 0.125 -> gHigh.
  newDb();
  let A = prod({ sku_code: 'GA', name: 'GA', price: 10, grp: 'G' });
  let B = prod({ sku_code: 'GB', name: 'GB', price: 10, grp: 'G' });
  db.addScheme({ name: 'gLow', type: 'FREE_GOODS', grp: 'G', buy_pcs: 24, free_pcs: 2, active: 1 });
  db.addScheme({ name: 'gHigh', type: 'FREE_GOODS', grp: 'G', buy_pcs: 24, free_pcs: 3, active: 1 });
  // 24 total (12+12) -> gHigh: floor(24/24)*3 = 3 free, exactly one free line, to A (tie->first)
  check('grp: two schemes same grp -> best ratio (gHigh) only, 3 free',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }, { product_id: B, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'GA', pcs: 3, note: 'gHigh' }]);
})();

// ================================================================
// NO DOUBLE-DIP & backward compatibility
// ================================================================
(function no_double_dip() {
  // product A is in group G (active group scheme) AND carries an old per-product scheme.
  // When the group FIRES, the per-product scheme must NOT also fire.
  newDb();
  let A = prod({ sku_code: 'A', name: 'A', price: 10, grp: 'G' });
  db.addScheme({ name: 'grpG', type: 'FREE_GOODS', grp: 'G', buy_pcs: 24, free_pcs: 2, active: 1 });
  db.addScheme({ name: 'perA', type: 'FREE_GOODS', product_id: A, buy_pcs: 12, free_pcs: 1, active: 1 });
  // buy 24A: group fires (2 free). per-product suppressed -> exactly one free line from the group.
  check('no-double-dip: group fires -> group free only (no per-product)',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 24 }] })),
        [{ sku: 'A', pcs: 2, note: 'grpG' }]);
})();

(function group_under_threshold_perproduct_still_fires() {
  // Group scheme active but the group does NOT reach threshold -> group does not fire,
  // so the per-product scheme SHOULD still fire (only a FIRED group scheme suppresses per-product).
  newDb();
  let A = prod({ sku_code: 'A', name: 'A', price: 10, grp: 'G' });
  db.addScheme({ name: 'grpG', type: 'FREE_GOODS', grp: 'G', buy_pcs: 24, free_pcs: 2, active: 1 });
  db.addScheme({ name: 'perA', type: 'FREE_GOODS', product_id: A, buy_pcs: 12, free_pcs: 1, active: 1 });
  // buy 12A: group total 12 < 24 -> no group free; per-product buy12 free1 fires -> 1 free.
  check('group under threshold -> per-product still fires',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'A', pcs: 1, note: 'perA' }]);
})();

(function grp_but_no_group_scheme() {
  // product HAS a grp, but there is NO active group scheme for that grp -> per-product fires (backward compat).
  newDb();
  let A = prod({ sku_code: 'A', name: 'A', price: 10, grp: 'ORPHAN' });
  db.addScheme({ name: 'grpOther', type: 'FREE_GOODS', grp: 'DIFFERENT', buy_pcs: 24, free_pcs: 2, active: 1 }); // unrelated grp
  db.addScheme({ name: 'perA', type: 'FREE_GOODS', product_id: A, buy_pcs: 12, free_pcs: 1, active: 1 });
  check('grp set but no group scheme for it -> per-product fires',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'A', pcs: 1, note: 'perA' }]);
})();

// ================================================================
// Suppression / inactive / degenerate
// ================================================================
(function scheme_off_free() {
  newDb();
  let X = prod({ sku_code: 'X', name: 'X', price: 10 });
  db.addScheme({ name: 'perX', type: 'FREE_GOODS', product_id: X, buy_pcs: 12, free_pcs: 1, active: 1 });
  check('scheme_off suppresses free goods',
        freeOf(bill({ scheme_off: 1, items: [{ product_id: X, kind: 'SALE', pcs: 24 }] })),
        []);
})();

(function inactive_free() {
  newDb();
  let X = prod({ sku_code: 'X', name: 'X', price: 10 });
  db.addScheme({ name: 'perX', type: 'FREE_GOODS', product_id: X, buy_pcs: 12, free_pcs: 1, active: 0 });
  check('inactive free scheme never fires',
        freeOf(bill({ items: [{ product_id: X, kind: 'SALE', pcs: 24 }] })),
        []);
})();

(function group_buy0_never_fires() {
  // group scheme with buy_pcs 0 must never fire (excluded by buy_pcs>0), and must NOT suppress a per-product scheme.
  newDb();
  let A = prod({ sku_code: 'A', name: 'A', price: 10, grp: 'Z' });
  db.addScheme({ name: 'grpZero', type: 'FREE_GOODS', grp: 'Z', buy_pcs: 0, free_pcs: 5, active: 1 });
  db.addScheme({ name: 'perA', type: 'FREE_GOODS', product_id: A, buy_pcs: 12, free_pcs: 1, active: 1 });
  // buy 12A: grpZero excluded (buy0) -> A not covered -> per-product fires -> 1 free, note perA (not grpZero).
  check('group buy_pcs 0 never fires; per-product still fires',
        freeOf(bill({ items: [{ product_id: A, kind: 'SALE', pcs: 12 }] })),
        [{ sku: 'A', pcs: 1, note: 'perA' }]);
})();

// ================================================================
// Stock integrity: FREE / REPLACE not billed but DO move stock
// ================================================================
(function free_and_replace_stock() {
  newDb();
  let X = prod({ sku_code: 'X', name: 'X', price: 10, stock_qty: 1000 });
  let R = prod({ sku_code: 'R', name: 'R', price: 10, stock_qty: 1000 });
  db.addScheme({ name: 'perX', type: 'FREE_GOODS', product_id: X, buy_pcs: 12, free_pcs: 1, active: 1 });
  // SALE 12 X (+1 FREE) and REPLACE 6 R. subtotal = 12*10 = 120 (FREE & REPLACE not billed).
  const full = bill({ items: [{ product_id: X, kind: 'SALE', pcs: 12 }, { product_id: R, kind: 'REPLACE', pcs: 6 }] });
  check('free/replace: subtotal counts SALE only', full.subtotal, 120);
  check('free/replace: X stock down by 12 SALE + 1 FREE = 13', prodStock(X), 1000 - 13);
  check('free/replace: R stock down by 6 REPLACE', prodStock(R), 1000 - 6);
  const repl = full.items.filter(i => i.kind === 'REPLACE').map(i => ({ pcs: i.pcs, lt: i.line_total, up: i.unit_price }));
  check('free/replace: REPLACE line not billed', repl, [{ pcs: 6, lt: 0, up: 0 }]);
})();

(function free_line_respects_stock() {
  // stock exactly 12: SALE 12 consumes it, the auto FREE 1 has no stock -> whole bill rejected.
  newDb();
  let X = prod({ sku_code: 'X', name: 'X', price: 10, stock_qty: 12 });
  db.addScheme({ name: 'perX', type: 'FREE_GOODS', product_id: X, buy_pcs: 12, free_pcs: 1, active: 1 });
  checkThrows('free line short on stock -> Insufficient stock',
        () => db.createBill({ van: 'VS', items: [{ product_id: X, kind: 'SALE', pcs: 12 }] }), /Insufficient stock/);
  check('free line short: bill rolled back, stock intact', prodStock(X), 12);
})();

// ================================================================
// TRADE OFFERS  (all rupee figures derived by hand)
// ================================================================
(function to_pct_min_bill() {
  // % scheme of subtotal, gated by min_bill. product price 100.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 20000, active: 1 });
  // just under min_bill: 100 pcs -> subtotal 10000 < 20000 -> no offer.
  let f = bill({ items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to %: under min_bill -> no offer', { to: f.trade_offer, total: f.total }, { to: 0, total: 10000 });
  // at/over min_bill: 200 pcs -> subtotal 20000 >= 20000 -> offer = 2% of 20000 = 400; total = 20000 - 400.
  f = bill({ items: [{ product_id: T, kind: 'SALE', pcs: 200 }] });
  check('to %: at min_bill -> 2% offer 400', { to: f.trade_offer, total: f.total }, { to: 400, total: 19600 });
})();

(function to_flat_legacy() {
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'flat300', type: 'TRADE_OFFER', offer_amount: 300, min_bill: 1000, active: 1 });
  // subtotal 10000 >= 1000 -> flat 300; total = 10000 - 300.
  let f = bill({ items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to flat: legacy offer_amount 300', { to: f.trade_offer, total: f.total }, { to: 300, total: 9700 });
})();

(function to_stack_pct_and_flat() {
  // both a % and a flat scheme active -> they stack. subtotal 10000.
  // pct: 2% of 10000 = 200 ; flat 300 ; trade_offer = round2(200+300) = 500 ; total = 9500.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  db.addScheme({ name: 'flat300', type: 'TRADE_OFFER', offer_amount: 300, min_bill: 1000, active: 1 });
  let f = bill({ items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to stack: 2% + flat300 -> 500', { to: f.trade_offer, total: f.total }, { to: 500, total: 9500 });
})();

(function to_manual_and_perline() {
  // manual flat 100 + a per-line 5% offer. subtotal 10000, no schemes.
  // per-line: line_total 10000 * 5% = 500 ; manual 100 ; trade_offer = round2(600) = 600 ; total = 9400.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  let f = bill({ manual_trade_offer: 100, items: [{ product_id: T, kind: 'SALE', pcs: 100, trade_offer_pct: 5 }] });
  check('to manual+perline: 100 + 5%-of-line 500 = 600', { to: f.trade_offer, total: f.total }, { to: 600, total: 9400 });
})();

(function to_combine_manualpct_perline_scheme() {
  // manual_trade_offer_pct 3 + per-line 5% + scheme 2%, all on subtotal 10000.
  // manual = 3% of 10000 = 300 ; per-line = 5% of 10000 = 500 ; scheme = 2% of 10000 = 200 ; total offer = 1000.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  let f = bill({ manual_trade_offer_pct: 3, items: [{ product_id: T, kind: 'SALE', pcs: 100, trade_offer_pct: 5 }] });
  check('to combine: manual%3 + perline%5 + scheme%2 = 1000',
        { to: f.trade_offer, total: f.total }, { to: 1000, total: 9000 });
})();

(function to_clamp_100() {
  // manual_trade_offer_pct 150 must clamp to 100% -> offer = whole subtotal 10000 -> total 0.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  let f = bill({ manual_trade_offer_pct: 150, items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to clamp: manual_pct 150 -> 100% -> offer=subtotal',
        { pct: f.manual_trade_offer_pct, manual: f.manual_trade_offer, to: f.trade_offer, total: f.total },
        { pct: 100, manual: 10000, to: 10000, total: 0 });
  // per-line trade_offer_pct 150 must clamp to 100% too -> line offer = whole line_total.
  let f2 = bill({ items: [{ product_id: T, kind: 'SALE', pcs: 100, trade_offer_pct: 150 }] });
  check('to clamp: per-line pct 150 -> 100% -> offer=line_total',
        { to: f2.trade_offer, total: f2.total }, { to: 10000, total: 0 });
})();

(function to_scheme_off_keeps_manual() {
  // scheme_off suppresses TRADE_OFFER schemes but NOT the manual part. subtotal 10000.
  // pct2 scheme would give 200 but is suppressed; manual 100 remains; total = 9900.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  let f = bill({ scheme_off: 1, manual_trade_offer: 100, items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to scheme_off: scheme gone, manual kept', { to: f.trade_offer, total: f.total }, { to: 100, total: 9900 });
})();

(function to_tax_before_offers() {
  // tax is computed on the pre-offer subtotal. subtotal 10000, tax 10% -> 1000 (NOT on 9800).
  // pct2 scheme offer 200. total = subtotal + tax - offer - discount = 10000 + 1000 - 200 - 0 = 10800.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  let f = bill({ tax_pct: 10, items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to tax: tax on pre-offer subtotal',
        { subtotal: f.subtotal, tax: f.tax_amount, to: f.trade_offer, total: f.total },
        { subtotal: 10000, tax: 1000, to: 200, total: 10800 });
})();

(function to_full_formula() {
  // full formula with tax + manual + discount + scheme. subtotal 10000.
  // tax 17% = 1700 ; offer = manual 100 + scheme(2%)=200 = 300 ; discount 50.
  // total = 10000 + 1700 - 300 - 50 = 11350.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 100 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  let f = bill({ tax_pct: 17, manual_trade_offer: 100, discount: 50, items: [{ product_id: T, kind: 'SALE', pcs: 100 }] });
  check('to full: subtotal+tax-offers-discount',
        { subtotal: f.subtotal, tax: f.tax_amount, to: f.trade_offer, discount: f.discount, total: f.total },
        { subtotal: 10000, tax: 1700, to: 300, discount: 50, total: 11350 });
})();

(function to_rounding() {
  // rounding-sensitive: price 118.33, buy 12 -> line_total r2(118.33*12) = 1419.96 = subtotal.
  // tax 17% -> r2(1419.96*0.17) = 241.39 ; scheme 2% -> r2(1419.96*0.02) = 28.40.
  // total = r2(1419.96 + 241.39 - 28.40 - 0) = 1632.95.
  newDb();
  let T = prod({ sku_code: 'T', name: 'T', price: 118.33 });
  db.addScheme({ name: 'pct2', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 1000, active: 1 });
  let f = bill({ tax_pct: 17, items: [{ product_id: T, kind: 'SALE', pcs: 12 }] });
  check('to rounding: each step round2',
        { subtotal: f.subtotal, tax: f.tax_amount, to: f.trade_offer, total: f.total },
        { subtotal: r2(118.33 * 12), tax: r2(1419.96 * 0.17), to: r2(1419.96 * 0.02),
          total: r2(1419.96 + 241.39 - 28.40) });
})();

// ================================================================
console.log('');
if (fail === 0) console.log('ALL PASS (' + pass + ' checks)');
else console.log(fail + ' FAILURES (' + pass + ' passed)');
try { db.closeDb(); } catch (e) {}
process.exit(fail ? 1 : 0);
