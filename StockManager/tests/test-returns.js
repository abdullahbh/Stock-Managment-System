// Sales returns: stock movement, credit maths, guards, profit netting, dashboard, plumbing.
const path=require('path'),fs=require('fs'),os=require('os');
const Database=require('better-sqlite3');
const DB_JS=__dirname + '/../database.js';
const db=require(DB_JS);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smret-'));
db.initialize(path.join(tmp,'t.db'),{});

let f=0;
const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`);};
const thr=(n,fn,re)=>{let m=''; try{fn();}catch(e){m=e.message;} const ok=re.test(m); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  got="${m}"`}`);};
const r2=(n)=>Math.round(n*100)/100;
const stock=(id)=>db.getAllProducts().find(p=>p.id===id).stock_qty;
const TODAY=new Date().toISOString().slice(0,10);
const nd=new Date();
const LOCAL=`${nd.getFullYear()}${String(nd.getMonth()+1).padStart(2,'0')}${String(nd.getDate()).padStart(2,'0')}`;

db.addProduct({sku_code:'P1',name:'Prod One',price:10,cost:6,pcs_per_dozen:12,stock_qty:1000});
db.addProduct({sku_code:'P2',name:'Prod Two',price:20,cost:12,pcs_per_dozen:12,stock_qty:1000});
const [p1,p2]=db.getAllProducts();

// ── the bill the goods came off ────────────────────────────────
const bill=db.createBill({prefix:'HMS',bill_date:TODAY,customer_code:'C1',customer_name:'Shop A',customer_addr:'Main St',
  van:'V1',booker:'B1',delivery_man:'D1',
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10},{product_id:p2.id,kind:'SALE',pcs:50,unit_price:20}]});
check('stock after the bill',[stock(p1.id),stock(p2.id)],[900,950]);

const src=db.getBillForReturn(bill.id);
check('getBillForReturn by id',src.bill_number,bill.bill_number);
check('remaining_pcs before any return',src.items.map(i=>[i.pcs,i.returned_pcs,i.remaining_pcs]),[[100,0,100],[50,0,50]]);
check('bill line carries price and cost',[src.items[0].unit_price,src.items[0].cost],[10,6]);
check('getBillForReturn by bill_number',db.getBillForReturn(bill.bill_number).id,bill.id);
check('getBillForReturn unknown number',db.getBillForReturn('NO-SUCH-BILL'),null);
check('getBillForReturn unknown id',db.getBillForReturn(99999),null);
const bi1=src.items[0].bill_item_id, bi2=src.items[1].bill_item_id;

// FREE / REPLACE pieces are stock too, and credit nothing
const b2=db.createBill({prefix:'HMS',bill_date:TODAY,customer_code:'C2',customer_name:'Shop B',van:'V2',
  items:[{product_id:p1.id,kind:'SALE',pcs:12,unit_price:10},{product_id:p2.id,kind:'REPLACE',pcs:6}]});
check('replace line offered for return',db.getBillForReturn(b2.id).items.map(i=>[i.kind,i.remaining_pcs,i.unit_price]),
  [['SALE',12,10],['REPLACE',6,0]]);

// ── R1: one GOOD line and one DAMAGED line, taxed ──────────────
const mk=(o)=>Object.assign({prefix:'HR',return_date:TODAY,bill_id:bill.id,bill_number:bill.bill_number,
  customer_code:'C1',customer_name:'Shop A',customer_addr:'Main St',van:'V1',booker:'B1',delivery_man:'D1',
  tax_pct:0,notes:''},o);
const R1=db.createSalesReturn(mk({tax_pct:10,items:[
  {bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:10,unit_price:10},
  {bill_item_id:bi2,product_id:p2.id,kind:'DAMAGED',pcs:5,unit_price:20}]}));
check('credit total incl tax (200 + 10%)',R1.total,220);
check('restocked pcs = GOOD only',R1.restocked,10);
check('GOOD restocks, DAMAGED does not',[stock(p1.id),stock(p2.id)],[898,944]);   // 900-12+10, 950-6
check('return number format',R1.return_number,`HR-${LOCAL}-001`);
const det=db.getSalesReturnById(R1.id);
check('header money',[det.subtotal,det.tax_pct,det.tax_amount,det.total],[200,10,20,220]);
check('header piece split',[det.restock_pcs,det.damaged_pcs],[10,5]);
check('items stored',det.items.map(i=>[i.kind,i.pcs,i.unit_price,i.cost,i.line_total]),
  [['GOOD',10,10,6,100],['DAMAGED',5,20,12,100]]);
check('getSalesReturnById unknown',db.getSalesReturnById(99999),null);
check('remaining_pcs after a partial return',db.getBillForReturn(bill.id).items.map(i=>[i.returned_pcs,i.remaining_pcs]),
  [[10,90],[5,45]]);
check('getReturnsForBill',db.getReturnsForBill(bill.id).map(r=>[r.return_number,r.total,r.pcs]),
  [[R1.return_number,220,15]]);
check('getReturnsForBill on an untouched bill',db.getReturnsForBill(b2.id),[]);

// ── over-return guard ──────────────────────────────────────────
const overRe=(n,name,left)=>new RegExp(`^Cannot return ${n} pcs of ${name} — only ${left} left on bill ${bill.bill_number}$`);
thr('over-return in one line',()=>db.createSalesReturn(mk({items:[{bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:95,unit_price:10}]})),
  overRe(95,'Prod One',90));
thr('over-return summed across duplicate bill lines in one payload',()=>db.createSalesReturn(mk({items:[
  {bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:50,unit_price:10},
  {bill_item_id:bi1,product_id:p1.id,kind:'DAMAGED',pcs:45,unit_price:10}]})),overRe(95,'Prod One',90));
// the guard runs before anything is written, so a rejected payload leaves no row and no stock movement
check('rejected payload was never written',
  [db.getReturnsForBill(bill.id).length,db.getSalesReturnById(R1.id).items.length,stock(p1.id)],[1,2,898]);
const R2=db.createSalesReturn(mk({items:[{bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:85,unit_price:10}]}));
check('the rest of the line may come back',[R2.total,stock(p1.id)],[850,983]);
thr('over-return cumulative across two returns',()=>db.createSalesReturn(mk({items:[{bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:6,unit_price:10}]})),
  overRe(6,'Prod One',5));
db.createSalesReturn(mk({items:[{bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:5,unit_price:10}]}));
check('the line is now fully returned',db.getBillForReturn(bill.id).items[0].remaining_pcs,0);
thr('nothing left to return',()=>db.createSalesReturn(mk({items:[{bill_item_id:bi1,product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]})),
  overRe(1,'Prod One',0));
thr('empty return rejected',()=>db.createSalesReturn(mk({items:[{product_id:p1.id,kind:'GOOD',pcs:0,unit_price:10}]})),
  /^Add at least one returned item$/);
thr('unknown product rejected',()=>db.createSalesReturn(mk({items:[{product_id:99999,kind:'GOOD',pcs:1,unit_price:10}]})),
  /^Product not found: 99999$/);

// ── closed-day gate, both ways ─────────────────────────────────
db.closeDay(TODAY);
thr('create blocked on a closed day',()=>db.createSalesReturn(mk({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]})),
  new RegExp(`^Date ${TODAY} is closed. Re-open it to add returns.$`));
thr('delete blocked on a closed day',()=>db.deleteSalesReturn(R1.id),
  new RegExp(`^Date ${TODAY} is closed. Re-open it to delete returns.$`));
db.openDay(TODAY);

// ── delete reverses the stock, and guards against going negative ──
const beforeDel=stock(p1.id);
db.deleteSalesReturn(R2.id);
check('delete takes the restocked pieces back out',stock(p1.id),beforeDel-85);
check('deleted return is gone',db.getSalesReturnById(R2.id),null);
check('its pieces are returnable again',db.getBillForReturn(bill.id).items[0].remaining_pcs,85);
thr('delete of an unknown return',()=>db.deleteSalesReturn(99999),/^Return not found$/);

const std=(o)=>Object.assign({prefix:'HR',return_date:TODAY,customer_code:'C9',customer_name:'Walk In',
  customer_addr:'',van:'V9',booker:'B9',delivery_man:'D9',tax_pct:0,notes:''},o);
const G=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:200,unit_price:10}]}));
const cur=stock(p1.id);
db.stockIn({product_id:p1.id,pcs:-(cur-100)});
thr('delete negative-stock guard names the shortfall and the way out',()=>db.deleteSalesReturn(G.id),
  /^Cannot delete: Prod One stock would go negative \(have 100, return added 200\)\. Put 100 pcs back in with a purchase or a stock-in first, then delete this return\.$/);
check('guard rolled the delete back',[stock(p1.id),!!db.getSalesReturnById(G.id)],[100,true]);
db.stockIn({product_id:p1.id,pcs:cur-100});
db.deleteSalesReturn(G.id);
check('delete works when the stock is there',stock(p1.id),cur-200);

// ── standalone return, no bill behind it ───────────────────────
const S1=db.createSalesReturn(std({items:[{product_id:p2.id,kind:'GOOD',pcs:3,unit_price:20}]}));
const S1row=db.getSalesReturnById(S1.id);
check('standalone return credits and restocks',[S1.total,S1.restocked,stock(p2.id)],[60,3,947]);
check('standalone has no bill behind it',[S1row.bill_id,S1row.bill_number],[null,'']);
check('standalone falls back to the product price',
  db.getSalesReturnById(db.createSalesReturn(std({items:[{product_id:p2.id,kind:'GOOD',pcs:1}]})).id).items[0].unit_price,20);
check('van learned for the dropdowns',db.listMasters('van').some(v=>v.name==='V9'),true);
check('delivery man learned for the dropdowns',db.listMasters('dm').some(v=>v.name==='D9'),true);

// ── numbering: MAX suffix, so a delete never causes a collision ──
const suf=(s)=>parseInt(s.slice(-3),10);
const nA=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}));
const nB=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}));
const nC=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}));
check('numbers run in sequence',[suf(nB.return_number)-suf(nA.return_number),suf(nC.return_number)-suf(nB.return_number)],[1,1]);
db.deleteSalesReturn(nB.id);
const nD=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}));
check('no collision after deleting a middle return',suf(nD.return_number),suf(nC.return_number)+1);
check('all numbers share the local-date stem',[nA,nC,nD].every(x=>x.return_number.startsWith(`HR-${LOCAL}-`)),true);

// ── list filters ───────────────────────────────────────────────
check('list is newest first',db.getAllSalesReturns({})[0].return_number,nD.return_number);
check('search by return number',db.getAllSalesReturns({search:nD.return_number}).map(r=>r.id),[nD.id]);
const byBill=db.getAllSalesReturns({search:bill.bill_number});
check('search by bill number',[byBill.length,byBill.every(r=>r.bill_id===bill.id)],[2,true]);
const byShop=db.getAllSalesReturns({search:'Walk In'});
check('search by shop name',[byShop.length>0,byShop.every(r=>r.customer_name==='Walk In')],[true,true]);
const byVan=db.getAllSalesReturns({van:'V9'});
check('van filter',[byVan.length>0,byVan.every(r=>r.van==='V9')],[true,true]);
check('date filter excludes other days',db.getAllSalesReturns({date_from:'2020-01-01',date_to:'2020-01-02'}).length,0);

// ── profit: returns come off sales, GOOD pieces also come off COGS ──
const t0=db.getProfitSummary().today;
const RG=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:20,unit_price:10}]}));
const t1=db.getProfitSummary().today;
check('GOOD return nets sales, revenue and COGS',
  [r2(t1.sales-t0.sales),r2(t1.net_rev-t0.net_rev),r2(t1.cost-t0.cost),r2(t1.profit-t0.profit)],[-200,-200,-120,-80]);
check('GOOD return reported as credit',
  [r2(t1.returns-t0.returns),r2(t1.returns_net-t0.returns_net),r2(t1.returns_cost-t0.returns_cost)],[200,200,120]);
const RD=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'DAMAGED',pcs:10,unit_price:10}]}));
const t2=db.getProfitSummary().today;
check('DAMAGED return credits money but leaves COGS alone',
  [r2(t2.sales-t1.sales),r2(t2.net_rev-t1.net_rev),r2(t2.cost-t1.cost),r2(t2.profit-t1.profit)],[-100,-100,0,-100]);
check('DAMAGED return adds no COGS reversal',
  [r2(t2.returns-t1.returns),r2(t2.returns_cost-t1.returns_cost)],[100,0]);
const RT=db.createSalesReturn(std({tax_pct:10,items:[{product_id:p1.id,kind:'GOOD',pcs:10,unit_price:10}]}));
const t3=db.getProfitSummary().today;
check('taxed credit: gross off sales, net off revenue',
  [r2(t3.returns-t2.returns),r2(t3.returns_net-t2.returns_net),r2(t3.sales-t2.sales),r2(t3.net_rev-t2.net_rev)],[110,100,-110,-100]);
// the three credits above take 400 off net revenue (200 + 100 + 100 net of tax)
// and 180 off COGS (20 and 10 GOOD pcs at cost 6; the damaged 10 reverse nothing)
const expNet=r2(t0.net_rev-400), expCost=r2(t0.cost-180);
check('net revenue and COGS after the three credits',[t3.net_rev,t3.cost],[expNet,expCost]);
check('profit and margin off those netted figures',[t3.profit,t3.margin],[r2(expNet-expCost),r2((expNet-expCost)/expNet*100)]);
check('scheme block still there',Number.isFinite(t3.schemes.free_cost),true);

// ── profit report: a clean day of its own ──────────────────────
const PD='2026-07-15';
const PB=db.createBill({prefix:'HMS',bill_date:PD,customer_code:'C7',customer_name:'Shop P',van:'V7',
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10}]});
const psrc=db.getBillForReturn(PB.id);
const pr1=db.createSalesReturn({prefix:'HR',return_date:PD,bill_id:PB.id,bill_number:PB.bill_number,customer_code:'C7',
  customer_name:'Shop P',van:'V7',tax_pct:0,items:[{bill_item_id:psrc.items[0].bill_item_id,product_id:p1.id,kind:'GOOD',pcs:20,unit_price:10}]});
const pr2=db.createSalesReturn({prefix:'HR',return_date:PD,bill_id:PB.id,bill_number:PB.bill_number,customer_code:'C7',
  customer_name:'Shop P',van:'V7',tax_pct:0,items:[{bill_item_id:psrc.items[0].bill_item_id,product_id:p1.id,kind:'DAMAGED',pcs:10,unit_price:10}]});
const rep=db.getProfitReport({granularity:'daily',date_from:PD,date_to:PD});
check('report row nets returns',rep.rows.map(r=>[r.period,r.sales,r.cost,r.returns,r.profit,r.bills]),[[PD,700,480,300,220,1]]);
check('report totals carry returns',[rep.totals.sales,rep.totals.cost,rep.totals.returns,rep.totals.profit],[700,480,300,220]);
check('report margin off the netted revenue',rep.totals.margin,r2(220/700*100));
const monthRep=db.getProfitReport({granularity:'monthly',date_from:'2026-07-01',date_to:'2026-07-31'});
check('monthly bucket carries returns too',[monthRep.rows[0].period,monthRep.rows[0].returns,monthRep.rows[0].sales],['2026-07',300,700]);
check('bill summary shows the credit against the bill',
  db.getBillSummary({date_from:PD,date_to:PD}).rows.map(r=>[r.bill_number,r.total,r.returns]),[[PB.bill_number,1000,300]]);
check('bill summary totals carry returns',db.getBillSummary({date_from:PD,date_to:PD}).totals.returns,300);

// a bill with returns against it may not be deleted or re-lined out from under them,
// and the message has to name the returns that are in the way
const blockRe=new RegExp(`^Bill ${PB.bill_number} has 2 return\\(s\\) against it \\(${pr2.return_number} on ${PD}, ${pr1.return_number} on ${PD}\\)\\. Delete those returns first\\.$`);
thr('deleteBill blocked while returns stand',()=>db.deleteBill(PB.id),blockRe);
thr('updateBill blocked while returns stand',()=>db.updateBill(PB.id,{bill_date:PD,customer_code:'C7',customer_name:'Shop P',van:'V7',
  items:[{product_id:p1.id,kind:'SALE',pcs:10,unit_price:10}]}),blockRe);

// ── dashboard ──────────────────────────────────────────────────
const monthStart=TODAY.slice(0,7)+'-01';
for(const r of db.getAllSalesReturns({date_from:monthStart})) db.deleteSalesReturn(r.id);
check('this month cleared for the dashboard check',db.getAllSalesReturns({date_from:monthStart}).length,0);
const DR=db.createSalesReturn(std({tax_pct:10,items:[{product_id:p1.id,kind:'GOOD',pcs:5,unit_price:10}]}));
const ds=db.getDashboardStats();
check('dashboard todayReturns',ds.todayReturns,55);
check('dashboard monthReturns',ds.monthReturns,55);
// recentReturns is the newest rows whatever their date — the two July ones are still there
check('dashboard recentReturns',[ds.recentReturns.length,ds.recentReturns[0].return_number],[3,DR.return_number]);
check('dashboard keeps its old fields',
  [Number.isFinite(ds.todaySales),Number.isFinite(ds.monthSales),Number.isFinite(ds.monthProfit),ds.recentBills.length>0],
  [true,true,true,true]);
check('July credit stays out of this month',db.getProfitReport({granularity:'daily',date_from:PD,date_to:PD}).totals.returns,300);

// ── the credit mirrors the bill's discount and trade offer ─────
db.stockIn({product_id:p1.id,pcs:5000});
db.stockIn({product_id:p2.id,pcs:5000});
const DA='2026-05-10';
const bA=db.createBill({prefix:'HMS',bill_date:DA,customer_code:'CA',customer_name:'Shop A2',van:'VA',
  discount:100,items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10}]});
check('discounted bill: shop pays 900 on a 1000 subtotal',[bA.subtotal,bA.trade_offer,bA.total],[1000,0,900]);
const mkA=(pcs)=>db.createSalesReturn({prefix:'HR',return_date:DA,bill_id:bA.id,bill_number:bA.bill_number,
  customer_code:'CA',customer_name:'Shop A2',van:'VA',tax_pct:0,
  items:[{bill_item_id:db.getBillForReturn(bA.id).items[0].bill_item_id,product_id:p1.id,kind:'GOOD',pcs,unit_price:10}]});
const rA1=mkA(50), rA2=mkA(50);
check('half a discounted bill credits exactly half its total',rA1.total,r2(bA.total/2));
check('the two halves add up to the bill total',r2(rA1.total+rA2.total),bA.total);
const rA1row=db.getSalesReturnById(rA1.id);
check('the credit note carries the shared-out discount',[rA1row.subtotal,rA1row.trade_offer,rA1row.discount,rA1row.total],[500,0,50,450]);

db.addScheme({name:'Big bill offer',type:'TRADE_OFFER',offer_pct:2,min_bill:1000,active:1});
const bB=db.createBill({prefix:'HMS',bill_date:DA,customer_code:'CB',customer_name:'Shop B2',van:'VB',
  tax_pct:10,discount:50,manual_trade_offer:30,
  items:[{product_id:p1.id,kind:'SALE',pcs:100,unit_price:10,trade_offer_pct:5}]});
check('scheme + per-line + manual offers all land in the bill trade offer',[bB.subtotal,bB.trade_offer,bB.total],[1000,100,950]);
const rB=db.createSalesReturn({prefix:'HR',return_date:DA,bill_id:bB.id,bill_number:bB.bill_number,
  customer_code:'CB',customer_name:'Shop B2',van:'VB',tax_pct:10,
  items:[{bill_item_id:db.getBillForReturn(bB.id).items[0].bill_item_id,product_id:p1.id,kind:'GOOD',pcs:100,unit_price:10}]});
check('a full return credits exactly the bill total, offers and all',rB.total,bB.total);
const rBrow=db.getSalesReturnById(rB.id);
check('the credit note carries the offer and the discount',
  [rBrow.subtotal,rBrow.tax_amount,rBrow.trade_offer,rBrow.discount,rBrow.total],[1000,100,100,50,950]);

// ── a bill-linked line must name a line of THAT bill ───────────
const bC=db.createBill({prefix:'HMS',bill_date:DA,customer_code:'CC',customer_name:'Shop C2',van:'VC',
  items:[{product_id:p1.id,kind:'SALE',pcs:20,unit_price:10}]});
const mkC=(items)=>()=>db.createSalesReturn({prefix:'HR',return_date:DA,bill_id:bC.id,bill_number:bC.bill_number,
  customer_code:'CC',customer_name:'Shop C2',van:'VC',tax_pct:0,items});
const stockBefore=stock(p2.id), retsBefore=db.getAllSalesReturns({}).length;
thr('bill-linked line naming no bill line at all',
  mkC([{product_id:p2.id,kind:'GOOD',pcs:9999,unit_price:11}]),
  new RegExp(`^Prod Two is not on bill ${bC.bill_number}\\. Pick the bill line these pieces came off\\.$`));
thr("bill-linked line borrowing another bill's line",
  mkC([{bill_item_id:db.getBillForReturn(bB.id).items[0].bill_item_id,product_id:p1.id,kind:'GOOD',pcs:5,unit_price:10}]),
  new RegExp(`^Prod One is not on bill ${bC.bill_number}\\. Pick the bill line these pieces came off\\.$`));
thr('a good line beside a stray one takes the whole payload down',
  mkC([{bill_item_id:db.getBillForReturn(bC.id).items[0].bill_item_id,product_id:p1.id,kind:'GOOD',pcs:2,unit_price:10},
       {product_id:p2.id,kind:'GOOD',pcs:9999,unit_price:11}]),
  new RegExp(`^Prod Two is not on bill ${bC.bill_number}\\.`));
check('none of the rejected payloads moved stock or left a row',
  [stock(p2.id),db.getAllSalesReturns({}).length,db.getReturnsForBill(bC.id).length],[stockBefore,retsBefore,0]);
thr('a bill_id that names no bill',()=>db.createSalesReturn({prefix:'HR',return_date:DA,bill_id:99999,
  customer_code:'CC',customer_name:'Shop C2',van:'VC',tax_pct:0,
  items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}),/^Bill not found$/);
// the van-first bulk flow has no bill behind it and keeps taking bare lines
const VB=db.createSalesReturn(std({items:[{product_id:p2.id,kind:'GOOD',pcs:4,unit_price:20}]}));
check('an unlinked bulk return still takes lines with no bill line named',
  [VB.total,db.getSalesReturnById(VB.id).bill_id,db.getSalesReturnById(VB.id).trade_offer],[80,null,0]);

// ── returning a replacement: no credit, but its cost comes back ──
const DF='2026-04-12';
const bD=db.createBill({prefix:'HMS',bill_date:DF,customer_code:'CD',customer_name:'Shop D2',van:'VD',
  items:[{product_id:p1.id,kind:'SALE',pcs:10,unit_price:10},{product_id:p2.id,kind:'REPLACE',pcs:6}]});
const dsrc=db.getBillForReturn(bD.id);
const rD=db.createSalesReturn({prefix:'HR',return_date:DF,bill_id:bD.id,bill_number:bD.bill_number,
  customer_code:'CD',customer_name:'Shop D2',van:'VD',tax_pct:0,
  items:[{bill_item_id:dsrc.items[1].bill_item_id,product_id:p2.id,kind:'GOOD',pcs:6,unit_price:0}]});
check('a returned replacement credits nothing and restocks',[rD.total,rD.restocked],[0,6]);
// bill 100, COGS 60 + 72; the replacement comes back so its 72 leaves COGS, and profit rises to 40
check('replacement return reverses COGS at zero credit',
  db.getProfitReport({granularity:'daily',date_from:DF,date_to:DF}).rows.map(r=>[r.period,r.sales,r.cost,r.returns,r.profit,r.bills]),
  [[DF,100,60,0,40,1]]);

// ── with its returns cleared, the bill can be deleted again ────
for(const x of db.getReturnsForBill(PB.id)) db.deleteSalesReturn(x.id);
check('deleteBill works once its returns are cleared',db.deleteBill(PB.id),{success:true});
check('the bill is gone',db.getBillById(PB.id),null);

// ── a product that only ever appeared on a return is archived, not dropped ──
const p4=db.addProduct({sku_code:'P4',name:'Prod Four',price:5,cost:3,stock_qty:100}).id;
db.createSalesReturn(std({items:[{product_id:p4,kind:'GOOD',pcs:2,unit_price:5}]}));
let delP4; try{ delP4=db.deleteProduct(p4); }catch(e){ delP4=e.message; }
check('a return-only product is archived, not hard-deleted',delP4,{success:true,archived:true});
check('the archived product leaves the active list but keeps its row',
  [db.getAllProducts().some(p=>p.id===p4),db.getDataStats().products],[false,3]);

// ── plumbing: stats and reset ──────────────────────────────────
check('getDataStats counts returns',db.getDataStats().returns,db.getAllSalesReturns({}).length);
check('there are returns to clear',db.getDataStats().returns>0,true);
db.resetData({scope:'transactions'});
const cleared=db.getDataStats();
check('resetData clears returns with the rest',[cleared.returns,cleared.bills,cleared.purchases],[0,0,0]);
check('nothing left to list',db.getAllSalesReturns({}).length,0);
check('catalogue survives the reset',cleared.products,3);
const R9=db.createSalesReturn(std({items:[{product_id:p1.id,kind:'GOOD',pcs:1,unit_price:10}]}));
check('numbering restarts after a reset',R9.return_number,`HR-${LOCAL}-001`);

// ── an old database picks the tables up on open ────────────────
const mtmp=fs.mkdtempSync(path.join(os.tmpdir(),'smretmig-'));
const mp=path.join(mtmp,'old.db');
const o=new Database(mp);
o.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
   unit TEXT DEFAULT 'pcs', pcs_per_dozen INTEGER DEFAULT 12, price REAL DEFAULT 0, stock_qty REAL DEFAULT 0,
   min_stock REAL DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')),
   updated_at TEXT DEFAULT (datetime('now','localtime')));
 CREATE TABLE bills (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_number TEXT UNIQUE NOT NULL, bill_date TEXT,
   customer_code TEXT, customer_name TEXT, customer_addr TEXT, van TEXT, booker TEXT, class TEXT,
   subtotal REAL DEFAULT 0, trade_offer REAL DEFAULT 0, tax_pct REAL DEFAULT 0, tax_amount REAL DEFAULT 0,
   discount REAL DEFAULT 0, total REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
 CREATE TABLE bill_items (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
   sku_code TEXT, product_name TEXT, kind TEXT NOT NULL DEFAULT 'SALE' CHECK(kind IN ('SALE','REPLACE','FREE')),
   pcs REAL NOT NULL, pcs_per_dozen INTEGER DEFAULT 12, unit_price REAL DEFAULT 0, line_total REAL DEFAULT 0,
   scheme_id INTEGER, note TEXT, FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE);
 INSERT INTO products (sku_code,name,price,stock_qty) VALUES ('OLD1','Old Prod',10,500);
 INSERT INTO bills (bill_number,bill_date,customer_code,customer_name,total) VALUES ('OLD-1','2026-06-01','C1','Old Shop',900);
 INSERT INTO bill_items (bill_id,product_id,sku_code,product_name,kind,pcs,unit_price,line_total) VALUES (1,1,'OLD1','Old Prod','SALE',90,10,900);`);
o.close();
delete require.cache[require.resolve(DB_JS)];
const db3=require(DB_JS);
db3.initialize(mp,{});
const chk=new Database(mp,{readonly:true});
check('return tables created on upgrade',
  chk.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sales_return%' ORDER BY name").all().map(r=>r.name),
  ['sales_return_items','sales_returns']);
check('return indexes created on upgrade',
  chk.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_sales_returns_date','idx_sales_returns_bill','idx_sr_items_ret') ORDER BY name").all().map(r=>r.name),
  ['idx_sales_returns_bill','idx_sales_returns_date','idx_sr_items_ret']);
chk.close();
check('old bills still read',db3.getAllBills({}).map(b=>b.bill_number),['OLD-1']);
check('no returns on the upgraded db',[db3.getDataStats().returns,db3.getAllSalesReturns({}).length],[0,0]);
const osrc=db3.getBillForReturn('OLD-1');
check('old bill offers its lines for return',osrc.items.map(i=>[i.product_name,i.remaining_pcs]),[['Old Prod',90]]);
const oret=db3.createSalesReturn({prefix:'HR',return_date:'2026-06-02',bill_id:osrc.id,bill_number:'OLD-1',
  customer_code:'C1',customer_name:'Old Shop',van:'V1',tax_pct:0,
  items:[{bill_item_id:osrc.items[0].bill_item_id,product_id:osrc.items[0].product_id,kind:'GOOD',pcs:10,unit_price:10}]});
check('return against a migrated bill',[oret.total,oret.restocked,db3.getAllProducts()[0].stock_qty],[100,10,510]);
check('migrated bill line cost defaults to 0',db3.getSalesReturnById(oret.id).items[0].cost,0);

// ── sample data ships a few returns ────────────────────────────
const s1p=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'smretsamp-')),'t.db');
delete require.cache[require.resolve(DB_JS)];
const db4=require(DB_JS);
db4.initialize(s1p,{});
db4.setSamplePrefixes('SB','SL','SR');
const st=db4.loadSampleData();
check('sample data creates returns',st.returns>0,true);
const srets=db4.getAllSalesReturns({});
check('every sample return is listed',srets.length,st.returns);
check('sample returns use the brand prefix',srets.every(r=>r.return_number.startsWith('SR-')),true);
check('sample returns hang off real bills',srets.every(r=>r.bill_id && r.bill_number),true);
check('sample returns put pieces back',srets.some(r=>r.restock_pcs>0),true);
check('sample returns include damaged goods',srets.some(r=>r.damaged_pcs>0),true);
check('sample returns never exceed the bill',
  srets.every(r=>{const it=db4.getBillForReturn(r.bill_id).items;
    return it.length>0 && it.every(i=>i.returned_pcs<=i.pcs && i.remaining_pcs===r2(i.pcs-i.returned_pcs));}),true);
check('sample credits are never more than the bill they came off',
  srets.every(r=>r.total<=r2(db4.getBillById(r.bill_id).total+0.01)),true);
check('sample returns show in the profit report',
  db4.getProfitReport({granularity:'monthly',date_from:'2026-01-01',date_to:'2026-12-31'}).totals.returns>0,true);
check('sample bills still use their own prefix',db4.getAllBills({})[0].bill_number.startsWith('SB-'),true);

// two-argument callers keep working; the return prefix just falls back
const s2p=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'smretsamp2-')),'t.db');
delete require.cache[require.resolve(DB_JS)];
const db5=require(DB_JS);
db5.initialize(s2p,{});
db5.setSamplePrefixes('XB','XL');
db5.loadSampleData();
check('old two-argument setSamplePrefixes still sets the bill prefix',db5.getAllBills({})[0].bill_number.startsWith('XB-'),true);
const s5=db5.getAllSalesReturns({});
check('the fallback return prefix is brand-neutral',[s5.length>0,s5.every(r=>r.return_number.startsWith('RET-'))],[true,true]);

console.log(f?`\n${f} FAILURES`:'\nALL PASS');
process.exit(f?1:0);
