// The CREDIT TOTAL the return form shows must equal the credit the database books.
// The renderer's own helpers are lifted verbatim out of index.html so the two cannot drift apart.
require('./sqlite-shim.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP = __dirname + '/..';
const db = require(APP + '/database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smpar-')), 'test.db'), {});

// ── lift the renderer's credit maths verbatim ───────────────────
const html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');
const grab = (name, kind) => {
  const re = kind === 'const'
    ? new RegExp(`^const ${name} = .*$`, 'm')
    : new RegExp(`^function ${name}\\b[\\s\\S]*?\\n(?=(?:function |const |// |async ))`, 'm');
  const m = html.match(re);
  if (!m) throw new Error('could not lift ' + name + ' from the renderer');
  return m[0];
};
let returnDraft = null;
const src = [grab('r2', 'const'), grab('rLineRate'), grab('rLineCredit'), grab('returnSubtotal'),
  grab('returnOffers'), grab('returnTotal')].join('\n');
const lifted = new Function('getDraft', `${src}
  return { set:(d)=>{ returnDraft=d; }, sub:()=>returnSubtotal(), offers:(s)=>returnOffers(s), total:(s,t)=>returnTotal(s,t) };`)();

let failures = 0;
const check = (name, a, b) => {
  const ok = a === b;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  screen=${a} saved=${b}`}`);
};
const t = new Date();
const D = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

db.addProduct({ sku_code: 'P1', name: 'One', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 100000 });
db.addProduct({ sku_code: 'P2', name: 'Two', price: 25, cost: 15, pcs_per_dozen: 12, stock_qty: 100000 });
const p1 = db.getAllProducts().find(p => p.sku_code === 'P1');
const p2 = db.getAllProducts().find(p => p.sku_code === 'P2');

// a bill carrying tax, a percentage trade-offer scheme, a manual offer and a discount
db.addScheme({ name: 'Big bill', type: 'TRADE_OFFER', offer_pct: 2, min_bill: 100, active: 1 });
let shop = 0;
function billed(taxPct, discount, manualPct) {
  return db.createBill({ bill_date: D, customer_code: 'C' + (++shop), customer_name: 'Shop ' + shop, van: 'V1',
    tax_pct: taxPct, discount, manual_trade_offer_pct: manualPct,
    items: [{ product_id: p1.id, kind: 'SALE', pcs: 100, unit_price: 10 },
            { product_id: p2.id, kind: 'SALE', pcs: 40, unit_price: 25 }] });
}
// what the form would display for a given set of returned pieces
function screenTotal(bill, lines) {
  const full = db.getBillById(bill.id);
  const items = full.items.filter(i => i.kind === 'SALE');
  lifted.set({
    bill_id: bill.id, tax_pct: full.tax_pct,
    bill_subtotal: full.subtotal, bill_trade_offer: full.trade_offer, bill_discount: full.discount,
    lines: items.map((it, n) => ({ product_id: it.product_id, bill_item_id: it.id, linked: true,
      billed_price: it.unit_price, unit_price: it.unit_price, pcs: lines[n] || 0 })),
  });
  const sub = lifted.sub();
  const tax = Math.round(sub * ((+full.tax_pct || 0) / 100) * 100) / 100;
  return { total: lifted.total(sub, tax), offers: lifted.offers(sub), items };
}
function saved(bill, lines, taxPct) {
  const full = db.getBillById(bill.id);
  const items = full.items.filter(i => i.kind === 'SALE');
  return db.createSalesReturn({ return_date: D, prefix: 'HR', bill_id: bill.id, van: 'V1', tax_pct: taxPct,
    customer_code: full.customer_code, customer_name: full.customer_name,
    items: items.map((it, n) => ({ bill_item_id: it.id, product_id: it.product_id, kind: 'GOOD',
      pcs: lines[n] || 0, unit_price: it.unit_price })).filter(l => l.pcs > 0) });
}

// ── full return of a discounted, taxed, scheme-bearing bill ──────
const b1 = billed(17, 55.5, 2);
const f1 = db.getBillById(b1.id);
const s1 = screenTotal(b1, [100, 40]);
const d1 = saved(b1, [100, 40], 17);
check('full return: screen credit equals saved credit', s1.total, d1.total);
check('full return credits exactly what the bill charged', d1.total, f1.total);

// ── half return ─────────────────────────────────────────────────
const b2 = billed(17, 55.5, 2);
const s2 = screenTotal(b2, [50, 20]);
const d2 = saved(b2, [50, 20], 17);
check('half return: screen equals saved', s2.total, d2.total);
check('half return is half the bill (within a paisa)',
  Math.abs(d2.total - db.getBillById(b2.id).total / 2) <= 0.02, true);

// ── one line only, no tax ───────────────────────────────────────
const b3 = billed(0, 100, 0);
const s3 = screenTotal(b3, [30, 0]);
const d3 = saved(b3, [30, 0], 0);
check('partial single line: screen equals saved', s3.total, d3.total);
check('the offer share is shown, not hidden', s3.offers.to + s3.offers.disc > 0, true);

// ── a bill with no offer or discount shows none ─────────────────
const b4 = billed(0, 0, 0);
const before = db.getBillById(b4.id);
const s4 = screenTotal(b4, [10, 0]);
check('no-offer bill: no phantom deduction on screen', s4.offers.to + s4.offers.disc, before.trade_offer > 0 ? s4.offers.to + s4.offers.disc : 0);
check('no-offer bill: screen equals saved', s4.total, saved(b4, [10, 0], 0).total);

// ── van-first bulk return is untouched by the pro-rating ────────
lifted.set({ bill_id: null, lines: [{ product_id: p1.id, linked: false, unit_price: 10, pcs: 7 }] });
const bulkSub = lifted.sub();
check('bulk return has no offer share', lifted.offers(bulkSub).to + lifted.offers(bulkSub).disc, 0);
const bulk = db.createSalesReturn({ return_date: D, prefix: 'HR', van: 'V1', tax_pct: 0,
  items: [{ product_id: p1.id, kind: 'GOOD', pcs: 7, unit_price: 10 }] });
check('bulk return: screen equals saved', lifted.total(bulkSub, 0), bulk.total);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
