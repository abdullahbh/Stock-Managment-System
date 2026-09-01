// Drives the REAL renderer in jsdom to prove FEATURE 1 (working-day defaulting) and
// FEATURE 2 (van remembers its crew) in the UI layer.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = __dirname + '/..';
let html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

// van rows now carry booker/dm (SELECT * from route_masters). VAN 01's usual crew is Saqib / Azhar.
const vans = [
  { id:1, name:'VAN 01', booker:'Saqib', dm:'Azhar' },
  { id:2, name:'VAN 02', booker:'',      dm:'' },
];
const bookers = [{id:1,name:'FAISAL ENTERPRISES'},{id:2,name:'MUDASSIR ALI'}];
const dms = [{id:1,name:'AMIR ALI'},{id:2,name:'AZHAR'}];

// inject stubs BEFORE the app script runs, exactly as the Electron preload sets window.api/brand first.
// getSettings.current_day is deliberately a date that is NOT today, to prove the form uses the working day.
const inject = `<script>
window.brand={id:'faisal',name:'Faisal Enterprises',accent:'#b01f24',accentSoft:'#4a1113',billPrefix:'FE',loadPrefix:'FL',returnPrefix:'FR'};
window.__V=${JSON.stringify({vans,bookers,dms})};
window.api=new Proxy({
  getSettings:async()=>({current_day:'2026-08-31',session_van:'',session_booker:'',session_dm:''}),
  getProducts:async()=>[],getSchemes:async()=>[],getCustomers:async()=>[],
  listMasters:async(k)=>({van:window.__V.vans,booker:window.__V.bookers,dm:window.__V.dms}[k]||[]),
  getStats:async()=>({last7:[],topProducts:[],salesByVan:[],pieceMix:{},lowStockItems:[],recentBills:[],recentLoads:[],recentReturns:[],inventoryItems:[]})
},{get:(t,k)=>t[k]||(async()=>({ok:true,success:true,data:{}}))});
</script>`;
html = html.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/, '$1\n'+inject);
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom;
const doc = window.document;
let f = 0;
const check = (n,a,e)=>{ const ok=a===e; if(!ok)f++; console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  got=${JSON.stringify(a)} exp=${JSON.stringify(e)}`}`); };

(async () => {
  await new Promise(r=>setTimeout(r,150));

  // ── FEATURE 1: New Bill dates to the working day, not the calendar clock ──
  await window.go('newbill'); await new Promise(r=>setTimeout(r,200));
  const bdate = doc.querySelector('#b_date');
  check('New Bill date field exists', !!bdate, true);
  check('New Bill date defaults to the working day (current_day)', bdate.value, '2026-08-31');
  check('working day differs from the real calendar date', bdate.value !== new Date().toISOString().slice(0,10), true);

  // ── FEATURE 2: picking a van auto-fills its usual crew on New Bill ──
  const van = doc.querySelector('#s_van');
  van.value = 'VAN 01'; van.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,40));
  check('van select shows VAN 01', van.value, 'VAN 01');
  check('booker auto-fills to the van crew', doc.querySelector('#s_booker').value, 'Saqib');
  check('delivery man auto-fills to the van crew', doc.querySelector('#s_dm').value, 'Azhar');

  // the crew is still editable (a plain option change sticks)
  const bk = doc.querySelector('#s_booker'); bk.value='FAISAL ENTERPRISES'; bk.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,20));
  check('crew stays editable after auto-fill', doc.querySelector('#s_booker').value, 'FAISAL ENTERPRISES');

  // ── FEATURE 2: the Return form van select auto-fills crew too ──
  await window.returnForm(); await new Promise(r=>setTimeout(r,150));
  const rvan = doc.querySelector('#s_van');
  rvan.value='VAN 01'; rvan.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,40));
  check('Return: booker auto-fills to the van crew', doc.querySelector('#s_booker').value, 'Saqib');
  check('Return: delivery man auto-fills to the van crew', doc.querySelector('#s_dm').value, 'Azhar');
  check('Return date defaults to the working day', doc.querySelector('#r_date').value, '2026-08-31');

  // ── FEATURE 2: Vans & Staff page shows a booker + delivery-man select per van ──
  await window.go('routes'); await new Promise(r=>setTimeout(r,200));
  const vanBox = doc.querySelector('#list_van');
  check('Vans list renders van rows', vanBox.querySelectorAll('tr[data-van]').length, 2);
  check('each van row has a booker select', vanBox.querySelectorAll('select[data-crew="booker"]').length, 2);
  check('each van row has a delivery-man select', vanBox.querySelectorAll('select[data-crew="dm"]').length, 2);
  const row1 = vanBox.querySelector('tr[data-van="VAN 01"]');
  check('VAN 01 booker select pre-selects its saved crew', row1.querySelector('select[data-crew="booker"]').value, 'Saqib');
  check('VAN 01 dm select pre-selects its saved crew', row1.querySelector('select[data-crew="dm"]').value, 'Azhar');
  // Bookers / Delivery Men columns stay simple chip lists
  check('Order Bookers column stays a chip list (no crew selects)', doc.querySelector('#list_booker').querySelectorAll('select').length, 0);
  check('add boxes are still present', !!doc.querySelector('#m_van') && !!doc.querySelector('#m_booker') && !!doc.querySelector('#m_dm'), true);

  console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
  process.exit(f?1:0);
})();
