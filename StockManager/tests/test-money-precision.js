// test-money-precision.js
// Rounding / precision / screen-vs-stored parity for StockManager billing & sales-return credit.
//
// RUN:  cd <dbtest> && NODE_PATH=$PWD/node_modules node -r ./sqlite-shim.js test-money-precision.js
//
// Method: every expected value is derived here from the business rule (line_total = pcs*price,
// subtotal = round of the sum of ALREADY-ROUNDED line totals, tax on the PRE-offer subtotal, etc.)
// using a LOCAL round2 — never by reading a composer/return result back into the expectation.
// The sales-return parity block lifts the renderer's OWN credit helpers verbatim out of index.html
// and asserts the screen credit equals what the DB books, to the paisa.

const path = require('path');
const fs = require('fs');
const os = require('os');

const APP = __dirname + '/..';
const db = require(APP + '/database.js');

// ── local, independent copy of the business rounding rule ────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── harness ──────────────────────────────────────────────────────
let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`));
}
function checkThrows(name, fn, re) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  const ok = threw && re.test(threw.message);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n        expected throw matching ${re}\n        got ${threw ? JSON.stringify(threw.message) : 'no throw'}`));
}

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smmp-'));
  db.initialize(path.join(dir, 'test.db'), {});
}
const D = '2026-08-31'; // today; no closed days in a fresh DB

// ── lift the renderer's credit maths verbatim out of index.html ──
const html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');
const grab = (nm, kind) => {
  const re = kind === 'const'
    ? new RegExp(`^const ${nm} = .*$`, 'm')
    : new RegExp(`^function ${nm}\\b[\\s\\S]*?\\n(?=(?:function |const |// |async ))`, 'm');
  const m = html.match(re);
  if (!m) throw new Error('could not lift ' + nm + ' from the renderer');
  return m[0];
};
const liftedSrc = 'let returnDraft = null;\n' + [
  grab('r2', 'const'), grab('rLineRate'), grab('rLineCredit'),
  grab('returnSubtotal'), grab('returnOffers'), grab('returnTotal'),
].join('\n');
const screen = new Function(`${liftedSrc}
  return {
    set: (d) => { returnDraft = d; },
    r2:  (n) => r2(n),
    rate: (l) => rLineRate(l),
    credit: (l) => rLineCredit(l),
    sub: () => returnSubtotal(),
    offers: (s) => returnOffers(s),
    total: (s, t) => returnTotal(s, t),
  };`)();

console.log('=== A. Fractional rate/qty stress (unit_price 10.105 x 33, tax 17%, offer 2.5%) ===');
(function () {
  freshDb();
  const pid = db.addProduct({ sku_code: 'A1', name: 'Frac', price: 9.99, cost: 6, pcs_per_dozen: 12, stock_qty: 1000 }).id;
  db.addScheme({ name: 'Offer 2.5', type: 'TRADE_OFFER', offer_pct: 2.5, min_bill: 0, active: 1 });
  const r = db.createBill({ bill_date: D, customer_code: 'CA', customer_name: 'A', van: 'V1',
    tax_pct: 17, items: [{ product_id: pid, kind: 'SALE', pcs: 33, unit_price: 10.105 }] });
  const b = db.getBillById(r.id);

  // hand pipeline: line rounds first, subtotal = round of sum of rounded lines, tax on pre-offer subtotal
  const line = round2(10.105 * 33);          // 333.465... -> 333.47
  const subtotal = round2(line);             // 333.47
  const tax = round2(subtotal * 17 / 100);   // 56.69 (on PRE-offer subtotal)
  const offer = round2(round2(subtotal * 2.5 / 100)); // 8.34
  const total = round2(subtotal + tax - offer - 0);   // 381.82

  check('A line_total stored', b.items[0].line_total, line);
  check('A line_total value', line, 333.47);
  check('A subtotal', b.subtotal, subtotal);
  check('A subtotal value', subtotal, 333.47);
  check('A tax_amount (pre-offer base)', b.tax_amount, tax);
  check('A tax value', tax, 56.69);
  check('A trade_offer (2.5%)', b.trade_offer, offer);
  check('A trade_offer value', offer, 8.34);
  check('A total', b.total, total);
  check('A total value', total, 381.82);
})();

console.log('=== B. Rounding POINT: per-line rounding, not round-at-the-end ===');
(function () {
  freshDb();
  // three lines of raw 0.114 each: rounding EACH line -> 0.11*3 = 0.33; rounding only the SUM -> round2(0.342)=0.34.
  const pid = db.addProduct({ sku_code: 'B1', name: 'Cheap', price: 0.114, cost: 0.05, pcs_per_dozen: 12, stock_qty: 100 }).id;
  const r = db.createBill({ bill_date: D, customer_code: 'CB', customer_name: 'B', van: 'V1',
    items: [{ product_id: pid, kind: 'SALE', pcs: 1, unit_price: 0.114 },
            { product_id: pid, kind: 'SALE', pcs: 1, unit_price: 0.114 },
            { product_id: pid, kind: 'SALE', pcs: 1, unit_price: 0.114 }] });
  const b = db.getBillById(r.id);
  const perLine = round2(round2(0.114) + round2(0.114) + round2(0.114)); // 0.33  (correct: code rounds each line)
  const endRound = round2(0.114 + 0.114 + 0.114);                        // 0.34  (wrong point)
  check('B each line rounds to 0.11', b.items.map(i => i.line_total), [0.11, 0.11, 0.11]);
  check('B subtotal is per-line rounded (0.33)', b.subtotal, perLine);
  check('B per-line vs end-round genuinely differ', [perLine, endRound], [0.33, 0.34]);
})();

console.log('=== C. Percentage-offer edges (0% / 100% / 33.33%) and min_bill boundary ===');
function offerBill(offer_pct, min_bill, taxPct, discount, price, pcs) {
  freshDb();
  const pid = db.addProduct({ sku_code: 'C1', name: 'C', price, cost: price / 2, pcs_per_dozen: 12, stock_qty: 10000 }).id;
  db.addScheme({ name: 'Off', type: 'TRADE_OFFER', offer_pct, min_bill, active: 1 });
  const r = db.createBill({ bill_date: D, customer_code: 'CC', customer_name: 'C', van: 'V1',
    tax_pct: taxPct, discount, items: [{ product_id: pid, kind: 'SALE', pcs, unit_price: price }] });
  return db.getBillById(r.id);
}
(function () {
  // subtotal = 1000 in every sub-case (price 100 x 10 pcs)
  const SUB = round2(round2(100 * 10)); // 1000

  // 0% -> no offer (offer_pct clamps to 0, offer_amount is 0)
  let b = offerBill(0, 0, 0, 0, 100, 10);
  check('C 0% trade_offer', b.trade_offer, 0);
  check('C 0% total', b.total, round2(SUB + 0 - 0 - 0));

  // 100% -> whole subtotal knocked off; total = tax - discount
  b = offerBill(100, 0, 5, 30, 100, 10);
  const tax100 = round2(SUB * 5 / 100);          // 50
  const off100 = round2(SUB * 100 / 100);        // 1000
  check('C 100% trade_offer == subtotal', b.trade_offer, off100);
  check('C 100% trade_offer value', off100, 1000);
  check('C 100% total == tax - discount', b.total, round2(SUB + tax100 - off100 - 30));
  check('C 100% total value', b.total, 20);

  // 33.33%
  b = offerBill(33.33, 0, 0, 0, 100, 10);
  const off3333 = round2(SUB * 33.33 / 100);     // 333.3
  check('C 33.33% trade_offer', b.trade_offer, off3333);
  check('C 33.33% value', off3333, 333.3);
  check('C 33.33% total', b.total, round2(SUB - off3333));
  check('C 33.33% total value', b.total, 666.7);

  // min_bill EXACTLY equal to subtotal -> applies (guard is subtotal < min_bill)
  b = offerBill(10, 1000, 0, 0, 100, 10);
  check('C min_bill == subtotal applies (10%)', b.trade_offer, round2(SUB * 10 / 100));
  check('C min_bill == subtotal value', b.trade_offer, 100);

  // min_bill one paisa above subtotal -> does NOT apply
  b = offerBill(10, 1000.01, 0, 0, 100, 10);
  check('C min_bill just above subtotal skips', b.trade_offer, 0);
})();

console.log('=== D. Sales-return credit parity: screen helpers == DB stored, to the paisa ===');
// Simulate the return form exactly the way the renderer does, then save through the DB.
function simulate(billId, edits) {
  const src = db.getBillForReturn(billId);
  const full = db.getBillById(billId);
  const lines = src.items.map(it => ({
    code: it.sku_code, product_id: it.product_id, bill_item_id: it.bill_item_id,
    name: it.product_name, bkind: it.kind, kind: 'GOOD', pcs: 0,
    unit_price: +it.unit_price || 0, billed_price: +it.unit_price || 0,
    billed_pcs: +it.pcs || 0, returned_pcs: +it.returned_pcs || 0,
    remaining_pcs: +it.remaining_pcs || 0, linked: true,
  }));
  for (const l of lines) {
    const e = edits[l.code];
    if (e) { l.pcs = e.pcs; if (e.kind) l.kind = e.kind; if (e.unit_price != null) l.unit_price = e.unit_price; }
  }
  const draft = { bill_id: billId, tax_pct: +full.tax_pct || 0, bill_subtotal: +full.subtotal || 0,
    bill_trade_offer: +full.trade_offer || 0, bill_discount: +full.discount || 0, lines };
  screen.set(draft);
  const sSub = screen.sub();
  const sTax = screen.r2(sSub * (draft.tax_pct / 100));
  const off = screen.offers(sSub);
  const sTotal = screen.total(sSub, sTax);
  const items = lines.filter(l => l.product_id && (+l.pcs || 0) > 0).map(l => ({
    bill_item_id: l.bill_item_id || null, product_id: +l.product_id, kind: l.kind,
    pcs: Math.max(0, +l.pcs || 0), unit_price: screen.rate(l),
  }));
  return { sSub, sTax, off, sTotal, items, full };
}
(function () {
  freshDb();
  const pa = db.addProduct({ sku_code: 'PA', name: 'PA', price: 10.105, cost: 6, pcs_per_dozen: 12, stock_qty: 100000 }).id;
  const pb = db.addProduct({ sku_code: 'PB', name: 'PB', price: 33.33, cost: 20, pcs_per_dozen: 12, stock_qty: 100000 }).id;
  const pc = db.addProduct({ sku_code: 'PC', name: 'PC', price: 25, cost: 15, pcs_per_dozen: 12, stock_qty: 100000 }).id;
  db.addScheme({ name: 'Big bill 2.5%', type: 'TRADE_OFFER', offer_pct: 2.5, min_bill: 100, active: 1 });

  const bill = db.createBill({ bill_date: D, customer_code: 'CD', customer_name: 'D', van: 'V1',
    tax_pct: 17, discount: 50,
    items: [{ product_id: pa, kind: 'SALE', pcs: 33, unit_price: 10.105 },
            { product_id: pb, kind: 'SALE', pcs: 12, unit_price: 33.33 },
            { product_id: pc, kind: 'SALE', pcs: 40, unit_price: 25 }] });
  const full = db.getBillById(bill.id);

  // hand-derived bill figures
  const lPA = round2(33 * 10.105), lPB = round2(12 * 33.33), lPC = round2(40 * 25);
  const billSub = round2(lPA + lPB + lPC);            // 1733.43
  const billTO = round2(round2(billSub * 2.5 / 100)); // 43.34
  check('D bill subtotal (hand)', full.subtotal, billSub);
  check('D bill subtotal value', billSub, 1733.43);
  check('D bill tax (hand)', full.tax_amount, round2(billSub * 17 / 100));
  check('D bill trade_offer (hand)', full.trade_offer, billTO);
  check('D bill total (hand)', full.total, round2(billSub + round2(billSub * 17 / 100) - billTO - 50));
  check('D bill total value', full.total, 1934.77);

  // helper: hand-derive a return's five figures from first principles (spec)
  function handReturn(creditLines) { // creditLines: [{pcs, rate}]  (rate already <= billed)
    const s = round2(creditLines.reduce((a, l) => a + (l.pcs > 0 ? round2(l.pcs * Math.max(0, l.rate)) : 0), 0));
    const t = round2(s * 17 / 100);
    const ratio = billSub > 0 ? Math.min(1, Math.max(0, s / billSub)) : 0;
    const rto = round2(billTO * ratio);
    const rd = round2(50 * ratio);
    const tot = round2(s + t - rto - rd);
    return { s, t, rto, rd, tot };
  }

  // RET1: partial, MIXED GOOD/DAMAGED, fractional rates (PA 7 GOOD @10.105, PB 5 DAMAGED @33.33)
  const sim1 = simulate(bill.id, { PA: { pcs: 7, kind: 'GOOD' }, PB: { pcs: 5, kind: 'DAMAGED' } });
  const r1 = db.createSalesReturn({ return_date: D, prefix: 'RET', bill_id: bill.id, bill_number: full.bill_number,
    customer_code: 'CD', customer_name: 'D', van: 'V1', tax_pct: full.tax_pct, notes: '', items: sim1.items });
  const st1 = db.getSalesReturnById(r1.id);
  const h1 = handReturn([{ pcs: 7, rate: 10.105 }, { pcs: 5, rate: 33.33 }]);
  // parity: screen == stored
  check('D RET1 subtotal screen==stored', sim1.sSub, st1.subtotal);
  check('D RET1 tax screen==stored', sim1.sTax, st1.tax_amount);
  check('D RET1 trade_offer screen==stored', sim1.off.to, st1.trade_offer);
  check('D RET1 discount screen==stored', sim1.off.disc, st1.discount);
  check('D RET1 total screen==stored', sim1.sTotal, st1.total);
  // and both equal the independent hand derivation
  check('D RET1 subtotal (hand)', st1.subtotal, h1.s);
  check('D RET1 tax (hand)', st1.tax_amount, h1.t);
  check('D RET1 trade_offer (hand)', st1.trade_offer, h1.rto);
  check('D RET1 discount (hand)', st1.discount, h1.rd);
  check('D RET1 total (hand)', st1.total, h1.tot);
  check('D RET1 figures value', [st1.subtotal, st1.tax_amount, st1.trade_offer, st1.discount, st1.total], [237.39, 40.36, 5.94, 6.85, 264.96]);
  check('D RET1 restock=GOOD only (7), damaged=5', [st1.restock_pcs, st1.damaged_pcs], [7, 5]);

  // RET2: FULL line return (PC 40 @ 25, GOOD)
  const sim2 = simulate(bill.id, { PC: { pcs: 40, kind: 'GOOD' } });
  const r2b = db.createSalesReturn({ return_date: D, prefix: 'RET', bill_id: bill.id, bill_number: full.bill_number,
    customer_code: 'CD', customer_name: 'D', van: 'V1', tax_pct: full.tax_pct, notes: '', items: sim2.items });
  const st2 = db.getSalesReturnById(r2b.id);
  const h2 = handReturn([{ pcs: 40, rate: 25 }]);
  check('D RET2 subtotal screen==stored', sim2.sSub, st2.subtotal);
  check('D RET2 tax screen==stored', sim2.sTax, st2.tax_amount);
  check('D RET2 trade_offer screen==stored', sim2.off.to, st2.trade_offer);
  check('D RET2 discount screen==stored', sim2.off.disc, st2.discount);
  check('D RET2 total screen==stored', sim2.sTotal, st2.total);
  check('D RET2 total (hand)', st2.total, h2.tot);
  check('D RET2 figures value', [st2.subtotal, st2.tax_amount, st2.trade_offer, st2.discount, st2.total], [1000, 170, 25, 28.84, 1116.16]);

  // getBillForReturn remaining reflects cumulative returns
  const after = db.getBillForReturn(bill.id).items;
  const remPA = after.find(i => i.sku_code === 'PA').remaining_pcs;
  const remPC = after.find(i => i.sku_code === 'PC').remaining_pcs;
  check('D remaining PA after RET1 (33-7)', remPA, 26);
  check('D remaining PC after RET2 (40-40)', remPC, 0);
})();

console.log('=== E. Return guards (DB-level, bypassing the screen floor) ===');
(function () {
  freshDb();
  const pa = db.addProduct({ sku_code: 'PA', name: 'PA', price: 10.105, cost: 6, pcs_per_dozen: 12, stock_qty: 1000 }).id;
  const pb = db.addProduct({ sku_code: 'PB', name: 'PB', price: 33.33, cost: 20, pcs_per_dozen: 12, stock_qty: 1000 }).id;
  const pc = db.addProduct({ sku_code: 'PC', name: 'PC', price: 25, cost: 15, pcs_per_dozen: 12, stock_qty: 1000 }).id;
  const bill = db.createBill({ bill_date: D, customer_code: 'CE', customer_name: 'E', van: 'V1', tax_pct: 0,
    items: [{ product_id: pa, kind: 'SALE', pcs: 20, unit_price: 10.105 },
            { product_id: pb, kind: 'SALE', pcs: 10, unit_price: 33.33 },
            { product_id: pc, kind: 'SALE', pcs: 40, unit_price: 25 }] });
  const full = db.getBillById(bill.id);
  const biPA = full.items.find(i => i.sku_code === 'PA').id;
  const biPB = full.items.find(i => i.sku_code === 'PB').id;
  const biPC = full.items.find(i => i.sku_code === 'PC').id;
  const meta = { return_date: D, prefix: 'RET', bill_id: bill.id, bill_number: full.bill_number,
    customer_code: 'CE', customer_name: 'E', van: 'V1', tax_pct: 0, notes: '' };

  // (1) negative unit_price credits 0 and never adds to sales; GOOD still restocks
  const paBefore = db.getAllProducts().find(p => p.sku_code === 'PA').stock_qty;
  const rNeg = db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPA, product_id: pa, kind: 'GOOD', pcs: 5, unit_price: -3 }] });
  const stNeg = db.getSalesReturnById(rNeg.id);
  const paAfter = db.getAllProducts().find(p => p.sku_code === 'PA').stock_qty;
  check('E neg-price line credits 0 (subtotal)', stNeg.subtotal, 0);
  check('E neg-price stored unit_price floored to 0', stNeg.items[0].unit_price, 0);
  check('E neg-price line_total 0', stNeg.items[0].line_total, 0);
  check('E neg-price total not negative', stNeg.total, 0);
  check('E neg-price GOOD still restocked +5', round2(paAfter - paBefore), 5);

  // (2) return rate ABOVE the billed rate is capped to the billed rate
  const rCap = db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPB, product_id: pb, kind: 'DAMAGED', pcs: 4, unit_price: 99 }] });
  const stCap = db.getSalesReturnById(rCap.id);
  check('E above-billed rate capped to 33.33', stCap.items[0].unit_price, 33.33);
  check('E capped line_total = round2(4*33.33)', stCap.items[0].line_total, round2(4 * 33.33));
  check('E capped line_total value', stCap.items[0].line_total, 133.32);
  check('E capped subtotal', stCap.subtotal, 133.32);

  // (3) over-return blocked CUMULATIVELY
  db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPC, product_id: pc, kind: 'GOOD', pcs: 30, unit_price: 25 }] }); // 30 of 40
  checkThrows('E over-return blocked (15 > 10 left)',
    () => db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPC, product_id: pc, kind: 'GOOD', pcs: 15, unit_price: 25 }] }),
    /only 10 left/);
  // exactly the remaining 10 is allowed
  const rExact = db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPC, product_id: pc, kind: 'GOOD', pcs: 10, unit_price: 25 }] });
  check('E exact-remaining return allowed', db.getSalesReturnById(rExact.id).subtotal, round2(10 * 25));
  // now nothing left
  checkThrows('E further return blocked (0 left)',
    () => db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPC, product_id: pc, kind: 'GOOD', pcs: 1, unit_price: 25 }] }),
    /only 0 left/);

  // (4) a return line naming a bill line of a DIFFERENT product is rejected
  checkThrows('E wrong bill-line product rejected',
    () => db.createSalesReturn({ ...meta, items: [{ bill_item_id: biPA, product_id: pc, kind: 'GOOD', pcs: 1, unit_price: 25 }] }),
    /not on bill/);
})();

console.log('=== F. Big-number sanity (no overflow / precision loss) ===');
(function () {
  freshDb();
  const pInt = db.addProduct({ sku_code: 'F1', name: 'Big', price: 12.5, cost: 8, pcs_per_dozen: 12, stock_qty: 100000 }).id;
  const rInt = db.createBill({ bill_date: D, customer_code: 'CF1', customer_name: 'F', van: 'V1',
    items: [{ product_id: pInt, kind: 'SALE', pcs: 100000, unit_price: 12.5 }] });
  const bInt = db.getBillById(rInt.id);
  check('F 100000 x 12.5 subtotal', bInt.subtotal, round2(100000 * 12.5));
  check('F 100000 x 12.5 value', bInt.subtotal, 1250000);
  check('F 100000 x 12.5 total', bInt.total, 1250000);

  freshDb();
  const pFrac = db.addProduct({ sku_code: 'F2', name: 'BigFrac', price: 10.105, cost: 6, pcs_per_dozen: 12, stock_qty: 100000 }).id;
  const rFrac = db.createBill({ bill_date: D, customer_code: 'CF2', customer_name: 'F', van: 'V1', tax_pct: 17,
    items: [{ product_id: pFrac, kind: 'SALE', pcs: 100000, unit_price: 10.105 }] });
  const bFrac = db.getBillById(rFrac.id);
  const subF = round2(100000 * 10.105); // 1010500
  check('F 100000 x 10.105 subtotal', bFrac.subtotal, subF);
  check('F 100000 x 10.105 value', subF, 1010500);
  check('F 100000 x 10.105 tax 17%', bFrac.tax_amount, round2(subF * 17 / 100));
  check('F 100000 x 10.105 total', bFrac.total, round2(subF + round2(subF * 17 / 100)));
})();

console.log('----------------------------------------------------------');
if (failures === 0) console.log('ALL PASS');
else console.log(`${failures} FAILURES`);
try { db.closeDb(); } catch (e) {}
process.exit(failures ? 1 : 0);
