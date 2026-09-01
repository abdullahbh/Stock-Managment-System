// Editing a saved bill: an untouched line keeps its as-billed rate; changing a line's code follows the new product.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = __dirname + '/..';
const html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

const PRODUCTS = [
  { id: 2, sku_code: '2',  name: 'MANGO 225ML BOT', price: 110, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
  { id: 5, sku_code: '24', name: 'HAPPY FARM 1L',    price: 250, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
];
// a saved bill where product 2 was billed at a NON-standard historical rate of 90 (a deal that day)
const SAVED_BILL = {
  id: 7, bill_number: 'HMS-1', bill_date: '2026-08-01', customer_code: 'C1', customer_name: 'Shop', customer_addr: '',
  van: 'V1', booker: '', delivery_man: '', class: '', tax_pct: 0, discount: 0,
  manual_trade_offer: 0, manual_trade_offer_pct: 0, scheme_off: 0, notes: '',
  items: [{ id: 1, product_id: 2, sku_code: '2', product_name: 'MANGO 225ML BOT', kind: 'SALE', pcs: 12, unit_price: 90, trade_offer: 0, trade_offer_pct: 0 }],
};
const api = {
  getSettings: async () => ({}), getProducts: async () => PRODUCTS, getSchemes: async () => [],
  getCustomers: async () => [], listMasters: async () => [], getStats: async () => ({ last7: [], topProducts: [], salesByVan: [], pieceMix: {}, lowStockItems: [], recentBills: [], recentLoads: [], recentReturns: [], inventoryItems: [] }),
  getBill: async () => JSON.parse(JSON.stringify(SAVED_BILL)),
};
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom; window.api = api;
window.brand = { id: 'haramain', name: 'Test', accent: '#1d4f91', accentSoft: '#0e2a4f', billPrefix: 'HMS', loadPrefix: 'HL', returnPrefix: 'HR' };
const doc = window.document;
let failures = 0;
const check = (n, a, e) => { const ok = a === e; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  got=${a} expected=${e}`}`); };
const rateOf = (row) => +row.querySelector('input[data-k="unit_price"]').value;
function typeCode(row, code) {
  const inp = row.querySelector('input[data-k="code"]'); inp.value = '';
  for (const ch of String(code)) { inp.value += ch; inp.dispatchEvent(new window.Event('input', { bubbles: true })); }
}

(async () => {
  await new Promise(r => setTimeout(r, 150));
  window.editBill(7);
  await new Promise(r => setTimeout(r, 150));
  let row = doc.querySelector('#lineRows tr');
  check('loaded bill keeps its historical rate (90, not the product default 110)', rateOf(row), 90);

  // change the line's product code 2 -> 24 : rate must follow the new product (250), not stay 90
  typeCode(row, '24');
  row = doc.querySelector('#lineRows tr');
  check('changing the code on an edited bill follows the new product rate', rateOf(row), 250);

  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
