// The owner's exact scenario: four flavours of a 190g jam, 6 pcs each = 24 in the group,
// with "buy 12, get 1 free" on the group -> must give 2 free (the mixed order counts together).
require('./sqlite-shim.js');
const path = require('path'), fs = require('fs'), os = require('os');
const db = require(__dirname + '/../database.js');
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fg6-')), 't.db'), {});

let f = 0;
const check = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); if (!ok) f++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : `  exp=${JSON.stringify(e)} got=${JSON.stringify(a)}`}`); };
const t = new Date(); const D = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;

// 190g jam flavours in one group, 370g jam flavours in another (like the owner's codes 101-104 / 106-110)
[['101','MANGO JAM 190G','JAM 190G'],['102','MIX JAM 190G','JAM 190G'],['103','APPLE JAM 190G','JAM 190G'],['104','ORANGE JAM 190G','JAM 190G'],
 ['106','MANGO JAM 370G','JAM 370G'],['107','MIX JAM 370G','JAM 370G'],['108','APPLE JAM 370G','JAM 370G']]
 .forEach(([sku,name,grp])=>db.addProduct({sku_code:sku,name,pcs_per_dozen:24,cost:100,price:187.08,stock_qty:5000,grp}));
const P = Object.fromEntries(db.getAllProducts().map(p=>[p.sku_code,p]));

db.addScheme({ name:'Jam 190g dozen', type:'FREE_GOODS', grp:'JAM 190G', buy_pcs:12, free_pcs:1, active:1 });
db.addScheme({ name:'Jam 370g dozen', type:'FREE_GOODS', grp:'JAM 370G', buy_pcs:12, free_pcs:1, active:1 });

const bill = (items)=>db.createBill({ bill_date:D, customer_code:'C'+(bill._n=(bill._n||0)+1), customer_name:'Shop', van:'V1',
  tax_pct:0, discount:0, items });
const free = (id)=>db.getBillById(id).items.filter(i=>i.kind==='FREE').map(i=>[i.sku_code,i.pcs]);

// 6 of each of the four 190g flavours = 24 -> 2 free (from the most-bought; all equal -> first listed)
let r = bill([{product_id:P['101'].id,kind:'SALE',pcs:6,unit_price:187.08},
              {product_id:P['102'].id,kind:'SALE',pcs:6,unit_price:187.08},
              {product_id:P['103'].id,kind:'SALE',pcs:6,unit_price:187.08},
              {product_id:P['104'].id,kind:'SALE',pcs:6,unit_price:187.08}]);
check('four flavours x 6 pcs = 24 -> 2 free', free(r.id), [['101',2]]);

// 6 of each of THREE 190g flavours = 18 -> floor(18/12)=1 free
r = bill([{product_id:P['101'].id,kind:'SALE',pcs:6,unit_price:187.08},
          {product_id:P['102'].id,kind:'SALE',pcs:6,unit_price:187.08},
          {product_id:P['103'].id,kind:'SALE',pcs:6,unit_price:187.08}]);
check('three flavours x 6 = 18 -> 1 free', free(r.id), [['101',1]]);

// only 6 pcs of one flavour (under a dozen even in the group) -> nothing
r = bill([{product_id:P['101'].id,kind:'SALE',pcs:6,unit_price:187.08}]);
check('a single 6-piece line earns nothing', free(r.id), []);

// mixed across BOTH groups: 24 of 190g + 24 of 370g -> 2 free in each group, separately
r = bill([{product_id:P['101'].id,kind:'SALE',pcs:12,unit_price:187.08},{product_id:P['102'].id,kind:'SALE',pcs:12,unit_price:187.08},
          {product_id:P['106'].id,kind:'SALE',pcs:12,unit_price:280.83},{product_id:P['107'].id,kind:'SALE',pcs:12,unit_price:280.83}]);
check('two groups on one bill each earn their own free', free(r.id).sort(), [['101',2],['106',2]].sort());

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
process.exit(f?1:0);
