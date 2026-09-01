require('./sqlite-shim');
const path=require('path'), fs=require('fs'), os=require('os');
const db=require(__dirname + '/../database.js');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smlf-'));
const dbFile=path.join(tmp,'t.db');
db.initialize(dbFile,{});
let f=0; const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`);};
const thr=(n,fn,re)=>{let m=''; try{fn();}catch(e){m=e.message;} const ok=re.test(m); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  got="${m}"`}`);};
const stock=()=>db.getAllProducts()[0].stock_qty;
const setRtg=(lfid,pcs)=>{const l=db.getLoadForm(lfid).lines[0];
  db.updateLoadFormLine({id:l.id, load2_pcs:0, rtg_pcs:pcs, dented_pcs:0, leak_pcs:0, replace_pcs:0, scheme_note:''});};

db.addProduct({sku_code:'P1',name:'Prod One',price:10,cost:6,pcs_per_dozen:12,stock_qty:1000});
const prod=db.getAllProducts()[0];
db.createBill({bill_date:'2026-08-29',customer_code:'C1',customer_name:'Shop A',van:'V1',
  items:[{product_id:prod.id,kind:'SALE',pcs:120,unit_price:10}]});
check('stock after bill',stock(),880);

const free=db.listBillsForLoad({date_from:'2026-08-29',date_to:'2026-08-29',van:'V1'});
check('bill available for load',free.length,1);
const lf=db.generateLoadForm({van:'V1',form_date:'2026-08-29',bill_ids:free.map(b=>b.id)});
check('one load line',db.getLoadForm(lf.id).lines.length,1);

// close: RTG goes back to stock
setRtg(lf.id,10);
check('close returns restocked',db.setLoadFormStatus(lf.id,'CLOSED'),{success:true,restocked:10});
check('stock after close',stock(),890);
check('returned_pcs latched',db.getLoadForm(lf.id).lines[0].returned_pcs,10);

// the direct IPC path is idempotent on an unchanged form
check('processLoadReturn re-run is a no-op',db.processLoadReturn(lf.id),{success:true,already:true});
check('stock unmoved by re-run',stock(),890);

// reopen, correct RTG upward, re-close: only the delta moves
db.setLoadFormStatus(lf.id,'OPEN');
check('stock unmoved by reopen',stock(),890);
setRtg(lf.id,25);
check('re-close moves the delta only',db.setLoadFormStatus(lf.id,'CLOSED'),{success:true,restocked:15});
check('stock after corrected close',stock(),905);

// re-close with nothing changed
check('re-close with no change',db.setLoadFormStatus(lf.id,'CLOSED'),{success:true,already:true});
check('stock after no-change close',stock(),905);

// correcting downward takes the difference back out
db.setLoadFormStatus(lf.id,'OPEN'); setRtg(lf.id,20);
check('downward correction',db.setLoadFormStatus(lf.id,'CLOSED'),{success:true,restocked:-5});
check('stock after downward correction',stock(),900);

// delete reverses what was credited
db.deleteLoadForm(lf.id);
check('stock after delete',stock(),880);
check('bill released back to the pool',db.listBillsForLoad({date_from:'2026-08-29',date_to:'2026-08-29',van:'V1'}).length,1);

// delete guard: not enough stock left to take the credit back
const lf2=db.generateLoadForm({van:'V1',form_date:'2026-08-29',bill_ids:[free[0].id]});
setRtg(lf2.id,25);
db.setLoadFormStatus(lf2.id,'CLOSED');
check('stock after second close',stock(),905);
db.stockIn({product_id:prod.id,pcs:-895});
check('stock drained',stock(),10);
thr('delete negative-stock guard',()=>db.deleteLoadForm(lf2.id),
  /^Cannot delete: Prod One stock would go negative \(have 10, form returned 25\)$/);
check('guarded delete kept the form',db.getAllLoadForms({}).length,1);
check('guarded delete kept the stock',stock(),10);
db.stockIn({product_id:prod.id,pcs:900});
db.deleteLoadForm(lf2.id);
check('delete works when stock suffices',stock(),885);

// upgrading a db whose forms were closed under the old latch must not re-credit them
const lf3=db.generateLoadForm({van:'V1',form_date:'2026-08-29',bill_ids:[free[0].id]});
setRtg(lf3.id,30); db.setLoadFormStatus(lf3.id,'CLOSED');
check('stock after third close',stock(),915);
db.closeDb();
const Database=require('better-sqlite3');
const raw=new Database(dbFile);
raw.exec('ALTER TABLE load_form_lines DROP COLUMN returned_pcs');
raw.close();
const DB_JS=__dirname + '/../database.js';
delete require.cache[require.resolve(DB_JS)];
const db2=require(DB_JS);
db2.initialize(dbFile,{});
check('migration backfills credited pieces',db2.getLoadForm(lf3.id).lines[0].returned_pcs,30);
check('re-close after upgrade is a no-op',db2.setLoadFormStatus(lf3.id,'CLOSED'),{success:true,already:true});
check('stock after upgrade re-close',db2.getAllProducts()[0].stock_qty,915);

console.log(f?`\n${f} FAILURES`:'\nALL PASS');
process.exit(f?1:0);
