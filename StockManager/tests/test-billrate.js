// Drives the REAL New Bill screen in jsdom and proves a product whose code shares a
// prefix with another product is billed at its OWN rate, not the prefix product's.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP = __dirname + '/..';
const html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

// products chosen to expose the prefix trap: "2" is a prefix of "21"/"24"; "1" of "106"
const PRODUCTS = [
  { id: 1, sku_code: '1',   name: 'FILLER ONE',            price: 110, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
  { id: 2, sku_code: '2',   name: 'MANGO 225ML BOT',       price: 110, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
  { id: 3, sku_code: '106', name: 'MANGO JAM 370G',        price: 280.83, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
  { id: 4, sku_code: '21',  name: 'FAMILLY PACK MANGO 1L', price: 200, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
  { id: 5, sku_code: '24',  name: 'HAPPY FARM MANGO 1L',   price: 250, cost: 0, pcs_per_dozen: 12, stock_qty: 9999, active: 1 },
];
const api = {
  getSettings: async () => ({}), getProducts: async () => PRODUCTS, getSchemes: async () => [],
  getCustomers: async () => [], listMasters: async () => [], getStats: async () => ({
    last7: [], topProducts: [], salesByVan: [], pieceMix: {}, lowStockItems: [], recentBills: [],
    recentLoads: [], recentReturns: [], inventoryItems: [] }),
};

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
window.api = api;
window.brand = { id: 'haramain', name: 'Test', accent: '#1d4f91', accentSoft: '#0e2a4f', billPrefix: 'HMS', loadPrefix: 'HL', returnPrefix: 'HR' };

let failures = 0;
const check = (name, a, b) => { const ok = a === b; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  got=${a} expected=${b}`}`); };

function typeCode(rowIndex, code) {
  const rows = window.document.querySelectorAll('#lineRows tr');
  const inp = rows[rowIndex].querySelector('input[data-k="code"]');
  // simulate character-by-character typing, exactly as a keyboard does
  inp.value = '';
  for (const ch of String(code)) {
    inp.value += ch;
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  return rows[rowIndex];
}
const rateOf = (row) => +row.querySelector('input[data-k="unit_price"]').value;
const amtText = (row) => row.children[7].textContent;

(async () => {
  // wait for init()'s async chain and go('dashboard') to settle
  await new Promise(r => setTimeout(r, 150));
  window.go('newbill');
  await new Promise(r => setTimeout(r, 120));

  // one product per line; add lines as needed
  const cases = [
    { code: '2',   price: 110,    name: 'MANGO 225ML BOT' },
    { code: '106', price: 280.83, name: 'MANGO JAM 370G' },
    { code: '21',  price: 200,    name: 'FAMILLY PACK MANGO 1L' },
    { code: '24',  price: 250,    name: 'HAPPY FARM MANGO 1L' },
  ];
  for (let i = 0; i < cases.length; i++) {
    if (i > 0) window.document.querySelector('#addLine').click();
    const row = typeCode(i, cases[i].code);
    check(`code ${cases[i].code} → rate is its own`, rateOf(row), cases[i].price);
    // set 1 carton (12 pcs) and check amount = 12 * price
    const doz = row.querySelector('input[data-k="doz"]'); doz.value = '1';
    doz.dispatchEvent(new window.Event('input', { bubbles: true }));
    check(`code ${cases[i].code} → amount = 12 × ${cases[i].price}`, amtText(row).replace(/[^0-9.]/g, ''), (12 * cases[i].price).toFixed(2));
  }

  // a manual rate override must survive re-typing the same code
  window.document.querySelector('#addLine').click();
  const r5 = typeCode(4, '2');
  const rateInp = r5.querySelector('input[data-k="unit_price"]');
  rateInp.value = '95'; rateInp.dispatchEvent(new window.Event('input', { bubbles: true }));
  typeCode(4, '2');
  check('manual rate override is preserved', rateOf(r5), 95);
  // but changing the code to a DIFFERENT product on that same line snaps to the new product's rate
  typeCode(4, '24');
  check('changing the code past a manual rate follows the new product', rateOf(r5), 250);
  // clearing the rate re-enables auto-fill on the next code entry
  window.document.querySelector('#addLine').click();
  const r6 = typeCode(5, '2');
  const ri6 = r6.querySelector('input[data-k="unit_price"]');
  ri6.value = ''; ri6.dispatchEvent(new window.Event('input', { bubbles: true }));
  typeCode(5, '106');
  check('cleared rate re-fills from the newly typed product', rateOf(r6), 280.83);

  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
