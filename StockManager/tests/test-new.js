const path=require('path'), fs=require('fs'), os=require('os');
const db=require(__dirname + '/../database.js');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smnew-'));
db.initialize(path.join(tmp,'t.db'),{});
let f=0; const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`);};
const thr=(n,fn,re)=>{let m=''; try{fn();}catch(e){m=e.message;} const ok=re.test(m); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  got="${m}"`}`);};

db.addProduct({sku_code:'P1',name:'Prod One',price:10,cost:6,pcs_per_dozen:12,stock_qty:5000});
const prod=db.getAllProducts()[0];

// C1: pct scheme
db.addScheme({name:'Two pct',type:'TRADE_OFFER',offer_pct:2,offer_amount:999,min_bill:500,active:1});
const r=db.createBill({bill_date:'2026-08-29',customer_code:'C1',customer_name:'Shop A',van:'V1',
  manual_trade_offer:20,items:[{product_id:prod.id,kind:'SALE',pcs:100,unit_price:10}]});
check('pct TO (1000*2% + manual20)',r.trade_offer,40);
check('pct note',db.getBillById(r.id).notes,'Scheme: Two pct (2%)');
check('C2 manual_trade_offer persisted',db.getBillById(r.id).manual_trade_offer,20);
// clamp
const s=db.getAllSchemes()[0]; db.updateScheme({...s,offer_pct:500});
check('pct clamped to 100',db.getAllSchemes()[0].offer_pct,100);
db.updateScheme({...s,offer_pct:0,offer_amount:150});
const r2=db.createBill({bill_date:'2026-08-29',customer_code:'C2',customer_name:'Shop B',van:'V1',
  items:[{product_id:prod.id,kind:'SALE',pcs:100,unit_price:10}]});
check('legacy flat still applies',r2.trade_offer,150);

// C5: bill never renames a shop; fills blank address only
db.upsertCustomer({code:'C9',name:'Real Name',address:''});
db.createBill({bill_date:'2026-08-29',customer_code:'C9',customer_name:'TYPO NAME',customer_addr:'Main St',van:'V2',
  items:[{product_id:prod.id,kind:'SALE',pcs:12,unit_price:10}]});
const c9=db.findCustomer('C9');
check('shop not renamed by bill',c9.name,'Real Name');
check('blank address filled',c9.address,'Main St');
db.createBill({bill_date:'2026-08-29',customer_code:'C9',customer_name:'X',customer_addr:'Other St',van:'V3',
  items:[{product_id:prod.id,kind:'SALE',pcs:12,unit_price:10}]});
check('existing address kept',db.findCustomer('C9').address,'Main St');
check('new code auto-created',db.findCustomer('C1').name,'Shop A');

// C3 addCustomer
db.addCustomer({code:'NEW1',name:'Fresh Shop',address:'A'});
check('addCustomer inserts',db.findCustomer('NEW1').name,'Fresh Shop');
thr('addCustomer dup throws',()=>db.addCustomer({code:'NEW1',name:'Other'}),
  /^Shop code "NEW1" already belongs to "Fresh Shop"\. Delete that shop first before adding a new one on this code\.$/);

// bill numbering: local date + max suffix, survives deletion
const d=new Date(), ds=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
check('bill number local date',db.getBillById(r.id).bill_number,`INV-${ds}-001`);
const last=db.getAllBills({})[0];
db.deleteBill(last.id);
const r3=db.createBill({bill_date:'2026-08-29',customer_code:'CZ',customer_name:'Z',van:'VZ',
  items:[{product_id:prod.id,kind:'SALE',pcs:12,unit_price:10}]});
check('no collision after delete',r3.bill_number>last.bill_number,true);

// FREE_GOODS: big-ratio high-threshold scheme must not hide a qualifying smaller one
db.addScheme({name:'Small',type:'FREE_GOODS',product_id:prod.id,buy_pcs:12,free_pcs:1,active:1});
db.addScheme({name:'Big',type:'FREE_GOODS',product_id:prod.id,buy_pcs:120,free_pcs:24,active:1});
const r4=db.createBill({bill_date:'2026-08-29',customer_code:'CF',customer_name:'F',van:'VF',
  items:[{product_id:prod.id,kind:'SALE',pcs:24,unit_price:10}]});
check('qualifying small scheme applies',db.getBillById(r4.id).items.filter(i=>i.kind==='FREE').map(i=>[i.note,i.pcs]),[['Small',2]]);

// guards
db.closeDay('2026-08-29');
thr('deleteBill blocked on closed day',()=>db.deleteBill(r4.id),/closed/);
db.openDay('2026-08-29');
const pu=db.createPurchase({purchase_date:'2026-08-28',supplier:'S',items:[{product_id:prod.id,pcs:100,unit_cost:6}]});
db.closeDay('2026-08-28');
thr('deletePurchase blocked on closed day',()=>db.deletePurchase(pu.id),/closed/);
db.openDay('2026-08-28');
const pu2=db.createPurchase({purchase_date:'2026-08-28',supplier:'S',items:[{product_id:prod.id,pcs:999999,unit_cost:6}]});
db.stockIn({product_id:prod.id,pcs:-999999});
thr('deletePurchase negative-stock guard',()=>db.deletePurchase(pu2.id),
  /^Cannot delete: Prod One stock would go negative \(have \d+, purchase added 999999\)$/);
db.stockIn({product_id:prod.id,pcs:999999});
db.deletePurchase(pu2.id); console.log('PASS deletePurchase works when stock suffices');

// getBillSummary must not be capped at 300
db.stockIn({product_id:prod.id,pcs:100000});
for(let i=0;i<330;i++) db.createBill({bill_date:'2026-07-01',customer_code:'B'+i,customer_name:'S'+i,van:'V'+i,
  items:[{product_id:prod.id,kind:'SALE',pcs:1,unit_price:10}]});
const sum=db.getBillSummary({date_from:'2026-07-01',date_to:'2026-07-01'});
check('summary rows uncapped',sum.rows.length,330);
check('summary total uncapped',sum.totals.total,3300);
check('list still capped',db.getAllBills({date_from:'2026-07-01',date_to:'2026-07-01'}).length,300);

// reports/dashboard still run
db.getDashboardStats(); db.getProfitSummary(); db.getProfitReport({}); db.getAllLoadForms({date_from:'2026-01-01',date_to:'2026-12-31'});
db.listBillsForLoad({date_from:'2026-01-01',date_to:'2026-12-31'});
console.log('PASS reports/dashboard/load queries run');

// sample data on a fresh db
const db2path=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'smnew2-')),'t.db');
delete require.cache[require.resolve(__dirname + '/../database.js')];
const db2=require(__dirname + '/../database.js');
db2.initialize(db2path,{}); const st=db2.loadSampleData();
console.log(`PASS sample data loaded (${st.bills} bills, ${st.customers} shops)`);
const pctBill=db2.getAllBills({}).find(b=>/\(2%\)/.test(b.notes||''));
check('sample pct scheme applied',!!pctBill,true);
if(pctBill) check('sample pct amount',Math.abs(pctBill.trade_offer-Math.round(pctBill.subtotal*2)/100)<=100.01,true);
console.log(f?`\n${f} FAILURES`:'\nALL PASS');
process.exit(f?1:0);
