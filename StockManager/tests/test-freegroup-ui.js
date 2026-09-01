// Drives the REAL product + scheme modals in jsdom and confirms grp round-trips through the payload.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = __dirname + '/..';
const html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

const PRODUCTS = [
  { id: 1, sku_code: 'JM', name: 'Mango Jam 190g', price: 100, cost: 60, pcs_per_dozen: 12, stock_qty: 10, min_stock: 0, grp: 'JAM190', active: 1 },
  { id: 2, sku_code: 'JA', name: 'Apple Jam 190g', price: 100, cost: 60, pcs_per_dozen: 12, stock_qty: 10, min_stock: 0, grp: 'JAM190', active: 1 },
];
let addedProduct = null, addedScheme = null;
const api = {
  getSettings: async () => ({}), getProducts: async () => PRODUCTS, getSchemes: async () => [],
  getCustomers: async () => [], listMasters: async () => [], getStats: async () => ({ last7: [], topProducts: [], salesByVan: [], pieceMix: {}, lowStockItems: [], recentBills: [], recentLoads: [], recentReturns: [], inventoryItems: [] }),
  addProduct: async (p) => { addedProduct = p; return { id: 9 }; }, updateProduct: async () => ({ success: true }),
  addScheme: async (s) => { addedScheme = s; return { id: 9 }; }, updateScheme: async () => ({ success: true }),
};
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom; window.api = api;
window.brand = { id: 'haramain', name: 'Test', accent: '#1d4f91', accentSoft: '#0e2a4f', billPrefix: 'HMS', loadPrefix: 'HL', returnPrefix: 'HR' };
const doc = window.document;
let failures = 0;
const check = (n, a, e) => { const ok = a === e; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  got=${JSON.stringify(a)} expected=${JSON.stringify(e)}`}`); };
const set = (sel, v) => { const el = doc.querySelector(sel); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };

(async () => {
  await new Promise(r => setTimeout(r, 150));
  window.go('products');
  await new Promise(r => setTimeout(r, 120));

  // ── product modal: Group field present and saved ──
  doc.querySelector('#addProd').click();
  await new Promise(r => setTimeout(r, 30));
  check('product modal has a Group field', !!doc.querySelector('#p_grp'), true);
  set('#p_sku', 'JX'); set('#p_name', 'Mixed Jam 190g'); set('#p_price', '100'); set('#p_grp', 'JAM190');
  doc.querySelector('#s').click();
  await new Promise(r => setTimeout(r, 30));
  check('addProduct payload carries grp', addedProduct && addedProduct.grp, 'JAM190');

  // ── scheme modal: group free-goods option ──
  window.go('schemes');
  await new Promise(r => setTimeout(r, 120));
  doc.querySelector('#addS').click();
  await new Promise(r => setTimeout(r, 30));
  check('scheme modal has an Applies-to selector', !!doc.querySelector('#s_applies'), true);
  set('#s_name', 'Jam dozen');
  set('#s_applies', 'group');
  check('choosing group reveals the group input', doc.querySelector('#fg_grp').style.display !== 'none', true);
  check('choosing group hides the product picker', doc.querySelector('#fg_prod').style.display, 'none');
  set('#s_grp', 'JAM190'); set('#s_buy', '12'); set('#s_free', '1');
  doc.querySelector('#ok').click();
  await new Promise(r => setTimeout(r, 30));
  check('addScheme payload carries grp', addedScheme && addedScheme.grp, 'JAM190');
  check('a group scheme sends no product_id', addedScheme && addedScheme.product_id, null);
  check('buy/free carried', addedScheme && [addedScheme.buy_pcs, addedScheme.free_pcs].join(','), '12,1');

  // ── a product free-goods scheme still sends product_id, no grp ──
  addedScheme = null;
  doc.querySelector('#addS').click(); await new Promise(r => setTimeout(r, 30));
  set('#s_name', 'Solo'); set('#s_applies', 'product'); set('#s_prod', '1'); set('#s_buy', '10'); set('#s_free', '1');
  doc.querySelector('#ok').click(); await new Promise(r => setTimeout(r, 30));
  check('product scheme sends product_id', addedScheme && addedScheme.product_id, 1);
  check('product scheme sends empty grp', addedScheme && addedScheme.grp, '');

  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
