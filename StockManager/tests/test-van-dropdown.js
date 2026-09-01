// The New Bill and Return van/booker/delivery-man fields must be dropdowns that show EVERY saved
// option (the old datalist hid options that didn't match the pre-filled value).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = __dirname + '/..';
let html = fs.readFileSync(APP + '/renderer-dist/index.html', 'utf8');

const vans = [{id:1,name:'VAN 01'},{id:2,name:'VAN 02'},{id:3,name:'VAN 03'},{id:4,name:'VAN 04'},{id:5,name:'VAN 05'}];
const bookers = [{id:1,name:'FAISAL ENTERPRISES'},{id:2,name:'MUDASSIR ALI'},{id:3,name:'QASIM ALI'},{id:4,name:'TALHA'},{id:5,name:'WASEEM KABIR'}];
const dms = [{id:1,name:'AMIR ALI'},{id:2,name:'AZHAR'},{id:3,name:'KASHIF'}];
// inject the stubs BEFORE the app script runs, exactly as the Electron preload sets window.api/brand first
const inject = `<script>
window.brand={id:'faisal',name:'Faisal Enterprises',accent:'#b01f24',accentSoft:'#4a1113',billPrefix:'FE',loadPrefix:'FL',returnPrefix:'FR'};
window.__V=${JSON.stringify({vans,bookers,dms})};
window.api=new Proxy({
  getSettings:async()=>({session_van:'VAN 01',session_booker:'Saqib',session_dm:'Azhar'}),
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
  await window.go('newbill'); await new Promise(r=>setTimeout(r,200));

  const van = doc.querySelector('#s_van');
  check('van field is a dropdown (select)', van && van.tagName, 'SELECT');
  const vanOpts = [...van.options].map(o=>o.value).filter(Boolean);
  check('every saved van shows in the dropdown', vanOpts.join(','), 'VAN 01,VAN 02,VAN 03,VAN 04,VAN 05');
  check('the session van is pre-selected', van.value, 'VAN 01');

  const booker = doc.querySelector('#s_booker');
  const bkOpts = [...booker.options].map(o=>o.value).filter(Boolean);
  check('every saved booker shows', bookers.every(b=>bkOpts.includes(b.name)), true);
  // session booker "Saqib" isn't in the saved list -> it is added so it isn't silently lost
  check('an off-list session booker is still available', bkOpts.includes('Saqib'), true);
  check('the session booker is selected', booker.value, 'Saqib');

  const dm = doc.querySelector('#s_dm');
  check('delivery-man dropdown shows saved names', [...dm.options].map(o=>o.value).filter(Boolean).includes('AZHAR'), true);

  // picking a different van updates the session
  van.value = 'VAN 03'; van.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,30));
  check('changing the van dropdown works', doc.querySelector('#s_van').value, 'VAN 03');

  // the new Vans & Staff page renders three managers
  await window.go('routes'); await new Promise(r=>setTimeout(r,150));
  check('Vans & Staff page has a van add box', !!doc.querySelector('#m_van'), true);
  check('Vans & Staff page has a booker add box', !!doc.querySelector('#m_booker'), true);
  check('Vans & Staff page has a delivery-man add box', !!doc.querySelector('#m_dm'), true);
  check('the sidebar lists the new page', !!doc.querySelector('[data-nav="routes"]'), true);

  console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
  process.exit(f?1:0);
})();
