// Editing a purchase adjusts stock and cost correctly, guards closed days and negative stock,
// and round-trips exactly like the Edit form sends it.
require('./sqlite-shim.js');
const path = require('path'), fs = require('fs'), os = require('os');
const db = require(path.join(__dirname, '..', 'database.js'));
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pedit-')), 't.db'), {});

let f = 0;
const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); if (!ok) f++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`); };
function checkThrows(n, fn, part) { try { fn(); f++; console.log(`FAIL ${n} (did not throw)`); }
  catch (e) { const ok = !part || e.message.toLowerCase().includes(part.toLowerCase()); if (!ok) f++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  msg=${e.message}`}`); } }
const D = '2026-08-29';
const stock = (sku) => db.getAllProducts().find(p => p.sku_code === sku).stock_qty;
const cost = (sku) => db.getAllProducts().find(p => p.sku_code === sku).cost;

db.addProduct({ sku_code: 'A', name: 'Alpha', price: 20, cost: 6, pcs_per_dozen: 12, stock_qty: 100 });
db.addProduct({ sku_code: 'B', name: 'Beta', price: 20, cost: 8, pcs_per_dozen: 12, stock_qty: 100 });
const A = db.getAllProducts().find(p => p.sku_code === 'A').id;
const B = db.getAllProducts().find(p => p.sku_code === 'B').id;

// create: +50 A @7  -> A stock 150, cost 7
const pur = db.createPurchase({ purchase_date: D, vehicle_no: 'V1', supplier: 'S', items: [{ product_id: A, pcs: 50, unit_cost: 7 }] });
check('create added stock', stock('A'), 150);
check('create set cost', cost('A'), 7);

// edit: change A to 30 pcs @9, and add B 20 @10
const up = db.updatePurchase(pur.id, { purchase_date: D, vehicle_no: 'V1', supplier: 'S',
  items: [{ product_id: A, pcs: 30, unit_cost: 9 }, { product_id: B, pcs: 20, unit_cost: 10 }] });
check('edit keeps the purchase number', up.purchase_number, pur.purchase_number);
check('A stock is opening + new only (100 + 30)', stock('A'), 130);   // old +50 reversed, new +30
check('A cost updated to new unit cost', cost('A'), 9);
check('B stock added (100 + 20)', stock('B'), 120);
check('B cost updated', cost('B'), 10);
check('edit total = 30*9 + 20*10', up.total, 470);
const saved = db.getPurchaseById(pur.id);
check('saved items reflect the edit', saved.items.map(i => [i.sku_code, i.pcs, i.unit_cost]).sort(), [['A', 30, 9], ['B', 20, 10]].sort());

// edit round-trip (what the Edit form sends: the saved items back) changes nothing
const items2 = saved.items.map(i => ({ product_id: i.product_id, pcs: i.pcs, unit_cost: i.unit_cost }));
db.updatePurchase(pur.id, { purchase_date: D, vehicle_no: 'V1', supplier: 'S', items: items2 });
check('round-trip leaves A stock unchanged', stock('A'), 130);
check('round-trip leaves B stock unchanged', stock('B'), 120);

// guard: editing so a product loses more stock than on hand is blocked
db.createBill({ bill_date: D, customer_code: 'C1', customer_name: 'Shop', van: 'VZ', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: A, kind: 'SALE', pcs: 125, unit_price: 20 }] });   // A: 130 -> 5
checkThrows('edit blocked when reversal would go negative',
  () => db.updatePurchase(pur.id, { purchase_date: D, items: [{ product_id: A, pcs: 1, unit_cost: 9 }] }),
  'negative');
check('A stock untouched by the blocked edit', stock('A'), 5);

// guard: closed day blocks editing
db.closeDay(D);
checkThrows('edit blocked on a closed day', () => db.updatePurchase(pur.id, { purchase_date: D, items: [{ product_id: B, pcs: 5, unit_cost: 10 }] }), 'closed');
db.openDay(D);

// empty items rejected
checkThrows('edit needs at least one product', () => db.updatePurchase(pur.id, { purchase_date: D, items: [] }), 'at least one');
// unknown purchase
checkThrows('edit unknown purchase', () => db.updatePurchase(999999, { items: [{ product_id: A, pcs: 1, unit_cost: 9 }] }), 'not found');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
process.exit(f ? 1 : 0);
