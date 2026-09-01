// ─────────────────────────────────────────────────────────────────────────────
// test-ui-forms.js — JSDOM suite driving the REAL StockManager renderer.
//
// RUN (no shim):  NODE_PATH=$PWD/node_modules node test-ui-forms.js
// To point it at a patched copy (used to prove the checks are real):
//                 UI_HTML=/abs/path/to/copy.html NODE_PATH=$PWD/node_modules node test-ui-forms.js
//
// This suite targets the UI-correctness class of bug 1: a per-line rate that
// silently follows the WRONG product because an intermediate code prefix
// resolved to a different one. Every expected value below is derived by hand
// from the product catalog / return+bill formulas — never read back from the
// function under test.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const { JSDOM } = require('jsdom');

const APP = __dirname + '/..';
const HTML_PATH = process.env.UI_HTML || (APP + '/renderer-dist/index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Catalog chosen to expose the prefix trap:
//   '2'  is a prefix of '21' and '24'      (all DIFFERENT rates/costs)
//   '1'  is a prefix of '106' (via '1' → '10'(none) → '106')
// Every product has a DISTINCT price AND a DISTINCT cost so a wrong resolve
// cannot coincidentally produce the right number.
const PRODUCTS = [
  { id: 1, sku_code: '1',   name: 'FILLER ONE',            price: 110,    cost: 40,  pcs_per_dozen: 12, stock_qty: 9999, min_stock: 0, grp: '', active: 1 },
  { id: 2, sku_code: '2',   name: 'MANGO 225ML BOT',       price: 113,    cost: 42,  pcs_per_dozen: 12, stock_qty: 9999, min_stock: 0, grp: '', active: 1 },
  { id: 3, sku_code: '106', name: 'MANGO JAM 370G',        price: 280.83, cost: 150, pcs_per_dozen: 12, stock_qty: 9999, min_stock: 0, grp: '', active: 1 },
  { id: 4, sku_code: '21',  name: 'FAMILLY PACK MANGO 1L', price: 200,    cost: 90,  pcs_per_dozen: 12, stock_qty: 9999, min_stock: 0, grp: '', active: 1 },
  { id: 5, sku_code: '24',  name: 'HAPPY FARM MANGO 1L',   price: 250,    cost: 120, pcs_per_dozen: 12, stock_qty: 9999, min_stock: 0, grp: '', active: 1 },
];
const priceOf = (code) => PRODUCTS.find(p => p.sku_code === code).price;
const costOf  = (code) => PRODUCTS.find(p => p.sku_code === code).cost;
const idOf    = (code) => PRODUCTS.find(p => p.sku_code === code).id;

// A loaded bill whose line was billed BELOW the catalog rate (105 vs 113) so
// "as-billed is preserved" is distinguishable from "catalog re-filled".
const LOADED_BILL = {
  id: 77, bill_number: 'HMS-77', bill_date: '2026-08-01',
  customer_code: 'C1', customer_name: 'Corner Store', customer_addr: 'Main Rd', class: 'A',
  van: '', booker: '', delivery_man: '',
  tax_pct: 0, discount: 0, manual_trade_offer_pct: 0, manual_trade_offer: 0,
  subtotal: 105, trade_offer: 0, scheme_off: 0, notes: '',
  items: [{ bill_item_id: 501, sku_code: '2', product_id: 2, kind: 'SALE', pcs: 1,
            unit_price: 105, scheme_id: null, trade_offer: 0, trade_offer_pct: 0 }],
};

// ── recorded side-effects ──
const calls = { createBill: [], createReturn: [], createPurchase: [], addProduct: [], addScheme: [] };
const api = {
  getSettings: async () => ({}),
  getProducts: async () => PRODUCTS.map(p => ({ ...p })),
  getSchemes:  async () => [],
  getCustomers: async () => [],
  listMasters: async (k) => ({ van:[{id:1,name:'VAN 01'},{id:2,name:'VAN 07'}], booker:[{id:1,name:'Saqib'}], dm:[{id:1,name:'Azhar'}] }[k] || []),
  getStats: async () => ({ last7:[], topProducts:[], salesByVan:[], pieceMix:{}, lowStockItems:[],
                           recentBills:[], recentLoads:[], recentReturns:[], inventoryItems:[] }),
  getBill: async () => LOADED_BILL,
  getReturns: async () => [],
  getPurchases: async () => [],
  updateSettings: async () => ({}),
  createBill:     async (p) => { calls.createBill.push(p);     return { id: 1, bill_number: 'HMS-1', total: 0 }; },
  updateBill:     async (id,p) => { calls.createBill.push({ _update:id, ...p }); return { id, bill_number: 'HMS-1', total: 0 }; },
  createReturn:   async (p) => { calls.createReturn.push(p);   return { id: 1, return_number: 'HR-1', total: 0 }; },
  createPurchase: async (p) => { calls.createPurchase.push(p); return { id: 1, purchase_number: 'HP-1', total: 0 }; },
  addProduct:     async (p) => { calls.addProduct.push(p);     return { id: 9 }; },
  addScheme:      async (p) => { calls.addScheme.push(p);      return { id: 9 }; },
};

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
window.api = api;
window.brand = { id:'test', name:'Test', accent:'#1d4f91', accentSoft:'#0e2a4f', billPrefix:'HMS', loadPrefix:'HL', returnPrefix:'HR' };

// ── harness ──
let failures = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, actual, expected) {
  const ok = eq(actual, expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n        got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`);
}
async function checkThrows(name, fn, re) {
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  const ok = !!threw && re.test(threw.message || String(threw));
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  (got ${threw ? threw.message : 'no throw'})`}`);
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => doc.querySelector(s);
const stripMoney = (t) => String(t).replace(/[^0-9.]/g, '');

// type a value one character at a time into a text/number input, firing a real
// 'input' event per keystroke — the exact path the prefix trap hides in.
function typeChars(input, value) {
  input.value = '';
  for (const ch of String(value)) {
    input.value += ch;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
}
// set a field and fire input + change (for one-shot fields read on submit)
function setVal(input, value) {
  input.value = String(value);
  input.dispatchEvent(new window.Event('input',  { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

// ── row accessors (New Bill) ──
const billRows   = () => doc.querySelectorAll('#lineRows tr');
const codeInput  = (row) => row.querySelector('input[data-k="code"]');
const rateInput  = (row) => row.querySelector('input[data-k="unit_price"]');
const dozInput   = (row) => row.querySelector('input[data-k="doz"]');
const billAmtCell = (row) => row.children[7].textContent;   // Amount column

(async () => {
  await wait(120);

  // ════════════════════════════════════════════════════════════════════════
  // 1. NEW BILL — rate follows the RESOLVED product, prefix-safe
  // ════════════════════════════════════════════════════════════════════════
  await window.go('newbill');
  await wait(60);

  const billCases = ['2', '106', '21', '24', '1'];   // each shares a prefix with an earlier one
  for (let i = 0; i < billCases.length; i++) {
    if (i > 0) $('#addLine').click();
    const code = billCases[i];
    const row = billRows()[i];
    typeChars(codeInput(row), code);
    check(`bill: code '${code}' → unit_price is its OWN rate (${priceOf(code)})`,
          +rateInput(row).value, priceOf(code));
    // 1 carton = 12 pcs; Amount cell must equal 12 × own rate
    setVal(dozInput(row), '1');
    check(`bill: code '${code}' → Amount = 12 × ${priceOf(code)}`,
          stripMoney(billAmtCell(row)), (12 * priceOf(code)).toFixed(2));
  }

  // 1b. a hand-typed rate survives re-typing the SAME code
  $('#addLine').click();
  let r = billRows()[5];
  typeChars(codeInput(r), '2');                 // auto-fills 113
  setVal(rateInput(r), '95');                   // operator overrides
  typeChars(codeInput(r), '2');                 // re-enters same code
  check("bill: manual rate survives re-typing the same code", +rateInput(billRows()[5]).value, 95);

  // 1c. clearing the rate RE-ENABLES auto-fill on the next code entry
  $('#addLine').click();
  r = billRows()[6];
  typeChars(codeInput(r), '2');                 // 113
  setVal(rateInput(r), '95');                   // manual → sticky for product 2
  setVal(rateInput(r), '');                     // clear it (fires input) → auto-fill re-armed
  typeChars(codeInput(r), '2');                 // same code again
  check("bill: clearing the rate re-enables auto-fill", +rateInput(billRows()[6]).value, 113);

  // ════════════════════════════════════════════════════════════════════════
  // 2. NEW BILL — a van is required client-side (save blocked, focus → van)
  // ════════════════════════════════════════════════════════════════════════
  setVal($('#s_van'), '');                      // ensure blank
  const billsBefore = calls.createBill.length;
  $('#save').click();
  await wait(20);
  check("bill: save with no van does NOT reach createBill", calls.createBill.length, billsBefore);
  check("bill: save with no van moves focus to the van field", doc.activeElement === $('#s_van'), true);
  const vanLabel = $('#s_van').parentElement.querySelector('label').textContent;
  check("bill: van label reads as required", /van/i.test(vanLabel) && /required/i.test(vanLabel), true);

  // ════════════════════════════════════════════════════════════════════════
  // 3. EDIT BILL — as-billed rate is preserved UNTIL the code is changed
  // ════════════════════════════════════════════════════════════════════════
  await window.editBill(77);
  await wait(40);
  let er = billRows()[0];
  check("editbill: loaded line shows the as-billed rate (105, not catalog 113)",
        +rateInput(er).value, 105);
  // change the code to a DIFFERENT product → rate must snap to the new catalog rate
  typeChars(codeInput(er), '24');
  check("editbill: changing the code updates the rate to the new product (250)",
        +rateInput(billRows()[0]).value, 250);
  // reload and re-type the SAME code → as-billed rate stays put
  await window.editBill(77);
  await wait(40);
  er = billRows()[0];
  typeChars(codeInput(er), '2');
  check("editbill: re-typing the same code keeps the as-billed rate (105)",
        +rateInput(billRows()[0]).value, 105);

  // ════════════════════════════════════════════════════════════════════════
  // 4. RETURN (van-first) — prefix-safe rate follow
  // ════════════════════════════════════════════════════════════════════════
  await window.returnForm();
  await wait(40);
  const rRows = () => doc.querySelectorAll('#rRows tr');
  const retCases = ['2', '21', '24', '106', '1'];
  for (let i = 0; i < retCases.length; i++) {
    if (i > 0) $('#addR').click();
    const code = retCases[i];
    const row = rRows()[i];
    typeChars(row.querySelector('input[data-k="code"]'), code);
    check(`return: code '${code}' → rate follows resolved product (${priceOf(code)})`,
          +row.querySelector('input[data-k="unit_price"]').value, priceOf(code));
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. RETURN — on-screen Credit Total == the saved payload total
  //    mix: two valid lines + one unresolved code + one negative-rate line.
  //
  //    Hand-derived (tax 0, no bill → no offers):
  //      A '106' × 7 pcs @ 280.83 = round2(1965.81) = 1965.81
  //      B '24'  × 3 pcs @ 250.00 =                     750.00
  //      C '999' (no product)     =                       0.00  (credits nothing)
  //      D '21'  × 5 pcs @ -10    = floored to 0       =   0.00  (never subtracts)
  //      subtotal = round2(2715.81) = 2715.81 ; total = 2715.81
  // ════════════════════════════════════════════════════════════════════════
  await window.returnForm();
  await wait(40);
  const EXPECT_CREDIT = 2715.81;
  const mix = [
    { code: '106', pcs: 7,  rate: null },   // rate auto-fills to 280.83
    { code: '24',  pcs: 3,  rate: null },   // 250
    { code: '999', pcs: 5,  rate: null },   // unresolved → no product_id
    { code: '21',  pcs: 5,  rate: '-10' },  // negative rate → floored to 0
  ];
  for (let i = 0; i < mix.length; i++) {
    if (i > 0) $('#addR').click();
    const row = rRows()[i];
    typeChars(row.querySelector('input[data-k="code"]'), mix[i].code);
    setVal(row.querySelector('input[data-k="pcs"]'), String(mix[i].pcs));
    if (mix[i].rate !== null) setVal(row.querySelector('input[data-k="unit_price"]'), mix[i].rate);
  }
  const onScreenCredit = stripMoney($('#rTotal').textContent);
  check("return: on-screen Credit Total matches the hand-derived value",
        onScreenCredit, EXPECT_CREDIT.toFixed(2));

  // now save and confirm the payload the app SENDS totals to the same figure
  setVal($('#s_van'), 'VAN 07');                // a van so save proceeds
  const retBefore = calls.createReturn.length;
  $('#save').click();
  await wait(30);
  check("return: save with a van reaches createReturn exactly once", calls.createReturn.length, retBefore + 1);
  const payload = calls.createReturn[calls.createReturn.length - 1];
  // recompute the DB total from the payload, from first principles
  const payloadSubtotal = Math.round(payload.items.reduce(
    (s, it) => s + Math.round(it.pcs * Math.max(0, it.unit_price) * 100) / 100, 0) * 100) / 100;
  const payloadTax = Math.round(payloadSubtotal * ((+payload.tax_pct || 0) / 100) * 100) / 100;
  const payloadTotal = Math.round((payloadSubtotal + payloadTax) * 100) / 100;
  check("return: payload total equals the hand-derived value", payloadTotal.toFixed(2), EXPECT_CREDIT.toFixed(2));
  check("return: on-screen Credit Total == payload total", onScreenCredit, payloadTotal.toFixed(2));
  check("return: unresolved '999' line is NOT in the payload",
        payload.items.some(it => it.product_id === '' || it.product_id == null || Number.isNaN(it.product_id)), false);

  // ════════════════════════════════════════════════════════════════════════
  // 6. RETURN — a van is required client-side (save blocked, focus → van)
  // ════════════════════════════════════════════════════════════════════════
  await window.returnForm();
  await wait(40);
  {
    const row = rRows()[0];
    typeChars(row.querySelector('input[data-k="code"]'), '2');       // a valid line
    setVal(row.querySelector('input[data-k="pcs"]'), '3');
    setVal($('#s_van'), '');                                         // blank the van
    const before = calls.createReturn.length;
    $('#save').click();
    await wait(20);
    check("return: save with no van does NOT reach createReturn", calls.createReturn.length, before);
    check("return: save with no van moves focus to the van field", doc.activeElement === $('#s_van'), true);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 7. PURCHASE — unit_cost follows the resolved product, prefix-safe; manual sticks
  // ════════════════════════════════════════════════════════════════════════
  await window.go('purchases');
  await wait(40);
  window.purchaseForm();
  await wait(20);
  const pRows = () => doc.querySelectorAll('#pRows tr');
  const purCases = ['2', '21', '24', '106', '1'];
  for (let i = 0; i < purCases.length; i++) {
    if (i > 0) $('#addP').click();
    const code = purCases[i];
    const row = pRows()[i];
    typeChars(row.querySelector('input[data-k="code"]'), code);
    check(`purchase: code '${code}' → unit_cost follows resolved product (${costOf(code)})`,
          +row.querySelector('input[data-k="unit_cost"]').value, costOf(code));
  }
  // manual cost sticks across re-typing the same code
  $('#addP').click();
  {
    const row = pRows()[5];
    typeChars(row.querySelector('input[data-k="code"]'), '2');       // auto 42
    setVal(row.querySelector('input[data-k="unit_cost"]'), '55');    // manual
    typeChars(row.querySelector('input[data-k="code"]'), '2');       // same code
    check("purchase: manual unit_cost survives re-typing the same code",
          +pRows()[5].querySelector('input[data-k="unit_cost"]').value, 55);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 8. PRODUCT modal — saves the group (grp) field
  // ════════════════════════════════════════════════════════════════════════
  await window.go('products');
  await wait(30);
  window.productModal();
  await wait(10);
  setVal($('#p_sku'),  '990');
  setVal($('#p_name'), 'JAM STRAWBERRY 190G');
  typeChars($('#p_grp'), 'JAM 190G');
  $('#modalRoot').querySelector('#s').click();
  await wait(20);
  {
    const p = calls.addProduct[calls.addProduct.length - 1];
    check("product modal: addProduct received grp", p && p.grp, 'JAM 190G');
    check("product modal: addProduct received sku + name", [p && p.sku_code, p && p.name], ['990', 'JAM STRAWBERRY 190G']);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 9. SCHEME modal — 'Applies to' group vs product, and toggling the fields
  // ════════════════════════════════════════════════════════════════════════
  await window.go('schemes');
  await wait(30);

  // 9a. group scheme
  window.schemeModal();
  await wait(10);
  check("scheme modal: opens with the product field shown, group hidden",
        [$('#fg_prod').style.display !== 'none', $('#fg_grp').style.display === 'none'], [true, true]);
  setVal($('#s_applies'), 'group');
  check("scheme modal: 'group' shows the group field, hides the product field",
        [$('#fg_grp').style.display !== 'none', $('#fg_prod').style.display === 'none'], [true, true]);
  setVal($('#s_name'), 'JAM group free');
  typeChars($('#s_grp'), 'JAM 190G');
  setVal($('#s_buy'), '10');
  setVal($('#s_free'), '1');
  $('#modalRoot').querySelector('#ok').click();
  await wait(20);
  {
    const s = calls.addScheme[calls.addScheme.length - 1];
    check("scheme modal (group): grp saved", s && s.grp, 'JAM 190G');
    check("scheme modal (group): product_id is null", s && s.product_id, null);
  }

  // 9b. product scheme (+ reverse toggle)
  window.schemeModal();
  await wait(10);
  setVal($('#s_applies'), 'group');                 // toggle out…
  setVal($('#s_applies'), 'product');               // …and back
  check("scheme modal: toggling back to 'product' re-shows product, hides group",
        [$('#fg_prod').style.display !== 'none', $('#fg_grp').style.display === 'none'], [true, true]);
  setVal($('#s_name'), 'single product free');
  setVal($('#s_prod'), String(idOf('24')));         // pick product id 5
  setVal($('#s_buy'), '6');
  setVal($('#s_free'), '1');
  $('#modalRoot').querySelector('#ok').click();
  await wait(20);
  {
    const s = calls.addScheme[calls.addScheme.length - 1];
    check("scheme modal (product): product_id saved as the chosen id", s && s.product_id, idOf('24'));
    check("scheme modal (product): grp is empty", s && s.grp, '');
  }

  // ════════════════════════════════════════════════════════════════════════
  // 10. sanity: the renderer's own call() surfaces {ok:false} errors as throws
  // ════════════════════════════════════════════════════════════════════════
  await checkThrows("call(): {ok:false} is raised as an Error",
    async () => { await window.call(async () => ({ ok: false, error: 'boom-42' })); }, /boom-42/);

  console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e && e.stack || e); process.exit(2); });
