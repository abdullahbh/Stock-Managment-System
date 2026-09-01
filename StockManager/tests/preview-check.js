// preview (renderer helpers, lifted verbatim) vs stored (database.js)
const fs=require('fs'), path=require('path'), os=require('os');
const html=fs.readFileSync(__dirname + '/../renderer-dist/index.html','utf8');
const grab=(from,to)=>{ const a=html.indexOf(from), b=html.indexOf(to,a); if(a<0||b<0) throw new Error('slice not found: '+from); return html.slice(a,b); };
const src = grab('const r2 = (n) =>','const today =')
          + grab('function lineTotalPcs(l)','function renderBill()');
let S,draft;
const ctx={};
const fn=new Function('S_get','draft_get',`
  const S=S_get(), draft=draft_get();
  const prodById=(id)=>S.products.find(p=>p.id===Number(id));
  ${src}
  return { billSubtotal, billLineTO, billManualTO, billSchemeTO };
`);
const db=require(__dirname + '/../database.js');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smprev-'));
db.initialize(path.join(tmp,'t.db'),{});
db.addProduct({sku_code:'P1',name:'One',price:33.33,cost:6,pcs_per_dozen:12,stock_qty:100000});
db.addProduct({sku_code:'P2',name:'Two',price:10,cost:6,pcs_per_dozen:12,stock_qty:100000});
db.addScheme({name:'Two pct',type:'TRADE_OFFER',offer_pct:2,min_bill:500,active:1});
const prods=db.getAllProducts(), schemes=db.getAllSchemes();
let f=0; const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  preview=${JSON.stringify(a)} stored=${JSON.stringify(e)}`}`);};

const cases=[
  { n:'manual 2% + line 5% + scheme', d:{manual_trade_offer_pct:2, lines:[
      {product_id:prods[1].id,kind:'SALE',doz:0,pcs:200,unit_price:10,trade_offer_pct:5,trade_offer:0}]}},
  { n:'odd rounding 3% of 333.30', d:{manual_trade_offer_pct:0, lines:[
      {product_id:prods[0].id,kind:'SALE',doz:0,pcs:10,unit_price:33.33,trade_offer_pct:3,trade_offer:0}]}},
  { n:'legacy rupees', d:{manual_trade_offer:15, manual_trade_offer_pct:0, lines:[
      {product_id:prods[1].id,kind:'SALE',doz:0,pcs:100,unit_price:10,trade_offer_pct:0,trade_offer:25}]}},
  { n:'multi line 1.5% each + manual 7.25%', d:{manual_trade_offer_pct:7.25, lines:[
      {product_id:prods[0].id,kind:'SALE',doz:1,pcs:7,unit_price:33.33,trade_offer_pct:1.5,trade_offer:0},
      {product_id:prods[1].id,kind:'SALE',doz:3,pcs:0,unit_price:10,trade_offer_pct:1.5,trade_offer:0},
      {product_id:prods[1].id,kind:'REPLACE',doz:0,pcs:6,unit_price:0,trade_offer_pct:0,trade_offer:0}]}},
];
cases.forEach((c,i)=>{
  const d=Object.assign({tax_pct:0,discount:0,scheme_off:false,manual_trade_offer:0,manual_trade_offer_pct:0},c.d);
  const h=fn(()=>({products:prods,schemes}),()=>d);
  const sub=h.billSubtotal();
  const preview=Math.round((sub - h.billManualTO(sub) - h.billLineTO() - h.billSchemeTO(sub))*100)/100;
  const r=db.createBill({bill_date:'2026-08-29',customer_code:'X'+i,customer_name:'S',van:'V'+i,
    manual_trade_offer:d.manual_trade_offer, manual_trade_offer_pct:d.manual_trade_offer_pct,
    items:d.lines.map(l=>({product_id:l.product_id,kind:l.kind,
      pcs:(+l.doz||0)*(prods.find(p=>p.id===l.product_id).pcs_per_dozen)+(+l.pcs||0),
      unit_price:l.unit_price, trade_offer_pct:l.trade_offer_pct, trade_offer:l.trade_offer})) });
  check(c.n, preview, r.total);
});
console.log(f?`\n${f} MISMATCHES`:'\nPREVIEW MATCHES STORED');
process.exit(f?1:0);
