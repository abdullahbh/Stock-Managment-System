// Trade offer entered as a percentage: bill-wide (manual) and per line.
const path=require('path'), fs=require('fs'), os=require('os');
const DB_JS=__dirname + '/../database.js';
const db=require(DB_JS);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smtopct-'));
db.initialize(path.join(tmp,'t.db'),{});
let f=0; const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`);};

db.addProduct({sku_code:'P1',name:'Prod One',price:10,cost:6,pcs_per_dozen:12,stock_qty:100000});
db.addProduct({sku_code:'P2',name:'Prod Two',price:33.33,cost:20,pcs_per_dozen:12,stock_qty:100000});
const p1=db.getAllProducts().find(p=>p.sku_code==='P1'), p2=db.getAllProducts().find(p=>p.sku_code==='P2');
const D='2026-08-29';
const mk=(o)=>db.createBill(Object.assign({bill_date:D,customer_name:'S'},o));

// ── manual %: 2% of a 2000 subtotal ──
const r1=mk({customer_code:'C1',van:'V1',manual_trade_offer_pct:2,
  items:[{product_id:p1.id,kind:'SALE',pcs:200,unit_price:10}]});
const b1=db.getBillById(r1.id);
check('manual 2% subtotal',b1.subtotal,2000);
check('manual 2% -> Rs 40 stored',b1.manual_trade_offer,40);
check('manual pct stored',b1.manual_trade_offer_pct,2);
check('trade_offer includes the 40',b1.trade_offer,40);
check('total = 2000 - 40',b1.total,1960);

// ── per-line %: 5% of a 1000 line ──
const r2=mk({customer_code:'C2',van:'V2',
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10,trade_offer_pct:5}]});
const b2=db.getBillById(r2.id);
check('line 5% -> Rs 50',b2.items[0].trade_offer,50);
check('line pct stored',b2.items[0].trade_offer_pct,5);
check('bill trade_offer from the line',b2.trade_offer,50);
check('line pct total',b2.total,950);

// ── rounding: 3% of a 333.30 line ──
const r3=mk({customer_code:'C3',van:'V3',
  items:[{product_id:p2.id,kind:'SALE',pcs:10,unit_price:33.33,trade_offer_pct:3}]});
const b3=db.getBillById(r3.id);
check('line amount 333.30',b3.items[0].line_total,333.3);
check('3% of 333.30 rounds to 10',b3.items[0].trade_offer,10);

// ── legacy rupees still deducted when no pct is given ──
const r4=mk({customer_code:'C4',van:'V4',manual_trade_offer:15,
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10,trade_offer:25}]});
const b4=db.getBillById(r4.id);
check('legacy line rupees kept',b4.items[0].trade_offer,25);
check('legacy line pct is 0',b4.items[0].trade_offer_pct,0);
check('legacy manual rupees kept',b4.manual_trade_offer,15);
check('legacy manual pct is 0',b4.manual_trade_offer_pct,0);
check('legacy trade_offer 25+15',b4.trade_offer,40);
check('legacy total',b4.total,960);

// ── pct wins over rupees on the same line / bill ──
const r5=mk({customer_code:'C5',van:'V5',manual_trade_offer:999,manual_trade_offer_pct:1,
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10,trade_offer:999,trade_offer_pct:5}]});
const b5=db.getBillById(r5.id);
check('line pct beats line rupees',b5.items[0].trade_offer,50);
check('manual pct beats manual rupees',b5.manual_trade_offer,10);
check('pct precedence trade_offer',b5.trade_offer,60);

// ── clamping ──
const r6=mk({customer_code:'C6',van:'V6',manual_trade_offer_pct:500,
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10,trade_offer_pct:-4}]});
const b6=db.getBillById(r6.id);
check('manual pct clamped to 100',b6.manual_trade_offer_pct,100);
check('manual pct clamp -> whole subtotal',b6.manual_trade_offer,1000);
check('negative line pct -> 0',b6.items[0].trade_offer_pct,0);

// ── edit round trip: re-send exactly what editBill would hand back ──
const r7=mk({customer_code:'C7',van:'V7',manual_trade_offer_pct:2,
  items:[{product_id:p1.id,kind:'SALE',pcs:200,unit_price:10,trade_offer_pct:5}]});
const b7=db.getBillById(r7.id);
check('create: manual 2% + line 5%',[b7.manual_trade_offer,b7.items[0].trade_offer,b7.trade_offer,b7.total],[40,100,140,1860]);
const asEdit=(b)=>({ bill_date:b.bill_date, customer_code:b.customer_code, customer_name:b.customer_name,
  customer_addr:b.customer_addr, van:b.van, booker:b.booker, delivery_man:b.delivery_man, class:b.class,
  tax_pct:b.tax_pct||0, discount:b.discount||0,
  manual_trade_offer_pct:+b.manual_trade_offer_pct||0,
  manual_trade_offer:(!(+b.manual_trade_offer_pct) && +b.manual_trade_offer>0)? +b.manual_trade_offer : 0,
  scheme_off:!!b.scheme_off,
  items:b.items.filter(i=>!i.scheme_id).map(i=>({ product_id:i.product_id, kind:i.kind, pcs:i.pcs,
    unit_price:i.unit_price, trade_offer_pct:i.trade_offer_pct||0, trade_offer:i.trade_offer||0 })) });
db.updateBill(r7.id, asEdit(b7));
const b7b=db.getBillById(r7.id);
check('edit round trip unchanged',[b7b.subtotal,b7b.manual_trade_offer,b7b.trade_offer,b7b.total],[2000,40,140,1860]);
check('edit keeps both pcts',[b7b.manual_trade_offer_pct,b7b.items[0].trade_offer_pct],[2,5]);
// a legacy rupee bill must survive the same round trip untouched
db.updateBill(r4.id, asEdit(b4));
const b4b=db.getBillById(r4.id);
check('legacy bill re-save unchanged',[b4b.manual_trade_offer,b4b.items[0].trade_offer,b4b.trade_offer,b4b.total],[15,25,40,960]);

// ── TRADE_OFFER schemes still stack on top ──
db.addScheme({name:'Two pct',type:'TRADE_OFFER',offer_pct:2,min_bill:500,active:1});
const r8=mk({customer_code:'C8',van:'V8',manual_trade_offer_pct:2,
  items:[{product_id:p1.id,kind:'SALE',pcs:200,unit_price:10,trade_offer_pct:5}]});
const b8=db.getBillById(r8.id);
check('scheme stacks on the pcts',b8.trade_offer,180);
check('scheme note kept',b8.notes,'Scheme: Two pct (2%)');
check('scheme + pct total',b8.total,1820);
const r9=mk({customer_code:'C9',van:'V9',scheme_off:1,manual_trade_offer_pct:2,
  items:[{product_id:p1.id,kind:'SALE',pcs:200,unit_price:10}]});
check('scheme_off leaves the manual pct alone',db.getBillById(r9.id).trade_offer,40);

console.log(f?`\n${f} FAILURES`:'\nALL PASS');
process.exit(f?1:0);
