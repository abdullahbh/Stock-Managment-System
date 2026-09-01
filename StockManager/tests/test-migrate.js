const path=require('path'),fs=require('fs'),os=require('os');
const Database=require('better-sqlite3');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smmig-'));
const p=path.join(tmp,'old.db');
// an old database, missing offer_pct / manual_trade_offer
const o=new Database(p);
o.exec(`CREATE TABLE schemes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('FREE_GOODS','TRADE_OFFER')), product_id INTEGER,
  buy_pcs INTEGER DEFAULT 0, free_pcs INTEGER DEFAULT 0, offer_amount REAL DEFAULT 0,
  min_bill REAL DEFAULT 0, active INTEGER DEFAULT 1);
 CREATE TABLE bills (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_number TEXT UNIQUE NOT NULL,
  bill_date TEXT, customer_code TEXT, customer_name TEXT, customer_addr TEXT, van TEXT, booker TEXT,
  class TEXT, subtotal REAL DEFAULT 0, trade_offer REAL DEFAULT 0, tax_pct REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0, notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')));
 INSERT INTO schemes (name,type,offer_amount,min_bill) VALUES ('Legacy flat',  'TRADE_OFFER', 150, 500);
 INSERT INTO bills (bill_number,bill_date,total) VALUES ('OLD-1','2026-06-01',900);`);
o.close();

const db=require(__dirname + '/../database.js');
db.initialize(p,{});
let f=0; const check=(n,a,e)=>{const ok=JSON.stringify(a)===JSON.stringify(e); if(!ok)f++;
  console.log(`${ok?'PASS':'FAIL'} ${n}${ok?'':`  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`);};
check('schemes.offer_pct added',db.getAllSchemes()[0].offer_pct,0);
db.addProduct({sku_code:'P1',name:'P',price:10,cost:6,stock_qty:1000});
const prod=db.getAllProducts()[0];
const r=db.createBill({bill_date:'2026-06-02',customer_code:'C1',customer_name:'S',van:'V1',manual_trade_offer:7,
  items:[{product_id:prod.id,kind:'SALE',pcs:100,unit_price:10}]});
check('legacy flat on migrated db',r.trade_offer,157);
check('bills.manual_trade_offer added',db.getBillById(r.id).manual_trade_offer,7);
const u=db.updateBill(r.id,{bill_date:'2026-06-02',customer_code:'C1',customer_name:'S',van:'V1',manual_trade_offer:11,
  items:[{product_id:prod.id,kind:'SALE',pcs:100,unit_price:10}]});
check('updateBill trade_offer',u.trade_offer,161);
check('updateBill manual persisted',db.getBillById(r.id).manual_trade_offer,11);
check('old bill readable',db.getAllBills({date_from:'2026-06-01',date_to:'2026-06-01'}).length,1);
console.log(f?`\n${f} FAILURES`:'\nALL PASS');
process.exit(f?1:0);
