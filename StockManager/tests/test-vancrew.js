// FEATURE 2: a van remembers its usual crew (order booker + delivery man).
// setVanCrew stores it, and every saved/updated bill auto-learns the van's last crew.
require('./sqlite-shim.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const DB_JS = __dirname + '/../database.js';
const db = require(DB_JS);
db.initialize(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smcrew-')), 'test.db'), {});

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}
const vanOf = (name) => db.listMasters('van').find(v => v.name === name);

db.addProduct({ sku_code: 'P1', name: 'Prod One', price: 10, cost: 6, pcs_per_dozen: 12, stock_qty: 100000 });
const p1 = db.getAllProducts()[0];

// ── setVanCrew stores booker/dm on the van row; listMasters('van') returns them ──
db.setVanCrew('VAN 01', 'SAQIB', 'AZHAR');
const v01 = vanOf('VAN 01');
check('setVanCrew created the van row', !!v01, true);
check('setVanCrew stored the booker', v01.booker, 'SAQIB');
check('setVanCrew stored the delivery man', v01.dm, 'AZHAR');
check("listMasters('van') carries the crew columns", ['booker', 'dm'].every(k => k in v01), true);

// inputs are trimmed
db.setVanCrew('  VAN 02  ', '  HASEEB ', ' BILAL ');
const v02 = vanOf('VAN 02');
check('setVanCrew trims the van name', !!v02, true);
check('setVanCrew trims the crew', [v02.booker, v02.dm], ['HASEEB', 'BILAL']);

// re-setting overwrites
db.setVanCrew('VAN 01', 'NEW BK', 'NEW DM');
check('setVanCrew overwrites an existing crew', [vanOf('VAN 01').booker, vanOf('VAN 01').dm], ['NEW BK', 'NEW DM']);

// ── saving a bill with a van + booker + dm makes the van auto-learn that crew ──
const b = db.createBill({ prefix: 'CR', customer_code: 'C1', customer_name: 'Shop A', van: 'VAN 03',
  booker: 'AMIR', delivery_man: 'KHAN', items: [{ product_id: p1.id, kind: 'SALE', pcs: 10, unit_price: 10 }] });
const v03 = vanOf('VAN 03');
check('createBill auto-learns the van crew', [v03.booker, v03.dm], ['AMIR', 'KHAN']);

// ── updating a bill changes the remembered crew ──────────────────
db.updateBill(b.id, { customer_code: 'C1', customer_name: 'Shop A', van: 'VAN 03', bill_date: b.bill_date,
  booker: 'ZAID', delivery_man: 'OMER', items: [{ product_id: p1.id, kind: 'SALE', pcs: 10, unit_price: 10 }] });
const v03b = vanOf('VAN 03');
check('updateBill re-learns the van crew', [v03b.booker, v03b.dm], ['ZAID', 'OMER']);

// ── an OLD db whose route_masters predates booker/dm upgrades cleanly ─────────
const oldp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smcrew-old-')), 'old.db');
const o = new Database(oldp);
o.exec(`CREATE TABLE route_masters (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(kind,name));
  INSERT INTO route_masters (kind,name) VALUES ('van','VAN OLD');
  INSERT INTO route_masters (kind,name) VALUES ('booker','SAQIB');`);
o.close();

delete require.cache[require.resolve(DB_JS)];
const db2 = require(DB_JS);
db2.initialize(oldp, {});
const vold = db2.listMasters('van').find(v => v.name === 'VAN OLD');
check('old route_masters upgraded, the van row survived', !!vold, true);
check('a van with no crew reports empty strings after upgrade', [vold.booker, vold.dm], ['', '']);
db2.setVanCrew('VAN OLD', 'LATE BK', 'LATE DM');
const vold2 = db2.listMasters('van').find(v => v.name === 'VAN OLD');
check('setVanCrew works on the upgraded db', [vold2.booker, vold2.dm], ['LATE BK', 'LATE DM']);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
