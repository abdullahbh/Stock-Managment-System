// The Purchases list shows an Edit button; clicking it opens the purchase in an editable form
// and saving sends updatePurchase with the changed lines.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = require('path').join(__dirname, '..');
let html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

const PURCHASE = { id: 7, purchase_number: 'PUR-20260901-002', purchase_date: '2026-09-01', vehicle_no: 'ABC-123', supplier: 'Next Cola', total: 350, notes: '',
  items: [{ id: 1, product_id: 2, sku_code: '2', product_name: 'MANGO 225ML BOT', pcs: 50, unit_cost: 7, line_total: 350 }] };
const PRODUCTS = [{ id: 2, sku_code: '2', name: 'MANGO 225ML BOT', price: 12, cost: 7, pcs_per_dozen: 12, stock_qty: 500, active: 1 }];
let updateCall = null;
const inject = `<script>
window.brand={id:'haramain',name:'Haramain',accent:'#1d4f91',accentSoft:'#0e2a4f',billPrefix:'HMS',loadPrefix:'HL',returnPrefix:'HR'};
window.__P=${JSON.stringify(PURCHASE)}; window.__PR=${JSON.stringify(PRODUCTS)};
window.__calls={update:null};
window.api=new Proxy({
  getSettings:async()=>({current_day:'2026-09-01'}), getProducts:async()=>window.__PR, getSchemes:async()=>[], getCustomers:async()=>[],
  listMasters:async()=>[], getStats:async()=>({last7:[],topProducts:[],salesByVan:[],pieceMix:{},lowStockItems:[],recentBills:[],recentLoads:[],recentReturns:[],inventoryItems:[]}),
  getPurchases:async()=>[window.__P], getPurchaseById:async()=>JSON.parse(JSON.stringify(window.__P)),
  updatePurchase:async(id,p)=>{ window.__calls.update={id,p}; return {id,purchase_number:window.__P.purchase_number,total:p.items.reduce((s,l)=>s+l.pcs*l.unit_cost,0)}; }
},{get:(t,k)=>t[k]||(async()=>({ok:true,success:true,data:{}}))});
</script>`;
html = html.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, '$1\n' + inject);
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom; const doc = window.document;
let f = 0;
const check = (n, a, e) => { const ok = a === e; if (!ok) f++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  got=${JSON.stringify(a)} exp=${JSON.stringify(e)}`}`); };

(async () => {
  await new Promise(r => setTimeout(r, 200));
  await window.go('purchases'); await new Promise(r => setTimeout(r, 150));
  const editBtn = doc.querySelector('#view [data-e]');
  check('Purchases list has an Edit button', !!editBtn, true);

  editBtn.click(); await new Promise(r => setTimeout(r, 150));
  const h2 = doc.querySelector('#view h2').textContent;
  check('Edit opens the purchase in an edit form', /Edit Purchase PUR-20260901-002/.test(h2), true);
  const codeCell = doc.querySelector('#pRows input[data-k="code"]');
  check('the existing line is loaded (code 2)', codeCell && codeCell.value, '2');
  const pcs = doc.querySelector('#pRows input[data-k="pcs"]');
  check('the existing pieces are loaded (50)', pcs && String(pcs.value), '50');

  // change pieces 50 -> 80 and save
  pcs.value = '80'; pcs.dispatchEvent(new window.Event('input', { bubbles: true }));
  doc.querySelector('#save').click(); await new Promise(r => setTimeout(r, 60));
  const c = window.__calls.update;
  check('Save calls updatePurchase', !!c, true);
  check('updatePurchase gets the purchase id', c && c.id, 7);
  check('updatePurchase sends the changed pieces (80)', c && c.p.items[0].pcs, 80);
  check('updatePurchase keeps the unit cost', c && c.p.items[0].unit_cost, 7);

  console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
