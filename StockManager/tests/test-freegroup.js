// Group free-goods: pieces across all flavours of a group count together toward the free piece.
require('./sqlite-shim.js');
const path = require('path'), fs = require('fs'), os = require('os');
const db = require(__dirname + '/../database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smfg-')), 't.db'), {});

let failures = 0;
const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`); };
const t = new Date();
const D = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

// three flavours of a 190g jam, one flavour of a different pack, one ungrouped product
db.addProduct({ sku_code: 'JM', name: 'Mango Jam 190g',  price: 100, cost: 60, pcs_per_dozen: 12, stock_qty: 10000, grp: 'JAM190' });
db.addProduct({ sku_code: 'JA', name: 'Apple Jam 190g',  price: 100, cost: 60, pcs_per_dozen: 12, stock_qty: 10000, grp: 'JAM190' });
db.addProduct({ sku_code: 'JX', name: 'Mixed Jam 190g',  price: 100, cost: 60, pcs_per_dozen: 12, stock_qty: 10000, grp: 'JAM190' });
db.addProduct({ sku_code: 'K7', name: 'Ketchup 370g',    price: 200, cost: 90, pcs_per_dozen: 12, stock_qty: 10000, grp: 'KET370' });
db.addProduct({ sku_code: 'SOLO', name: 'Solo Product',  price: 50,  cost: 30, pcs_per_dozen: 12, stock_qty: 10000, grp: '' });
const P = Object.fromEntries(db.getAllProducts().map(p => [p.sku_code, p]));

check('grp stored on product', P.JM.grp, 'JAM190');

// group free-goods: buy 12 across the group -> 1 free
db.addScheme({ name: 'Jam 190 dozen', type: 'FREE_GOODS', grp: 'JAM190', buy_pcs: 12, free_pcs: 1, active: 1 });
// per-product free-goods on an ungrouped product (backward compat path)
db.addScheme({ name: 'Solo promo', type: 'FREE_GOODS', product_id: P.SOLO.id, buy_pcs: 10, free_pcs: 1, active: 1 });
check('grp stored on scheme', db.getAllSchemes().find(s => s.name === 'Jam 190 dozen').grp, 'JAM190');

const bill = (over, items) => db.createBill(Object.assign({ bill_date: D, customer_code: 'C' + (bill._n = (bill._n || 0) + 1),
  customer_name: 'Shop', van: 'V1', tax_pct: 0, discount: 0, scheme_off: false }, over || {}), items);
function freeLines(id) { return db.getBillById(id).items.filter(i => i.kind === 'FREE').map(i => [i.sku_code, i.pcs, i.note]); }

// 5 mango + 4 apple + 3 mix = 12  ->  1 free, taken from the most-bought flavour (mango)
let r = db.createBill({ bill_date: D, customer_code: 'A1', customer_name: 'Shop A', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 5, unit_price: 100 },
          { product_id: P.JA.id, kind: 'SALE', pcs: 4, unit_price: 100 },
          { product_id: P.JX.id, kind: 'SALE', pcs: 3, unit_price: 100 }] });
check('mixed flavours reaching a dozen earn 1 free', freeLines(r.id), [['JM', 1, 'Jam 190 dozen']]);

// stock: mango sold 5 + 1 free = 6 off; apple 4; mix 3
check('free piece came off the mango flavour stock', db.getAllProducts().find(p => p.sku_code === 'JM').stock_qty, 10000 - 6);
check('apple stock only the sold pieces', db.getAllProducts().find(p => p.sku_code === 'JA').stock_qty, 10000 - 4);

// 12 of a single flavour in the group still earns 1 free of that flavour
r = db.createBill({ bill_date: D, customer_code: 'A2', customer_name: 'Shop B', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JA.id, kind: 'SALE', pcs: 12, unit_price: 100 }] });
check('12 of one flavour → 1 free of it', freeLines(r.id), [['JA', 1, 'Jam 190 dozen']]);

// 24 across the group → 2 free
r = db.createBill({ bill_date: D, customer_code: 'A3', customer_name: 'Shop C', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 10, unit_price: 100 },
          { product_id: P.JX.id, kind: 'SALE', pcs: 14, unit_price: 100 }] });
check('two dozen across the group → 2 free (from top flavour)', freeLines(r.id), [['JX', 2, 'Jam 190 dozen']]);

// 11 total → nothing
r = db.createBill({ bill_date: D, customer_code: 'A4', customer_name: 'Shop D', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 6, unit_price: 100 },
          { product_id: P.JA.id, kind: 'SALE', pcs: 5, unit_price: 100 }] });
check('under a dozen earns nothing', freeLines(r.id), []);

// a different group with no scheme earns nothing
r = db.createBill({ bill_date: D, customer_code: 'A5', customer_name: 'Shop E', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.K7.id, kind: 'SALE', pcs: 24, unit_price: 200 }] });
check('a group without a scheme earns nothing', freeLines(r.id), []);

// ungrouped per-product scheme still works
r = db.createBill({ bill_date: D, customer_code: 'A6', customer_name: 'Shop F', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.SOLO.id, kind: 'SALE', pcs: 20, unit_price: 50 }] });
check('per-product scheme still fires', freeLines(r.id), [['SOLO', 2, 'Solo promo']]);

// no double-dip: a per-product scheme on a grouped flavour must NOT stack on the group scheme
db.addScheme({ name: 'Old mango only', type: 'FREE_GOODS', product_id: P.JM.id, buy_pcs: 12, free_pcs: 1, active: 1 });
r = db.createBill({ bill_date: D, customer_code: 'A7', customer_name: 'Shop G', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 12, unit_price: 100 }] });
check('grouped flavour does not double-earn from an old per-product scheme', freeLines(r.id), [['JM', 1, 'Jam 190 dozen']]);

// DEF-1: a below-threshold group must NOT suppress a product's own per-product scheme
db.addScheme({ name: 'Mango six', type: 'FREE_GOODS', product_id: P.JM.id, buy_pcs: 6, free_pcs: 1, active: 1 });
r = db.createBill({ bill_date: D, customer_code: 'B1', customer_name: 'Shop I', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 6, unit_price: 100 }] });   // 6 < group's 12, but hits the per-product 6
check('below-group-threshold still earns the per-product free', freeLines(r.id), [['JM', 1, 'Mango six']]);
// and when the group DOES fire, the per-product scheme does not also stack
r = db.createBill({ bill_date: D, customer_code: 'B2', customer_name: 'Shop J', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 12, unit_price: 100 }] });
check('group fires → no extra per-product free on same flavour', freeLines(r.id), [['JM', 1, 'Jam 190 dozen']]);
db.getAllSchemes().filter(s => s.name === 'Mango six').forEach(s => db.deleteScheme(s.id));

// DEF-3: two group schemes on the same group must not stack — the best-ratio eligible one wins, once
db.addScheme({ name: 'Jam two dozen', type: 'FREE_GOODS', grp: 'JAM190', buy_pcs: 24, free_pcs: 3, active: 1 }); // ratio .125 (better)
r = db.createBill({ bill_date: D, customer_code: 'B3', customer_name: 'Shop K', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JA.id, kind: 'SALE', pcs: 24, unit_price: 100 }] });
check('two group schemes → one free line only', freeLines(r.id).length, 1);
check('the better-ratio eligible group scheme wins (24→3)', freeLines(r.id), [['JA', 3, 'Jam two dozen']]);
// at only 12 pcs the 24-buy scheme cannot fire, so the 12-buy one still gives 1
r = db.createBill({ bill_date: D, customer_code: 'B4', customer_name: 'Shop L', van: 'V1', tax_pct: 0, discount: 0,
  items: [{ product_id: P.JA.id, kind: 'SALE', pcs: 12, unit_price: 100 }] });
check('a dozen still earns the 12-buy group scheme', freeLines(r.id), [['JA', 1, 'Jam 190 dozen']]);
db.getAllSchemes().filter(s => s.name === 'Jam two dozen').forEach(s => db.deleteScheme(s.id));

// scheme_off suppresses group free goods
r = db.createBill({ bill_date: D, customer_code: 'A8', customer_name: 'Shop H', van: 'V1', tax_pct: 0, discount: 0, scheme_off: true,
  items: [{ product_id: P.JM.id, kind: 'SALE', pcs: 12, unit_price: 100 }] });
check('scheme_off suppresses group free goods', freeLines(r.id), []);

// COGS of the free line uses the free flavour's cost (profit reflects the given piece)
const prof = db.getProfitReport({ date_from: D, date_to: D });
check('profit report still runs with group free goods', typeof prof.totals.profit, 'number');

// migration: an older DB with no grp columns upgrades cleanly
const old = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smfgold-')), 'old.db');
const Database = require('better-sqlite3');
const raw = new Database(old);
raw.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT UNIQUE, name TEXT, unit TEXT, pcs_per_dozen INTEGER, price REAL, cost REAL, stock_qty REAL, min_stock REAL, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
  INSERT INTO products(sku_code,name,pcs_per_dozen,price,cost,stock_qty) VALUES('OLD','Old Prod',12,10,6,100);
  CREATE TABLE schemes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, product_id INTEGER, buy_pcs INTEGER, free_pcs INTEGER, offer_amount REAL, min_bill REAL, active INTEGER);`);
raw.close();
delete require.cache[require.resolve(__dirname + '/../database.js')];
const db2 = require(__dirname + '/../database.js');
db2.initialize(old, {});
const cols = new Database(old).pragma('table_info(products)').map(c => c.name);
check('old DB gains products.grp', cols.includes('grp'), true);
check('old product still reads', db2.getAllProducts()[0].name, 'Old Prod');

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
