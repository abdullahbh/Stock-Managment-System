/*
 * test-scenario-day.js  — FULL TRADING-DAY integration test for StockManager
 *
 * RUN (needs the node-ABI better-sqlite3 shim):
 *   cd <dbtest> && NODE_PATH=$PWD/node_modules node -r ./sqlite-shim.js test-scenario-day.js
 *
 * Exercises one whole business day end-to-end (purchases, ~15 bills across 3 vans,
 * group + per-product free-goods schemes, a % trade-offer scheme, manual/line trade
 * offers, sales returns) and asserts four cross-cutting invariants:
 *   (1) STOCK LEDGER BALANCES per product
 *   (2) PROFIT identity  profit == round2(net_rev - cost),  sales net of returns
 *   (3) CROSS-REPORT agreement  billSummary <-> dashboard <-> profitReport
 *   (4) FREE GOODS granted correctly (quantity + most-bought flavour)
 *
 * Every expected value is derived by hand from the documented business rules,
 * NOT copied back from the function under test.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const db   = require(__dirname + '/../database.js');

// ── tiny test harness ───────────────────────────────────────────
let failures = 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  PASS  ${name}`); }
  else { failures++; console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); }
}
// money compare: round both to paisa (2dp) then JSON-compare
function eqMoney(name, actual, expected) { check(name, round2(actual), round2(expected)); }
function checkThrows(name, fn, re) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) { failures++; console.log(`  FAIL  ${name}\n          expected throw /${re.source}/, but nothing threw`); return; }
  if (re.test(threw.message)) { console.log(`  PASS  ${name}  (threw: ${threw.message.slice(0,60)})`); }
  else { failures++; console.log(`  FAIL  ${name}\n          expected /${re.source}/, got: ${threw.message}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ── fresh temp DB ───────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smday-'));
db.initialize(path.join(dir, 'day.sqlite'));

const TODAY = new Date().toISOString().slice(0, 10);   // the single trading day; matches dashboard "today"

// ── catalogue: 8 products, two flavour groups + ungrouped ───────
const CAT = [
  { k: 'S190', sku: 'JAM-STRAW-190', name: 'Strawberry Jam 190', grp: 'JAM190', cost: 40,  price: 55  },
  { k: 'M190', sku: 'JAM-MANGO-190', name: 'Mango Jam 190',      grp: 'JAM190', cost: 42,  price: 58  },
  { k: 'X190', sku: 'JAM-MIXED-190', name: 'Mixed Jam 190',      grp: 'JAM190', cost: 41,  price: 57  },
  { k: 'S370', sku: 'JAM-STRAW-370', name: 'Strawberry Jam 370', grp: 'JAM370', cost: 70,  price: 95  },
  { k: 'M370', sku: 'JAM-MANGO-370', name: 'Mango Jam 370',      grp: 'JAM370', cost: 72,  price: 98  },
  { k: 'KET',  sku: 'KETCHUP-500',   name: 'Ketchup 500',        grp: '',       cost: 60,  price: 85  },
  { k: 'VIN',  sku: 'VINEGAR-750',   name: 'Vinegar 750',        grp: '',       cost: 30,  price: 45  }, // scheme-free
  { k: 'HON',  sku: 'HONEY-250',     name: 'Honey 250',          grp: '',       cost: 120, price: 160 }, // scheme-free
];
const idOf = {}, costOf = {}, priceOf = {}, skuOf = {};
for (const p of CAT) { costOf[p.k] = p.cost; priceOf[p.k] = p.price; skuOf[p.k] = p.sku; }

section('SETUP: products, schemes, opening stock');
for (const p of CAT) idOf[p.k] = db.addProduct({ sku_code: p.sku, name: p.name, grp: p.grp,
  pcs_per_dozen: 12, cost: p.cost, price: p.price, stock_qty: 100, min_stock: 24 }).id; // opening stock = 100 each

// Schemes:
//  G1 group JAM190  : every 24 pcs across the 3 flavours -> 2 free (off most-bought flavour)
//  G2 group JAM370  : every 36 pcs across the 2 flavours -> 3 free
//  P1 per-product KET: every 48 pcs -> 6 free
//  P2 per-product S190: every 12 pcs -> 1 free  ** must be SUPPRESSED (S190 is covered by G1) — no double dip **
//  T1 trade offer    : 2.5% off any bill with subtotal >= 5000
db.addScheme({ name: 'JAM190 group',  type: 'FREE_GOODS', grp: 'JAM190', buy_pcs: 24, free_pcs: 2, scheme_date: TODAY, active: 1 });
db.addScheme({ name: 'JAM370 group',  type: 'FREE_GOODS', grp: 'JAM370', buy_pcs: 36, free_pcs: 3, scheme_date: TODAY, active: 1 });
db.addScheme({ name: 'Ketchup deal',  type: 'FREE_GOODS', product_id: idOf.KET,  buy_pcs: 48, free_pcs: 6, scheme_date: TODAY, active: 1 });
db.addScheme({ name: 'Straw190 pp',   type: 'FREE_GOODS', product_id: idOf.S190, buy_pcs: 12, free_pcs: 1, scheme_date: TODAY, active: 1 });
db.addScheme({ name: 'Big bill 2.5%', type: 'TRADE_OFFER', offer_pct: 2.5, min_bill: 5000, scheme_date: TODAY, active: 1 });

// opening stock via a single purchase of 5000 pcs each at the listed cost
const OPENING = 100, PURCHASED = 5000;
db.createPurchase({ purchase_date: TODAY, vehicle_no: 'STK-1', supplier: 'Warehouse',
  items: CAT.map(p => ({ product_id: idOf[p.k], pcs: PURCHASED, unit_cost: p.cost })) });

// record opening stock precisely: after purchase every product = OPENING + PURCHASED
for (const p of db.getAllProducts())
  eqMoney(`opening stock ${p.sku_code} == ${OPENING + PURCHASED}`, p.stock_qty, OPENING + PURCHASED);

// ── the day's bills (fixed quantities; hand-computed expectations) ──
// sale line: [key, pcs, lineTradeOfferPct?]   replace line: [key, pcs]
// free: hand-derived expected FREE lines {key: pcs}
// subtotal/trade/taxAmt/total: hand-computed from the documented formulae
const BILLS = [
  { n:1,  van:'VAN-A', code:'C001', sale:[['S190',24],['M190',12],['X190',6]],
    free:[['S190',2]], subtotal:2358, trade:0, taxAmt:0, total:2358 },
  { n:2,  van:'VAN-A', code:'C002', sale:[['S370',36],['M370',24],['KET',48]],
    free:[['S370',3],['KET',6]], subtotal:9852, trade:246.3, taxAmt:0, total:9605.7 },
  { n:3,  van:'VAN-A', code:'C003', sale:[['HON',20],['VIN',30]], mto:100, disc:50,
    free:[], subtotal:4550, trade:100, taxAmt:0, total:4400 },
  { n:4,  van:'VAN-A', code:'C004', sale:[['S190',24]], replace:[['HON',6]],
    free:[['S190',2]], subtotal:1320, trade:0, taxAmt:0, total:1320 },
  { n:5,  van:'VAN-B', code:'C005', sale:[['KET',60,5]],
    free:[['KET',6]], subtotal:5100, trade:382.5, taxAmt:0, total:4717.5 },   // line 5% (255) + scheme 2.5% (127.5)
  { n:6,  van:'VAN-B', code:'C006', sale:[['S190',48],['M190',48],['X190',12]], mtoPct:3,
    free:[['S190',8]], subtotal:6108, trade:335.94, taxAmt:0, total:5772.06 },// tie S190==M190 -> first (S190)
  { n:7,  van:'VAN-B', code:'C007', sale:[['HON',10],['KET',24]], tax:17,
    free:[], subtotal:3640, trade:0, taxAmt:618.8, total:4258.8 },            // KET 24 < 48 -> no free; tax on pre-offer subtotal
  { n:8,  van:'VAN-B', code:'C008', sale:[['S370',72],['M370',36]],
    free:[['S370',9]], subtotal:10368, trade:259.2, taxAmt:0, total:10108.8 },
  { n:9,  van:'VAN-C', code:'C009', sale:[['M190',24],['S190',12],['X190',6]],
    free:[['M190',2]], subtotal:2394, trade:0, taxAmt:0, total:2394 },        // most-bought = M190
  { n:10, van:'VAN-C', code:'C010', sale:[['X190',30],['S190',24],['M190',12]],
    free:[['X190',4]], subtotal:3726, trade:0, taxAmt:0, total:3726 },        // most-bought = X190
  { n:11, van:'VAN-C', code:'C011', sale:[['VIN',100]], disc:200,
    free:[], subtotal:4500, trade:0, taxAmt:0, total:4300 },                  // VIN scheme-free
  { n:12, van:'VAN-A', code:'C005', sale:[['KET',96]],
    free:[['KET',12]], subtotal:8160, trade:204, taxAmt:0, total:7956 },      // C005 on VAN-A != bill5 (VAN-B)
  { n:13, van:'VAN-B', code:'C009', sale:[['S370',36],['M370',48]],
    free:[['M370',6]], subtotal:8124, trade:203.1, taxAmt:0, total:7920.9 },  // most-bought = M370
  { n:14, van:'VAN-C', code:'C012', sale:[['S190',24],['S370',36],['KET',48],['HON',5]],
    free:[['S190',2],['S370',3],['KET',6]], subtotal:9620, trade:240.5, taxAmt:0, total:9379.5 },
  { n:15, van:'VAN-A', code:'C011', sale:[['HON',40]], mto:300, disc:100,
    free:[], subtotal:6400, trade:460, taxAmt:0, total:5840 },                // manual 300 + scheme 160
];

function buildItems(b) {
  const items = [];
  for (const [k, pcs, pct] of (b.sale || [])) {
    const it = { product_id: idOf[k], kind: 'SALE', pcs };
    if (pct) it.trade_offer_pct = pct;
    items.push(it);
  }
  for (const [k, pcs] of (b.replace || [])) items.push({ product_id: idOf[k], kind: 'REPLACE', pcs });
  return items;
}

section('BILLING: create 15 bills, assert stored totals + free-goods (invariant 4)');
const billId = {};
for (const b of BILLS) {
  const res = db.createBill({
    prefix: 'DAY', bill_date: TODAY,
    customer_code: b.code, customer_name: 'Shop ' + b.code, customer_addr: 'Addr ' + b.code,
    van: b.van, booker: 'BK1', delivery_man: 'DM1', class: 'A',
    tax_pct: b.tax || 0, discount: b.disc || 0,
    manual_trade_offer: b.mto || 0, manual_trade_offer_pct: b.mtoPct || 0,
    items: buildItems(b),
  });
  billId[b.n] = res.id;
  const stored = db.getBillById(res.id);
  // core billing correctness — this is exactly what the "wrong rate" regression would break
  eqMoney(`bill#${b.n} subtotal`,    stored.subtotal,   b.subtotal);
  eqMoney(`bill#${b.n} trade_offer`, stored.trade_offer, b.trade);
  eqMoney(`bill#${b.n} tax_amount`,  stored.tax_amount, b.taxAmt);
  eqMoney(`bill#${b.n} total`,       stored.total,      b.total);
  // total must equal round2(subtotal + tax - trade - discount) rebuilt from the stored parts
  eqMoney(`bill#${b.n} total identity`, stored.total,
          round2(stored.subtotal + stored.tax_amount - stored.trade_offer - (stored.discount || 0)));

  // INVARIANT (4): FREE lines granted, at the right qty, against the right (most-bought) flavour
  const freeActual = {};
  for (const it of stored.items) if (it.kind === 'FREE') freeActual[it.product_id] = (freeActual[it.product_id] || 0) + it.pcs;
  const freeExpect = {};
  for (const [k, pcs] of b.free) freeExpect[idOf[k]] = pcs;
  check(`bill#${b.n} free-goods`, freeActual, freeExpect);
}

section('GUARDS: duplicate, missing van, closed day');
// duplicate shop+van+day (bill#1 was VAN-A / C001 / TODAY)
checkThrows('duplicate (shop,van,day) blocked', () => db.createBill({
  prefix: 'DAY', bill_date: TODAY, customer_code: 'C001', customer_name: 'Shop C001',
  van: 'VAN-A', items: [{ product_id: idOf.HON, kind: 'SALE', pcs: 12 }] }), /already billed/i);
// missing van
checkThrows('missing van rejected', () => db.createBill({
  prefix: 'DAY', bill_date: TODAY, customer_code: 'C099', customer_name: 'Shop C099',
  van: '', items: [{ product_id: idOf.HON, kind: 'SALE', pcs: 12 }] }), /van/i);
// closed day (isolated date, does not touch TODAY): a new bill now ROLLS FORWARD, never blocked
db.closeDay('2001-01-01');
const rolled = db.createBill({
  prefix: 'DAY', bill_date: '2001-01-01', customer_code: 'C098', customer_name: 'Shop C098',
  van: 'VAN-A', items: [{ product_id: idOf.HON, kind: 'SALE', pcs: 12 }] });
check('closed day rolls the bill to the next open day', rolled.bill_date, '2001-01-02');
db.deleteBill(rolled.id);   // undo the roll-forward so the count invariant below still holds
// the duplicate + missing-van calls inserted nothing, and the rolled bill was removed
check('exactly 15 bills exist', db.getAllBills({}).length, 15);

section('SALES RETURNS: bill-linked partial, damaged, standalone bulk');
// R1: bill#1, GOOD 6 pcs of S190 (partial)
const b1 = db.getBillForReturn(billId[1]);
const b1s190 = b1.items.find(x => x.product_id === idOf.S190 && x.kind === 'SALE');
const R1 = db.createSalesReturn({ prefix: 'RET', return_date: TODAY, bill_id: billId[1], bill_number: b1.bill_number,
  customer_code: b1.customer_code, customer_name: b1.customer_name, van: b1.van, booker: b1.booker,
  delivery_man: b1.delivery_man, tax_pct: 0,
  items: [{ bill_item_id: b1s190.bill_item_id, product_id: idOf.S190, kind: 'GOOD', pcs: 6, unit_price: b1s190.unit_price }] });
// R2: bill#2, GOOD 6 of S370 + DAMAGED 6 of M370
const b2 = db.getBillForReturn(billId[2]);
const b2s370 = b2.items.find(x => x.product_id === idOf.S370 && x.kind === 'SALE');
const b2m370 = b2.items.find(x => x.product_id === idOf.M370 && x.kind === 'SALE');
const R2 = db.createSalesReturn({ prefix: 'RET', return_date: TODAY, bill_id: billId[2], bill_number: b2.bill_number,
  customer_code: b2.customer_code, customer_name: b2.customer_name, van: b2.van, booker: b2.booker,
  delivery_man: b2.delivery_man, tax_pct: 0,
  items: [
    { bill_item_id: b2s370.bill_item_id, product_id: idOf.S370, kind: 'GOOD',    pcs: 6, unit_price: b2s370.unit_price },
    { bill_item_id: b2m370.bill_item_id, product_id: idOf.M370, kind: 'DAMAGED', pcs: 6, unit_price: b2m370.unit_price },
  ] });
// R3: standalone bulk (no bill), GOOD 20 of VIN
const R3 = db.createSalesReturn({ prefix: 'RET', return_date: TODAY, customer_code: 'C020', customer_name: 'Bulk return',
  van: 'VAN-A', tax_pct: 0, items: [{ product_id: idOf.VIN, kind: 'GOOD', pcs: 20, unit_price: priceOf.VIN }] });

// hand-computed return credits (independent of the app)
const r1sub = 6 * priceOf.S190;                         // 330
const r1total = round2(r1sub - round2(0 * (r1sub / 2358)));           // bill#1 trade 0 -> 330
const r2sub = 6 * priceOf.S370 + 6 * priceOf.M370;      // 1158
const r2trade = round2(246.3 * (r2sub / 9852));         // pro-rated bill#2 trade -> 28.95
const r2total = round2(r2sub - r2trade);                // 1129.05
const r3sub = 20 * priceOf.VIN;                         // 900
const r3total = round2(r3sub);                          // standalone -> 900

const rr1 = db.getSalesReturnById(R1.id);
eqMoney('R1 total (bill-linked, trade 0)', rr1.total, r1total);
check('R1 restock 6 / damaged 0', [rr1.restock_pcs, rr1.damaged_pcs], [6, 0]);
const rr2 = db.getSalesReturnById(R2.id);
eqMoney('R2 total (pro-rated trade offer)', rr2.total, r2total);
check('R2 restock 6 (GOOD only) / damaged 6', [rr2.restock_pcs, rr2.damaged_pcs], [6, 6]);
const rr3 = db.getSalesReturnById(R3.id);
eqMoney('R3 total (standalone bulk)', rr3.total, r3total);
check('R3 restock 20 / damaged 0', [rr3.restock_pcs, rr3.damaged_pcs], [20, 0]);

// ── derive movements & report inputs independently from the specs ──
const billedPcs = {}, goodBack = {};
for (const k of Object.keys(idOf)) { billedPcs[k] = 0; goodBack[k] = 0; }
let grossSales = 0, taxTotal = 0, cogsBills = 0;
let saleMix = 0, freeMix = 0, replMix = 0;
for (const b of BILLS) {
  grossSales += b.total; taxTotal += b.taxAmt;
  for (const [k, pcs] of (b.sale || []))    { billedPcs[k] += pcs; cogsBills += pcs * costOf[k]; saleMix += pcs; }
  for (const [k, pcs] of (b.replace || [])) { billedPcs[k] += pcs; cogsBills += pcs * costOf[k]; replMix += pcs; }
  for (const [k, pcs] of (b.free || []))    { billedPcs[k] += pcs; cogsBills += pcs * costOf[k]; freeMix += pcs; }
}
// GOOD pieces that came back and restocked
goodBack.S190 += 6; goodBack.S370 += 6; goodBack.VIN += 20;   // M370 was DAMAGED -> not restocked
const returnsTotal = round2(r1total + r2total + r3total);
const returnsNet   = returnsTotal;                            // all returns carried tax_pct 0
const goodBackCost = 6 * costOf.S190 + 6 * costOf.S370 + 20 * costOf.VIN; // 240 + 420 + 600 = 1260

section('INVARIANT (1): stock ledger balances per product');
const prodBySku = {}; for (const p of db.getAllProducts()) prodBySku[p.sku_code] = p;
for (const p of CAT) {
  const expected = OPENING + PURCHASED - billedPcs[p.k] + goodBack[p.k];
  eqMoney(`ledger ${p.sku} : ${OPENING}+${PURCHASED}-${billedPcs[p.k]}+${goodBack[p.k]}`, prodBySku[p.sku].stock_qty, expected);
}

section('INVARIANT (2): profit identity + sales net of returns');
const netRevBills = grossSales - taxTotal;
const expSalesNet = round2(grossSales - returnsTotal);          // reported sales are NET of returns
const expCost     = round2(cogsBills - goodBackCost);           // GOOD returns reverse COGS; damaged stays a cost
const expReturns  = round2(returnsTotal);
const expNetRev   = netRevBills - returnsNet;
const expProfit   = round2(expNetRev - (cogsBills - goodBackCost));

const pr = db.getProfitReport({ granularity: 'daily', date_from: TODAY, date_to: TODAY });
check('profit report has 1 daily row', pr.rows.length, 1);
check('profit row period == TODAY', pr.rows.length ? pr.rows[0].period : null, TODAY);
const row = pr.rows[0] || {};
eqMoney('profit row sales (net of returns)', row.sales,   expSalesNet);
eqMoney('profit row cost (net of GOOD returns)', row.cost, expCost);
eqMoney('profit row returns',               row.returns, expReturns);
eqMoney('profit row profit == round2(net_rev - cost)', row.profit, expProfit);
eqMoney('profit totals sales', pr.totals.sales,   expSalesNet);
eqMoney('profit totals cost',  pr.totals.cost,    expCost);
eqMoney('profit totals returns', pr.totals.returns, expReturns);
eqMoney('profit totals profit', pr.totals.profit, expProfit);
// the identity itself, rebuilt from the report's own cost/returns and my hand net-rev:
eqMoney('profit == round2(net_rev - cost) [report internal]', pr.totals.profit, round2(expNetRev - pr.totals.cost));
// sanity: net sales are strictly below gross because returns happened
check('reported sales < gross (returns netted out)', pr.totals.sales < round2(grossSales), true);

section('INVARIANT (3): cross-report agreement');
// Convention verified from source:
//   getBillSummary.totals.total  = GROSS billed totals (returns listed separately, bill-linked only)
//   getDashboardStats.todaySales/monthSales = GROSS billed totals (no return netting)
//   getProfitReport rows/totals.sales = NET of returns (sales -= return total); returns bucketed separately
//   => GROSS == profitReport.sales + profitReport.returns
const bs = db.getBillSummary({ date_from: TODAY, date_to: TODAY });
const ds = db.getDashboardStats();
eqMoney('billSummary gross total == hand gross', bs.totals.total, grossSales);
eqMoney('dashboard todaySales == hand gross',   ds.todaySales, grossSales);
eqMoney('dashboard monthSales == hand gross',   ds.monthSales, grossSales);
check('dashboard todayBills == 15', ds.todayBills, 15);
check('dashboard monthCount == 15', ds.monthCount, 15);
// gross reconciliation across all three reports
eqMoney('recon gross: billSummary == dashboard monthSales', bs.totals.total, ds.monthSales);
eqMoney('recon gross: profitReport(sales+returns) == gross', round2(pr.totals.sales + pr.totals.returns), grossSales);
eqMoney('recon gross: profitReport(sales+returns) == billSummary', round2(pr.totals.sales + pr.totals.returns), bs.totals.total);
// returns reconciliation (dashboard + profitReport count ALL returns incl standalone)
eqMoney('dashboard monthReturns == all returns',   ds.monthReturns, returnsTotal);
eqMoney('dashboard todayReturns == all returns',   ds.todayReturns, returnsTotal);
eqMoney('recon returns: dashboard == profitReport', ds.monthReturns, pr.totals.returns);
// getBillSummary.returns counts ONLY bill-linked returns (R1+R2); the standalone R3 is not attributed to a bill
eqMoney('billSummary returns == bill-linked only (R1+R2)', bs.totals.returns, round2(r1total + r2total));
eqMoney('billSummary returns == all returns minus standalone', bs.totals.returns, round2(returnsTotal - r3total));
// piece mix classifies every stock-moving piece (SALE/FREE/REPLACE) correctly
check('dashboard pieceMix SALE/FREE/REPLACE', ds.pieceMix, { SALE: saleMix, FREE: freeMix, REPLACE: replMix });

section('INVARIANT (4) spot-checks: most-bought flavour + no double-dip');
// bill#6 tie (S190==M190 at 48) resolves to the first line -> S190 (per source: strict > keeps earlier)
check('bill#6 free flavour == S190 (tie -> first)',
      db.getBillById(billId[6]).items.filter(i => i.kind === 'FREE').map(i => [i.sku_code, i.pcs]),
      [['JAM-STRAW-190', 8]]);
// bill#9 most-bought is M190 (not the first line)
check('bill#9 free flavour == M190 (most-bought, not first)',
      db.getBillById(billId[9]).items.filter(i => i.kind === 'FREE').map(i => [i.sku_code, i.pcs]),
      [['JAM-MANGO-190', 2]]);
// bill#13 most-bought 370 is M370
check('bill#13 free flavour == M370 (most-bought, not first)',
      db.getBillById(billId[13]).items.filter(i => i.kind === 'FREE').map(i => [i.sku_code, i.pcs]),
      [['JAM-MANGO-370', 6]]);
// NO DOUBLE-DIP: S190 has a per-product scheme (P2 buy12/free1) but is always covered by G1,
// so bill#1 (S190 24) must yield ONLY the group's 2 free — never 2 + floor(24/12)*1 = 4.
check('bill#1 S190 free is group-only (no double-dip)',
      db.getBillById(billId[1]).items.filter(i => i.kind === 'FREE' && i.sku_code === 'JAM-STRAW-190').map(i => i.pcs),
      [2]);

// ── done ────────────────────────────────────────────────────────
console.log(`\n${failures ? failures + ' FAILURES' : 'ALL PASS'}`);
try { db.closeDb(); } catch (e) {}
process.exit(failures ? 1 : 0);
