const Database = require('better-sqlite3');

let db;

/**
 * @param {string} dbPath absolute path to the sqlite file (injected by main.js)
 */
function initialize(dbPath, brandDefaults) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');   // safe with WAL, much faster writes
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -8000');     // ~8 MB page cache

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_code      TEXT    UNIQUE NOT NULL,
      name          TEXT    NOT NULL,
      unit          TEXT    DEFAULT 'pcs',
      pcs_per_dozen INTEGER DEFAULT 12,   -- pieces that make one "dozen" line unit
      price         REAL    DEFAULT 0,    -- selling rate per piece
      cost          REAL    DEFAULT 0,    -- purchase/cost price per piece (for profit)
      stock_qty     REAL    DEFAULT 0,    -- canonical stock is always in PIECES
      min_stock     REAL    DEFAULT 0,
      grp           TEXT    DEFAULT '',   -- flavour group; a group free-goods scheme counts all its flavours together
      active        INTEGER DEFAULT 1,
      created_at    TEXT    DEFAULT (datetime('now','localtime')),
      updated_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- Trade promotions. Two kinds:
    --   FREE_GOODS  : buy_pcs of a product (or of a whole flavour group)  ->  free_pcs (piece for piece, not billed)
    --   TRADE_OFFER : offer_pct % of a qualifying bill (>= min_bill) knocked off;
    --                 legacy rows may instead carry a flat offer_amount
    CREATE TABLE IF NOT EXISTS schemes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      type          TEXT    NOT NULL CHECK(type IN ('FREE_GOODS','TRADE_OFFER')),
      product_id    INTEGER,              -- a single product (FREE_GOODS by product), else null
      grp           TEXT    DEFAULT '',   -- a flavour group (FREE_GOODS by group); counts every product in the group together
      buy_pcs       INTEGER DEFAULT 0,
      free_pcs      INTEGER DEFAULT 0,
      offer_amount  REAL    DEFAULT 0,
      offer_pct     REAL    DEFAULT 0,
      min_bill      REAL    DEFAULT 0,
      scheme_date   TEXT,
      active        INTEGER DEFAULT 1,
      created_at    TEXT    DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number   TEXT    UNIQUE NOT NULL,
      bill_date     TEXT    DEFAULT (date('now','localtime')),
      customer_code TEXT,
      customer_name TEXT,
      customer_addr TEXT,
      van           TEXT,
      booker        TEXT,
      delivery_man  TEXT,
      class         TEXT,
      subtotal      REAL    DEFAULT 0,   -- SALE lines only
      trade_offer   REAL    DEFAULT 0,   -- from TRADE_OFFER schemes + manual
      manual_trade_offer REAL DEFAULT 0, -- the hand-typed part of trade_offer (rupees actually deducted)
      manual_trade_offer_pct REAL DEFAULT 0, -- % of subtotal that produced it
      tax_pct       REAL    DEFAULT 0,
      tax_amount    REAL    DEFAULT 0,
      discount      REAL    DEFAULT 0,
      scheme_off    INTEGER DEFAULT 0,
      total         REAL    DEFAULT 0,   -- payable
      notes         TEXT,
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    -- kind:
    --   SALE    -> billed  (line_total = pcs * unit_price)
    --   REPLACE -> swap, piece-for-piece, NOT billed (line_total = 0), still loaded on van
    --   FREE    -> scheme free goods, NOT billed (line_total = 0), still loaded on van
    CREATE TABLE IF NOT EXISTS bill_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id       INTEGER NOT NULL,
      product_id    INTEGER NOT NULL,
      sku_code      TEXT,
      product_name  TEXT,
      kind          TEXT    NOT NULL DEFAULT 'SALE' CHECK(kind IN ('SALE','REPLACE','FREE')),
      pcs           REAL    NOT NULL,
      pcs_per_dozen INTEGER DEFAULT 12,
      unit_price    REAL    DEFAULT 0,
      cost          REAL    DEFAULT 0,   -- snapshot of product cost per piece at sale time
      line_total    REAL    DEFAULT 0,
      trade_offer   REAL    DEFAULT 0,   -- per-line trade offer in rupees (summed into bill trade_offer)
      trade_offer_pct REAL  DEFAULT 0,   -- % of the line that produced it
      scheme_id     INTEGER,
      note          TEXT,
      FOREIGN KEY (bill_id)    REFERENCES bills(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS load_forms (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      form_number   TEXT    UNIQUE NOT NULL,
      form_date     TEXT    DEFAULT (date('now','localtime')),
      van           TEXT,
      booker        TEXT,
      booking_amount REAL   DEFAULT 0,   -- sum of billed totals on this load
      bill_count    INTEGER DEFAULT 0,
      notes         TEXT,
      status        TEXT    DEFAULT 'OPEN', -- OPEN while loading, CLOSED after return reconciliation
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS load_form_bills (
      load_form_id  INTEGER NOT NULL,
      bill_id       INTEGER NOT NULL,
      PRIMARY KEY (load_form_id, bill_id),
      FOREIGN KEY (load_form_id) REFERENCES load_forms(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_id)      REFERENCES bills(id)
    );

    -- One row per product on a load. Left side = what to issue (dozens/pieces),
    -- right side = check/return columns filled when the van comes back.
    CREATE TABLE IF NOT EXISTS load_form_lines (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      load_form_id  INTEGER NOT NULL,
      product_id    INTEGER NOT NULL,
      sku_code      TEXT,
      product_name  TEXT,
      pcs_per_dozen INTEGER DEFAULT 12,
      pieces        REAL    DEFAULT 0,   -- total SALE pieces issued
      dozens        REAL    DEFAULT 0,   -- pieces / pcs_per_dozen
      free_pcs      REAL    DEFAULT 0,   -- scheme free goods to load
      replace_pcs   REAL    DEFAULT 0,   -- swaps to load
      scheme_note   TEXT,                -- scheme names touching this product
      -- return / check columns (start at 0, edited on return)
      load2_pcs     REAL    DEFAULT 0,
      rtg_pcs       REAL    DEFAULT 0,   -- returned good
      dented_pcs    REAL    DEFAULT 0,
      leak_pcs      REAL    DEFAULT 0,
      returned_pcs  REAL    DEFAULT 0,   -- rtg pieces already credited back to stock
      FOREIGN KEY (load_form_id) REFERENCES load_forms(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id)   REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      address    TEXT,
      phone      TEXT,
      ntn        TEXT,
      cnic       TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS route_masters (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,               -- 'van' | 'booker' | 'dm'
      name TEXT NOT NULL,
      booker TEXT DEFAULT '',           -- van's usual order booker (kind='van' rows only)
      dm     TEXT DEFAULT '',           -- van's usual delivery man (kind='van' rows only)
      UNIQUE(kind, name)
    );

    CREATE TABLE IF NOT EXISTS closed_days (
      date      TEXT PRIMARY KEY,
      closed_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT UNIQUE NOT NULL,
      purchase_date   TEXT DEFAULT (date('now','localtime')),
      vehicle_no      TEXT,
      supplier        TEXT,
      total           REAL DEFAULT 0,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id  INTEGER NOT NULL,
      product_id   INTEGER NOT NULL,
      sku_code     TEXT, product_name TEXT,
      pcs          REAL DEFAULT 0,
      unit_cost    REAL DEFAULT 0,
      line_total   REAL DEFAULT 0,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
    );

    -- Goods coming back from a shop after a bill. Credits the customer either way;
    -- GOOD pieces go back into stock, DAMAGED pieces are written off.
    CREATE TABLE IF NOT EXISTS sales_returns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      return_date   TEXT NOT NULL,
      bill_id       INTEGER,
      bill_number   TEXT,
      customer_code TEXT, customer_name TEXT, customer_addr TEXT,
      van           TEXT, booker TEXT, delivery_man TEXT,
      subtotal      REAL DEFAULT 0,
      tax_pct       REAL DEFAULT 0,
      tax_amount    REAL DEFAULT 0,
      trade_offer   REAL DEFAULT 0,   -- the bill's trade offer, in proportion to what came back
      discount      REAL DEFAULT 0,   -- likewise the bill's discount
      total         REAL DEFAULT 0,
      restock_pcs   REAL DEFAULT 0,   -- GOOD pieces put back on the shelf
      damaged_pcs   REAL DEFAULT 0,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (bill_id) REFERENCES bills(id)
    );
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id     INTEGER NOT NULL,
      bill_item_id  INTEGER,            -- the bill line this came off, when the return is against a bill
      product_id    INTEGER,
      sku_code      TEXT, product_name TEXT,
      kind          TEXT DEFAULT 'GOOD' CHECK(kind IN ('GOOD','DAMAGED')),
      pcs           REAL DEFAULT 0,
      pcs_per_dozen REAL DEFAULT 12,
      unit_price    REAL DEFAULT 0,
      cost          REAL DEFAULT 0,     -- snapshot of what the sale booked, for the COGS reversal
      line_total    REAL DEFAULT 0,
      FOREIGN KEY (return_id)  REFERENCES sales_returns(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS tax_invoices (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id    INTEGER UNIQUE NOT NULL,
      invoice_no INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // migrate older databases that predate the cost columns
  const ensureCol = (tbl, col, decl) => {
    const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    if (cols.includes(col)) return false;
    db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${decl}`);
    return true;
  };
  ensureCol('products', 'cost', 'REAL DEFAULT 0');
  ensureCol('bill_items', 'cost', 'REAL DEFAULT 0');
  ensureCol('bills', 'delivery_man', 'TEXT');
  ensureCol('bills', 'scheme_off', 'INTEGER DEFAULT 0');
  ensureCol('schemes', 'scheme_date', 'TEXT');
  ensureCol('customers', 'phone', 'TEXT');
  ensureCol('customers', 'ntn', 'TEXT');
  ensureCol('customers', 'cnic', 'TEXT');
  ensureCol('load_forms', 'returned', 'INTEGER DEFAULT 0');
  // forms closed before this column existed had their RTG credited already
  db.transaction(() => {
    if (ensureCol('load_form_lines', 'returned_pcs', 'REAL DEFAULT 0'))
      db.exec('UPDATE load_form_lines SET returned_pcs = rtg_pcs WHERE load_form_id IN (SELECT id FROM load_forms WHERE returned=1)');
  })();
  ensureCol('bill_items', 'trade_offer', 'REAL DEFAULT 0');
  ensureCol('schemes', 'offer_pct', 'REAL DEFAULT 0');
  ensureCol('bills', 'manual_trade_offer', 'REAL DEFAULT 0');
  ensureCol('bills', 'manual_trade_offer_pct', 'REAL DEFAULT 0');
  ensureCol('bill_items', 'trade_offer_pct', 'REAL DEFAULT 0');
  ensureCol('sales_returns', 'trade_offer', 'REAL DEFAULT 0');
  ensureCol('sales_returns', 'discount', 'REAL DEFAULT 0');
  ensureCol('products', 'grp', "TEXT DEFAULT ''");
  ensureCol('schemes', 'grp', "TEXT DEFAULT ''");
  ensureCol('route_masters', 'booker', "TEXT DEFAULT ''");
  ensureCol('route_masters', 'dm', "TEXT DEFAULT ''");

  // Indexes for the hot paths (lists, duplicate check, joins). IF NOT EXISTS = safe on upgrade.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bills_date          ON bills(bill_date);
    CREATE INDEX IF NOT EXISTS idx_bills_cust_van_date ON bills(customer_code, van, bill_date);
    CREATE INDEX IF NOT EXISTS idx_bills_van           ON bills(van);
    CREATE INDEX IF NOT EXISTS idx_bill_items_bill     ON bill_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_bill_items_kind     ON bill_items(bill_id, kind);
    CREATE INDEX IF NOT EXISTS idx_bill_items_prod     ON bill_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_lf_lines_form       ON load_form_lines(load_form_id);
    CREATE INDEX IF NOT EXISTS idx_lf_status           ON load_forms(status);
    CREATE INDEX IF NOT EXISTS idx_load_forms_date     ON load_forms(form_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_pur  ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_lf_bills_form       ON load_form_bills(load_form_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_date  ON sales_returns(return_date);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_bill  ON sales_returns(bill_id);
    CREATE INDEX IF NOT EXISTS idx_sr_items_ret        ON sales_return_items(return_id);
  `);

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  const defaults = [
    ['business_address', ''],
    ['business_phone', ''],
    ['tax_rate', '0'],
    ['currency_symbol', 'Rs'],
    ['business_ntn', ''],
    ['business_gst', ''],
    ['gst_rate', '0'],
  ];
  const seed = db.transaction(() => { for (const [k, v] of defaults) insertSetting.run(k, v); });
  seed();

  // Brand-provided defaults: seed them, and fill any value the owner has left blank
  // (gst_rate also upgrades from the old '0' default). Values the owner typed are never touched.
  if (brandDefaults && typeof brandDefaults === 'object') {
    const fill = db.prepare(`UPDATE settings SET value=? WHERE key=? AND (value IS NULL OR TRIM(value)='' OR (key='gst_rate' AND TRIM(value)='0'))`);
    const apply = db.transaction(() => {
      for (const [k, v] of Object.entries(brandDefaults)) { insertSetting.run(k, String(v)); fill.run(String(v), k); }
    });
    apply();
  }
}



// ── Sample data for demonstrations ──────────────────────────────
// Builds a believable month of trading so every screen and chart has something to show.
function loadSampleData(){
  if (db.prepare('SELECT COUNT(*) n FROM bills').get().n > 0) throw new Error('There is already data in this app. Clear it first, then load the sample data.');
  const D = (back)=>{ const d=new Date(); d.setDate(d.getDate()-back); return d.toISOString().slice(0,10); };
  const P = {};
  const cat = [
    ['208','COLA NEXT 1500ML',12,96,118.33],  ['209','FIZUP NEXT 1500ML',12,96,118.33],
    ['202','COLA NEXT 500ML',12,24,30],       ['152','FIZUP NEXT 300ML',12,9.5,12],
    ['3','COLA NEXT 300ML',12,9.5,12],        ['309','COLA NEXT 1LTR',12,73,90],
    ['352','COLA NEXT 2.25LTR',12,150,177.5], ['360','WATER NEXT 600ML',12,19,25],
  ];
  for (const [c,n,pd,cost,price] of cat)
    P[c] = addProduct({ sku_code:c, name:n, pcs_per_dozen:pd, cost, price, stock_qty:0, min_stock:48 }).id;

  addScheme({ name:'Cola 1500 promo', type:'FREE_GOODS', product_id:P['208'], buy_pcs:120, free_pcs:6, scheme_date:D(30), active:1 });
  addScheme({ name:'Fizup 1500 promo', type:'FREE_GOODS', product_id:P['209'], buy_pcs:120, free_pcs:6, scheme_date:D(30), active:1 });
  addScheme({ name:'Big bill offer', type:'TRADE_OFFER', offer_pct:2, min_bill:20000, scheme_date:D(30), active:1 });

  for (const v of ['VAN 01','VAN 02','VAN 03']) addMaster('van', v);
  for (const b of ['SAQIB','HASEEB']) addMaster('booker', b);
  for (const d of ['AZHAR','BILAL']) addMaster('dm', d);

  const shops = [
    ['4542','AW BAKER','National Market','0300-1234567','1234567-8'],
    ['2206','FRESCO BAKER','Chaklala Scheme III','0301-2345678',''],
    ['3408','BISMILLAH G-S','Sadar Bazaar','',''],
    ['3765','KHAN QAY HUSSANIA','Committee Chowk','0333-9876543','7654321-0'],
    ['3853','AL BAIK BAKERY','Kalma Chowk','',''],
    ['1431','AZEEM UTILITY STORE','Airport Road','0345-1122334',''],
    ['3784','ABBASI G-S','Dhoke Kala Khan','',''],
    ['3854','KAMRAN SWEETS','Raja Bazaar','0311-4455667',''],
    ['3725','MARDAN GENERAL STORE','Peshawar Road','',''],
    ['3771','GHOUSIA AJMERIA','Murree Road','',''],
    ['3856','UMAR G-S','Satellite Town','',''],
    ['3755','MUDASSIR GENERAL','Westridge','',''],
  ];
  for (const [code,name,addr,phone,ntn] of shops) upsertCustomer({ code, name, address:addr, phone, ntn });

  // stock in — three deliveries across the month
  const bulk = (mult)=> cat.map(([c])=>({ product_id:P[c],
      pcs: Math.round((c==='208'||c==='202'||c==='209' ? 3000 : 1800) * mult),
      unit_cost: cat.find(x=>x[0]===c)[3] }));
  createPurchase({ purchase_date:D(28), vehicle_no:'ABC-123',  supplier:'Next Cola Distributors', items:bulk(1) });
  createPurchase({ purchase_date:D(19), vehicle_no:'LES-8842', supplier:'Next Cola Distributors', items:bulk(0.9) });
  createPurchase({ purchase_date:D(11), vehicle_no:'ABC-123',  supplier:'Shezan International',   items:bulk(0.9) });
  createPurchase({ purchase_date:D(4),  vehicle_no:'RIU-3391', supplier:'Next Cola Distributors', items:bulk(0.8) });

  // a month of billing
  const routes = [
    { van:'VAN 01', booker:'SAQIB',  dm:'AZHAR', shops:['4542','2206','3853','1431','3784'] },
    { van:'VAN 02', booker:'HASEEB', dm:'BILAL', shops:['3408','3765','3854','3725'] },
    { van:'VAN 03', booker:'SAQIB',  dm:'BILAL', shops:['3771','3856','3755'] },
  ];
  const skus = Object.keys(P);
  let seed = 20260829;
  // 32-bit arithmetic — plain multiplication overflows and stops varying
  const rnd = (n)=>{ seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) % n; };
  for (let back=27; back>=0; back--){
    const date = D(back);
    if (new Date(date).getDay() === 0) continue;            // no billing on Sundays
    for (const r of routes){
      for (const code of r.shops){
        if (rnd(8) === 0) continue;                       // the odd shop is closed that day
        const shop = shops.find(s=>s[0]===code);
        const items = [];
        const used = {};
        // most bills lead with a case-lot of a 1.5 litre line, which is what earns the free goods
        // roughly one shop in four takes a case-lot of a 1.5 litre line — that is what earns the free goods
        if (rnd(4) === 0){
          const lead = rnd(2) ? '208' : '209';
          used[lead] = 1;
          items.push({ product_id:P[lead], kind:'SALE', pcs: (10 + rnd(3)) * 12 });
        }
        const nLines = 1 + rnd(3);
        for (let l=0; l<nLines; l++){
          const sku = skus[rnd(skus.length)];
          if (used[sku]) continue; used[sku] = 1;
          items.push({ product_id:P[sku], kind:'SALE', pcs: (1 + rnd(4)) * 12 });
        }
        if (rnd(6) === 0) items.push({ product_id:P[skus[rnd(skus.length)]], kind:'REPLACE', pcs: 6 });
        if (!items.length) continue;
        try{
          createBill({ prefix: sampleBillPrefix || 'HMS',
            customer_code:code, customer_name:shop[1], customer_addr:shop[2],
            van:r.van, booker:r.booker, delivery_man:r.dm, class: rnd(2)?'A':'B',
            bill_date:date, manual_trade_offer: rnd(5)===0 ? 100 : 0,
            discount: rnd(9)===0 ? 50 : 0, items });
        }catch(e){ /* duplicate shop/van/day or short stock — skip that one */ }
      }
    }
  }

  // load forms: yesterday's closed with returns, today's still open
  for (const [back, close] of [[1,true],[0,false]]){
    const date = D(back);
    for (const r of routes.slice(0,2)){
      const ids = getAllBills({ date_from:date, date_to:date }).filter(b=>b.van===r.van).map(b=>b.id);
      if (!ids.length) continue;
      const lf = generateLoadForm({ prefix: sampleLoadPrefix || 'HL', van:r.van, bill_ids:ids });
      if (close){
        const lines = getLoadForm(lf.id).lines;
        for (const l of lines.slice(0,2))
          updateLoadFormLine({ id:l.id, load2_pcs:0, rtg_pcs:12, dented_pcs:0, leak_pcs:0, replace_pcs:0, scheme_note:'' });
        setLoadFormStatus(lf.id, 'CLOSED');
      }
    }
  }

  // a couple of tax invoices
  for (const b of getAllBills({}).slice(0,2)) createTaxInvoice(b.id);

  // a few shops send goods back — first line sellable, second one damaged.
  // created_at ties on a busy day, so pick by id and always get the same demo bills
  for (const b of getAllBills({}).filter(x=>x.van).sort((x,y)=>y.id-x.id).slice(0,10)){
    if (rnd(3) !== 0) continue;
    const src = getBillForReturn(b.id);
    const lines = src.items.filter(it=>it.remaining_pcs > 0).slice(0,2).map((it,ix)=>({
      bill_item_id:it.bill_item_id, product_id:it.product_id, kind: ix===1 ? 'DAMAGED' : 'GOOD',
      pcs: Math.min(it.remaining_pcs, 6), unit_price: it.unit_price }));
    if (!lines.length) continue;
    try{
      createSalesReturn({ prefix: sampleReturnPrefix || 'RET', return_date:src.bill_date,
        bill_id:src.id, bill_number:src.bill_number, customer_code:src.customer_code,
        customer_name:src.customer_name, customer_addr:src.customer_addr,
        van:src.van, booker:src.booker, delivery_man:src.delivery_man,
        tax_pct:src.tax_pct, notes:'Shop return', items:lines });
    }catch(e){ /* nothing left to return on that bill — skip it */ }
  }
  return { success:true, ...getDataStats() };
}
let sampleBillPrefix = null, sampleLoadPrefix = null, sampleReturnPrefix = null;
function setSamplePrefixes(bill, load, ret){ sampleBillPrefix = bill; sampleLoadPrefix = load; sampleReturnPrefix = ret; }

// ── Data maintenance: reset / backup helpers ────────────────────
// scope 'transactions' = clear day-to-day records, keep the catalogue (products, shops, schemes, settings)
// scope 'everything'   = wipe it all and start as if freshly installed
function resetData(opts){
  const scope = (opts && opts.scope) || 'transactions';
  const alsoZeroStock = !!(opts && opts.zero_stock);
  // children before parents, or the foreign keys refuse the delete
  const txTables = ['load_form_lines','load_form_bills','load_forms','tax_invoices',
                    'sales_return_items','sales_returns',
                    'bill_items','bills','purchase_items','purchases','closed_days'];
  const tx = db.transaction(() => {
    for (const t of txTables) db.prepare(`DELETE FROM ${t}`).run();
    if (scope === 'everything') {
      for (const t of ['schemes','customers','route_masters','products']) db.prepare(`DELETE FROM ${t}`).run();
      db.prepare("DELETE FROM settings WHERE key NOT IN ('theme','font','fs')").run();
    } else if (alsoZeroStock) {
      db.prepare('UPDATE products SET stock_qty = 0').run();
    }
    // restart the numbering
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('bills','bill_items','load_forms','load_form_lines','purchases','purchase_items','sales_returns','sales_return_items','tax_invoices','products','customers','schemes','route_masters')").run();
  });
  tx();
  db.pragma('wal_checkpoint(TRUNCATE)');
  return { success:true, scope };
}
function checkpoint(){ try{ db.pragma('wal_checkpoint(TRUNCATE)'); }catch(e){} return {success:true}; }
function closeDb(){ try{ db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); }catch(e){} return {success:true}; }
function getDataStats(){
  const c=(t)=>{ try{ return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; }catch(e){ return 0; } };
  return { bills:c('bills'), load_forms:c('load_forms'), purchases:c('purchases'), returns:c('sales_returns'),
           products:c('products'), customers:c('customers'), schemes:c('schemes') };
}

// ── helpers ─────────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _pct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

// ── Products ────────────────────────────────────────────────────
function getAllProducts() {
  return db.prepare(`SELECT * FROM products WHERE active=1
    ORDER BY (sku_code GLOB '*[^0-9]*'), CAST(sku_code AS INTEGER), sku_code`).all();
}
function addProduct(p) {
  const info = db.prepare(
    `INSERT INTO products (sku_code, name, unit, pcs_per_dozen, price, cost, stock_qty, min_stock, grp)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(p.sku_code, p.name, p.unit || 'pcs', p.pcs_per_dozen || 12,
        p.price || 0, p.cost || 0, p.stock_qty || 0, p.min_stock || 0, (p.grp || '').trim());
  return { id: info.lastInsertRowid };
}
function updateProduct(p) {
  db.prepare(
    `UPDATE products SET sku_code=?, name=?, unit=?, pcs_per_dozen=?, price=?, cost=?, min_stock=?, grp=?,
       updated_at=datetime('now','localtime') WHERE id=?`
  ).run(p.sku_code, p.name, p.unit, p.pcs_per_dozen || 12, p.price, p.cost || 0, p.min_stock, (p.grp || '').trim(), p.id);
  return { success: true };
}
function deleteProduct(id) {
  const billed = db.prepare('SELECT COUNT(*) c FROM bill_items WHERE product_id=?').get(id).c
               + db.prepare('SELECT COUNT(*) c FROM sales_return_items WHERE product_id=?').get(id).c;
  if (billed > 0) { // keep history: soft-delete
    db.prepare('UPDATE products SET active=0 WHERE id=?').run(id);
    return { success: true, archived: true };
  }
  db.prepare('DELETE FROM products WHERE id=?').run(id);
  return { success: true };
}
function stockIn(data) {
  db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(data.pcs, data.product_id);
  return { success: true };
}

// ── Schemes ─────────────────────────────────────────────────────
function getAllSchemes() {
  return db.prepare(`
    SELECT s.*, p.name AS product_name, p.sku_code
    FROM schemes s LEFT JOIN products p ON p.id = s.product_id
    ORDER BY s.active DESC, s.id DESC`).all();
}
function addScheme(s) {
  const info = db.prepare(
    `INSERT INTO schemes (name, type, product_id, grp, buy_pcs, free_pcs, offer_amount, offer_pct, min_bill, scheme_date, active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(s.name, s.type, s.product_id || null, (s.grp || '').trim(), s.buy_pcs || 0, s.free_pcs || 0,
        s.offer_amount || 0, _pct(s.offer_pct), s.min_bill || 0, s.scheme_date || null, s.active === 0 ? 0 : 1);
  return { id: info.lastInsertRowid };
}
function updateScheme(s) {
  db.prepare(
    `UPDATE schemes SET name=?, type=?, product_id=?, grp=?, buy_pcs=?, free_pcs=?, offer_amount=?, offer_pct=?,
       min_bill=?, scheme_date=?, active=? WHERE id=?`
  ).run(s.name, s.type, s.product_id || null, (s.grp || '').trim(), s.buy_pcs || 0, s.free_pcs || 0,
        s.offer_amount || 0, _pct(s.offer_pct), s.min_bill || 0, s.scheme_date || null, s.active ? 1 : 0, s.id);
  return { success: true };
}
function deleteScheme(id) {
  db.prepare('DELETE FROM schemes WHERE id=?').run(id);
  return { success: true };
}

// ── Billing ─────────────────────────────────────────────────────
function generateBillNumber(prefix, ymd) {
  const dateStr = ymd ? String(ymd).replace(/-/g, '') : _localYMD(new Date()).replace(/-/g, '');
  const stem = `${prefix || 'INV'}-${dateStr}-`;
  let n = 0;
  for (const r of db.prepare('SELECT bill_number FROM bills WHERE bill_number LIKE ?').all(stem + '%'))
    n = Math.max(n, parseInt(r.bill_number.slice(stem.length), 10) || 0);
  return `${stem}${String(n + 1).padStart(3, '0')}`;
}

/**
 * bill = {
 *   prefix, bill_date, customer_code, customer_name, customer_addr, van, booker, class,
 *   tax_pct, discount, manual_trade_offer, notes,
 *   items: [{ product_id, kind:'SALE'|'REPLACE'|'FREE', pcs, unit_price?, note? }]
 * }
 * FREE_GOODS schemes auto-append FREE lines; TRADE_OFFER schemes auto-add to trade_offer.
 */
// Pure computation: expand lines, apply schemes, compute totals. No DB writes.
function _composeBill(bill) {
  const items = [];
  for (const it of (bill.items || [])) {
    const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
    if (!prod) throw new Error(`Product not found: ${it.product_id}`);
    const kind = it.kind || 'SALE';
    const price = kind === 'SALE' ? (it.unit_price != null ? it.unit_price : prod.price) : 0;
    const lineTotal = round2(kind === 'SALE' ? price * (Number(it.pcs) || 0) : 0);
    const pctL = kind === 'SALE' ? _pct(it.trade_offer_pct) : 0;   // rupees typed on old bills still honoured
    items.push({
      product_id: prod.id, sku_code: prod.sku_code, product_name: prod.name, grp: prod.grp || '',
      kind, pcs: Number(it.pcs) || 0, pcs_per_dozen: prod.pcs_per_dozen || 12,
      unit_price: price, cost: prod.cost || 0,
      line_total: lineTotal,
      trade_offer: kind === 'SALE' ? (pctL > 0 ? round2(lineTotal * pctL / 100) : round2(Number(it.trade_offer) || 0)) : 0,
      trade_offer_pct: pctL,
      scheme_id: null, note: it.note || '',
    });
  }
  const freeLines = [], mkFree = (from, freePcs, sch) => ({
    product_id: from.product_id, sku_code: from.sku_code, product_name: from.product_name, grp: from.grp || '',
    kind: 'FREE', pcs: freePcs, pcs_per_dozen: from.pcs_per_dozen,
    unit_price: 0, cost: from.cost || 0, line_total: 0, trade_offer: 0, trade_offer_pct: 0, scheme_id: sch.id, note: sch.name,
  });
  const coveredByGroup = new Set();   // products handled by a FIRED group scheme don't also fire a per-product one
  if (!bill.scheme_off) {
    const saleLines = items.filter(l => l.kind === 'SALE');
    // group schemes: count every flavour in the group together; the free piece comes off the flavour bought most.
    // one scheme per group — the best free/buy ratio among those the quantity actually qualifies for.
    const groupSchemes = db.prepare(
      `SELECT * FROM schemes WHERE active=1 AND type='FREE_GOODS' AND TRIM(COALESCE(grp,''))<>'' AND buy_pcs>0`).all();
    const byGrp = {};
    for (const s of groupSchemes) (byGrp[s.grp] = byGrp[s.grp] || []).push(s);
    for (const grp of Object.keys(byGrp)) {
      const inGroup = saleLines.filter(l => (l.grp || '') === grp);
      if (!inGroup.length) continue;
      const total = inGroup.reduce((s, l) => s + l.pcs, 0);
      const sch = byGrp[grp].filter(s => s.buy_pcs <= total)
        .sort((a, b) => (b.free_pcs / b.buy_pcs) - (a.free_pcs / a.buy_pcs))[0];
      if (!sch) continue;
      const freePcs = Math.floor(total / sch.buy_pcs) * sch.free_pcs;
      if (freePcs > 0) {
        for (const l of inGroup) coveredByGroup.add(l.product_id);   // only cover when the group actually grants a free piece
        const top = inGroup.reduce((a, b) => (b.pcs > a.pcs ? b : a));   // most-bought flavour on this bill
        freeLines.push(mkFree(top, freePcs, sch));
      }
    }
    // per-product schemes: unchanged, but skip products a group scheme already covered
    for (const line of saleLines) {
      if (coveredByGroup.has(line.product_id)) continue;
      const sch = db.prepare(
        `SELECT * FROM schemes WHERE active=1 AND type='FREE_GOODS' AND product_id=? AND TRIM(COALESCE(grp,''))=''
           AND buy_pcs>0 AND buy_pcs<=? ORDER BY (free_pcs*1.0/buy_pcs) DESC LIMIT 1`).get(line.product_id, line.pcs);
      if (sch && line.pcs >= sch.buy_pcs) {
        const freePcs = Math.floor(line.pcs / sch.buy_pcs) * sch.free_pcs;
        if (freePcs > 0) freeLines.push(mkFree(line, freePcs, sch));
      }
    }
  }
  items.push(...freeLines);
  const subtotal = round2(items.filter(l => l.kind === 'SALE').reduce((s, l) => s + l.line_total, 0));
  const pctM = _pct(bill.manual_trade_offer_pct);
  const manualTO = pctM > 0 ? round2(subtotal * pctM / 100) : (Number(bill.manual_trade_offer) || 0);
  let tradeOffer = manualTO;
  tradeOffer += items.reduce((s, l) => s + (l.trade_offer || 0), 0);   // per-line trade offers
  const appliedTradeSchemes = [];
  if (!bill.scheme_off) for (const sch of db.prepare(`SELECT * FROM schemes WHERE active=1 AND type='TRADE_OFFER'`).all()) {
    if (subtotal < (sch.min_bill || 0)) continue;
    const pct = _pct(sch.offer_pct);
    if (pct > 0) { tradeOffer += round2(subtotal * pct / 100); appliedTradeSchemes.push(`${sch.name} (${pct}%)`); }
    else if (sch.offer_amount > 0) { tradeOffer += sch.offer_amount; appliedTradeSchemes.push(sch.name); }
  }
  tradeOffer = round2(tradeOffer);
  const taxPct = Number(bill.tax_pct) || 0;
  const taxAmount = round2(subtotal * (taxPct / 100));
  const discount = Number(bill.discount) || 0;
  const total = round2(subtotal + taxAmount - tradeOffer - discount);
  const notes = [bill.notes, appliedTradeSchemes.length ? `Scheme: ${appliedTradeSchemes.join(', ')}` : '']
    .filter(Boolean).join(' | ');
  return { items, subtotal, tradeOffer, manualTO, manualPct: pctM, taxPct, taxAmount, discount, total, notes };
}

const _BILL_ITEM_COLS = `INSERT INTO bill_items (bill_id, product_id, sku_code, product_name, kind, pcs,
   pcs_per_dozen, unit_price, cost, line_total, trade_offer, trade_offer_pct, scheme_id, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

function createBill(bill) {
  // a new bill never lands on a locked day: it rolls forward to the next open one
  const billDate = _nextOpenDay(bill.bill_date || getCurrentDay());
  const billNumber = generateBillNumber(bill.prefix, billDate);
  const tx = db.transaction(() => {
    if (!String(bill.van || '').trim()) throw new Error('Choose a van before saving the bill.');
    if (bill.customer_code && bill.van) {
      const dup = db.prepare("SELECT bill_number FROM bills WHERE customer_code=? AND van=? AND date(bill_date)=?")
        .get(String(bill.customer_code).trim(), bill.van, billDate);
      if (dup) throw new Error(`Shop ${bill.customer_code} is already billed on ${bill.van} for ${billDate} (${dup.bill_number}). Same van, same day is not allowed.`);
    }
    const c = _composeBill(bill);
    const billInfo = db.prepare(
      `INSERT INTO bills (bill_number, bill_date, customer_code, customer_name, customer_addr,
         van, booker, delivery_man, class, subtotal, trade_offer, manual_trade_offer, manual_trade_offer_pct, tax_pct, tax_amount, discount, scheme_off, total, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(billNumber, billDate, bill.customer_code || '', bill.customer_name || '', bill.customer_addr || '',
      bill.van || '', bill.booker || '', bill.delivery_man || '', bill.class || '',
      c.subtotal, c.tradeOffer, c.manualTO, c.manualPct, c.taxPct, c.taxAmount, c.discount, bill.scheme_off ? 1 : 0, c.total, c.notes);
    try { _touchCustomerFromBill(bill); } catch (e) {}
    _rememberMasters(bill);
    if (String(bill.van || '').trim()) setVanCrew(bill.van, bill.booker, bill.delivery_man);
    const billId = billInfo.lastInsertRowid;
    const insItem = db.prepare(_BILL_ITEM_COLS);
    for (const l of c.items) {
      const prod = db.prepare('SELECT stock_qty, name FROM products WHERE id=?').get(l.product_id);
      if (prod.stock_qty < l.pcs) throw new Error(`Insufficient stock for ${prod.name} (need ${l.pcs}, have ${prod.stock_qty})`);
      insItem.run(billId, l.product_id, l.sku_code, l.product_name, l.kind, l.pcs, l.pcs_per_dozen, l.unit_price, l.cost, l.line_total, l.trade_offer||0, l.trade_offer_pct||0, l.scheme_id, l.note);
      db.prepare(`UPDATE products SET stock_qty = stock_qty - ?, updated_at=datetime('now','localtime') WHERE id=?`).run(l.pcs, l.product_id);
    }
    return { id: billId, bill_number: billNumber, bill_date: billDate, subtotal: c.subtotal, trade_offer: c.tradeOffer, total: c.total };
  });
  return tx();
}

function updateBill(id, bill) {
  const tx = db.transaction(() => {
    const old = db.prepare('SELECT * FROM bills WHERE id=?').get(id);
    if (!old) throw new Error('Bill not found');
    const billDate = bill.bill_date || old.bill_date;
    if (isDayClosed(billDate)) throw new Error(`Date ${billDate} is closed. Re-open it to edit bills.`);
    if (!String(bill.van || '').trim()) throw new Error('Choose a van before saving the bill.');
    // the lines are rebuilt from scratch here, which would strand the returns booked against them
    const rets = getReturnsForBill(id);
    if (rets.length) throw new Error(_returnsBlockMsg(old.bill_number, rets));
    if (bill.customer_code && bill.van) {
      const dup = db.prepare("SELECT bill_number FROM bills WHERE customer_code=? AND van=? AND date(bill_date)=? AND id<>?")
        .get(String(bill.customer_code).trim(), bill.van, billDate, id);
      if (dup) throw new Error(`Shop ${bill.customer_code} is already billed on ${bill.van} for ${billDate} (${dup.bill_number}).`);
    }
    // restore stock from the old items, then remove them
    for (const l of db.prepare('SELECT product_id, pcs FROM bill_items WHERE bill_id=?').all(id))
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id=?').run(l.pcs, l.product_id);
    db.prepare('DELETE FROM bill_items WHERE bill_id=?').run(id);
    const c = _composeBill(bill);
    db.prepare(`UPDATE bills SET bill_date=?, customer_code=?, customer_name=?, customer_addr=?, van=?, booker=?,
        delivery_man=?, class=?, subtotal=?, trade_offer=?, manual_trade_offer=?, manual_trade_offer_pct=?, tax_pct=?, tax_amount=?, discount=?, scheme_off=?, total=?, notes=?
        WHERE id=?`)
      .run(billDate, bill.customer_code || '', bill.customer_name || '', bill.customer_addr || '',
        bill.van || '', bill.booker || '', bill.delivery_man || '', bill.class || '',
        c.subtotal, c.tradeOffer, c.manualTO, c.manualPct, c.taxPct, c.taxAmount, c.discount, bill.scheme_off ? 1 : 0, c.total, c.notes, id);
    try { _touchCustomerFromBill(bill); } catch (e) {}
    _rememberMasters(bill);
    if (String(bill.van || '').trim()) setVanCrew(bill.van, bill.booker, bill.delivery_man);
    const insItem = db.prepare(_BILL_ITEM_COLS);
    for (const l of c.items) {
      const prod = db.prepare('SELECT stock_qty, name FROM products WHERE id=?').get(l.product_id);
      if (prod.stock_qty < l.pcs) throw new Error(`Insufficient stock for ${prod.name} (need ${l.pcs}, have ${prod.stock_qty})`);
      insItem.run(id, l.product_id, l.sku_code, l.product_name, l.kind, l.pcs, l.pcs_per_dozen, l.unit_price, l.cost, l.line_total, l.trade_offer||0, l.trade_offer_pct||0, l.scheme_id, l.note);
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?').run(l.pcs, l.product_id);
    }
    return { id, bill_number: old.bill_number, subtotal: c.subtotal, trade_offer: c.tradeOffer, total: c.total };
  });
  return tx();
}

// ── Day open / close + the working day ──────────────────────────
// The "working day" is the date new bills / purchases / returns default to. It stays put
// across real calendar days and only advances when the owner closes the current working day.
function _localYMD(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function _addDays(ymd,n){ const d=new Date(ymd+'T00:00:00'); d.setDate(d.getDate()+n); return _localYMD(d); }
function _nextOpenDay(ymd){ let d=ymd; for(let i=0;i<400;i++){ if(!isDayClosed(d)) return d; d=_addDays(d,1); } return d; }
function _setCurrentDay(ymd){ db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('current_day',?)").run(ymd); }
function getCurrentDay(){
  let cur = (db.prepare("SELECT value FROM settings WHERE key='current_day'").get()||{}).value;
  if(!cur){ cur = _localYMD(new Date()); _setCurrentDay(cur); }
  if(isDayClosed(cur)){ cur = _nextOpenDay(cur); _setCurrentDay(cur); }
  return cur;
}
function isDayClosed(date){ return !!db.prepare('SELECT 1 FROM closed_days WHERE date=?').get(date); }
function closeDay(date){
  db.prepare("INSERT OR IGNORE INTO closed_days (date) VALUES (?)").run(date);
  if(date === getCurrentDay()) _setCurrentDay(_nextOpenDay(_addDays(date,1)));
  return { success:true, current_day: getCurrentDay() };
}
function openDay(date){
  db.prepare('DELETE FROM closed_days WHERE date=?').run(date);
  if(date < getCurrentDay()) _setCurrentDay(date);
  return { success:true, current_day: getCurrentDay() };
}
function listClosedDays(){ return db.prepare('SELECT * FROM closed_days ORDER BY date DESC LIMIT 200').all(); }

// ── Purchases (stock in) ────────────────────────────────────────
function generatePurchaseNumber(){
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const c = db.prepare("SELECT COUNT(*) c FROM purchases WHERE date(created_at)=date('now','localtime')").get().c;
  return `PUR-${dateStr}-${String(c+1).padStart(3,'0')}`;
}
function createPurchase(p){
  const number = generatePurchaseNumber();
  const pdate = _nextOpenDay(p.purchase_date || getCurrentDay());
  const tx = db.transaction(()=>{
    const items = (p.items||[]).filter(it=>it.product_id).map(it=>{
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if(!prod) throw new Error(`Product not found: ${it.product_id}`);
      const pcs = Number(it.pcs)||0;
      const unit_cost = it.unit_cost!=null ? Number(it.unit_cost) : (prod.cost||0);
      return { product_id:prod.id, sku_code:prod.sku_code, product_name:prod.name, pcs, unit_cost, line_total:round2(pcs*unit_cost) };
    });
    if(!items.length) throw new Error('Add at least one product');
    const total = round2(items.reduce((s,l)=>s+l.line_total,0));
    const info = db.prepare(`INSERT INTO purchases (purchase_number, purchase_date, vehicle_no, supplier, total, notes)
      VALUES (?,?,?,?,?,?)`).run(number, pdate, p.vehicle_no||'', p.supplier||'', total, p.notes||'');
    const pid = info.lastInsertRowid;
    const ins = db.prepare(`INSERT INTO purchase_items (purchase_id, product_id, sku_code, product_name, pcs, unit_cost, line_total)
      VALUES (?,?,?,?,?,?,?)`);
    for(const l of items){
      ins.run(pid, l.product_id, l.sku_code, l.product_name, l.pcs, l.unit_cost, l.line_total);
      db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, cost = CASE WHEN ?>0 THEN ? ELSE cost END,
        updated_at=datetime('now','localtime') WHERE id=?`).run(l.pcs, l.unit_cost, l.unit_cost, l.product_id);
    }
    return { id:pid, purchase_number:number, total, purchase_date:pdate };
  });
  return tx();
}
function getAllPurchases(){ return db.prepare('SELECT * FROM purchases ORDER BY created_at DESC LIMIT 200').all(); }
function getPurchaseById(id){ const p=db.prepare('SELECT * FROM purchases WHERE id=?').get(id); if(!p) return null;
  p.items=db.prepare('SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY id').all(id); return p; }
function deletePurchase(id){
  const tx=db.transaction(()=>{
    const p=db.prepare('SELECT purchase_date FROM purchases WHERE id=?').get(id);
    if(!p) throw new Error('Purchase not found');
    if(isDayClosed(p.purchase_date)) throw new Error(`Date ${p.purchase_date} is closed. Re-open it to delete purchases.`);
    for(const l of db.prepare('SELECT product_id, pcs FROM purchase_items WHERE purchase_id=?').all(id)){
      const prod=db.prepare('SELECT stock_qty, name FROM products WHERE id=?').get(l.product_id);
      if(prod && prod.stock_qty < l.pcs) throw new Error(`Cannot delete: ${prod.name} stock would go negative (have ${prod.stock_qty}, purchase added ${l.pcs})`);
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?').run(l.pcs, l.product_id);
    }
    db.prepare('DELETE FROM purchases WHERE id=?').run(id);
  }); tx(); return { success:true };
}

// ── Sales returns (goods back from a shop) ──────────────────────
// The mirror of a purchase: GOOD pieces go back into stock, DAMAGED ones are written off.
// Both credit the customer, so revenue and profit come down either way.
function generateReturnNumber(prefix) {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const stem = `${prefix || 'RET'}-${dateStr}-`;
  let n = 0;
  for (const r of db.prepare('SELECT return_number FROM sales_returns WHERE return_number LIKE ?').all(stem + '%'))
    n = Math.max(n, parseInt(r.return_number.slice(stem.length), 10) || 0);
  return `${stem}${String(n + 1).padStart(3, '0')}`;
}

// pcs already returned against each line of a bill
function _priorReturned(billId){
  const m = {};
  for (const r of db.prepare(`SELECT sri.bill_item_id id, COALESCE(SUM(sri.pcs),0) pcs
      FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id
      WHERE sr.bill_id=? AND sri.bill_item_id IS NOT NULL GROUP BY sri.bill_item_id`).all(billId)) m[r.id] = r.pcs;
  return m;
}

/**
 * r = { return_date, prefix, bill_id?, bill_number?, customer_code, customer_name, customer_addr,
 *       van, booker, delivery_man, tax_pct, notes,
 *       items: [{ bill_item_id?, product_id, kind:'GOOD'|'DAMAGED', pcs, unit_price }] }
 */
function createSalesReturn(r){
  const number = generateReturnNumber(r.prefix);
  // a new return never lands on a locked day: it rolls forward to the next open one
  const rdate = _nextOpenDay(r.return_date || getCurrentDay());
  const tx = db.transaction(()=>{
    const billId = r.bill_id || null;
    const bill = billId ? db.prepare('SELECT * FROM bills WHERE id=?').get(billId) : null;
    if(billId && !bill) throw new Error('Bill not found');
    const billItems = {};
    if(billId) for(const bi of db.prepare('SELECT * FROM bill_items WHERE bill_id=?').all(billId)) billItems[bi.id] = bi;
    const items = [];
    for(const it of (r.items||[])){
      const pcs = Number(it.pcs)||0;
      if(pcs <= 0) continue;
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if(!prod) throw new Error(`Product not found: ${it.product_id}`);
      const bi = it.bill_item_id ? billItems[it.bill_item_id] : null;
      // price the credit off the bill, and reverse exactly the cost the sale booked
      let unit_price = it.unit_price != null ? Number(it.unit_price) : (bi ? bi.unit_price : (prod.price||0));
      if(!(unit_price >= 0)) unit_price = 0;                                  // a credit can never add to sales
      if(bi && unit_price > (bi.unit_price||0)) unit_price = bi.unit_price||0; // nor exceed what the shop was charged
      const cost = bi ? (bi.cost||0) : (prod.cost||0);
      items.push({ bill_item_id: it.bill_item_id||null, product_id:prod.id, sku_code:prod.sku_code, product_name:prod.name,
        kind: it.kind === 'DAMAGED' ? 'DAMAGED' : 'GOOD', pcs, pcs_per_dozen: prod.pcs_per_dozen||12,
        unit_price, cost, line_total: round2(pcs*unit_price) });
    }
    if(!items.length) throw new Error('Add at least one returned item');
    if(billId){
      const prior = _priorReturned(billId);
      const want = {};   // several lines may point at one bill line — they add up against it
      for(const l of items){
        const bl = l.bill_item_id ? billItems[l.bill_item_id] : null;
        if(!bl || bl.product_id !== l.product_id)
          throw new Error(`${l.product_name} is not on bill ${bill.bill_number}. Pick the bill line these pieces came off.`);
        want[l.bill_item_id] = (want[l.bill_item_id]||0) + l.pcs;
      }
      for(const key of Object.keys(want)){
        const bi = billItems[key];
        const left = Math.max(0, round2((bi.pcs||0) - (prior[key]||0)));
        if(round2(want[key]) > left) throw new Error(`Cannot return ${round2(want[key])} pcs of ${bi.product_name} — only ${left} left on bill ${bill.bill_number}`);
      }
    }
    const subtotal = round2(items.reduce((s,l)=>s+l.line_total,0));
    const taxPct = Number(r.tax_pct)||0;
    const taxAmount = round2(subtotal*taxPct/100);
    // the credit note mirrors the bill: give back the same share of its trade offer and discount
    const ratio = bill && bill.subtotal > 0 ? Math.min(1, Math.max(0, subtotal / bill.subtotal)) : 0;
    const tradeOffer = round2((bill ? bill.trade_offer||0 : 0) * ratio);
    const discount = round2((bill ? bill.discount||0 : 0) * ratio);
    const total = round2(subtotal+taxAmount-tradeOffer-discount);
    const restock = items.filter(l=>l.kind==='GOOD').reduce((s,l)=>s+l.pcs,0);
    const damaged = items.filter(l=>l.kind==='DAMAGED').reduce((s,l)=>s+l.pcs,0);
    const info = db.prepare(
      `INSERT INTO sales_returns (return_number, return_date, bill_id, bill_number, customer_code, customer_name,
         customer_addr, van, booker, delivery_man, subtotal, tax_pct, tax_amount, trade_offer, discount, total, restock_pcs, damaged_pcs, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(number, rdate, billId, bill ? bill.bill_number : (r.bill_number||''), r.customer_code||'', r.customer_name||'',
      r.customer_addr||'', r.van||'', r.booker||'', r.delivery_man||'',
      subtotal, taxPct, taxAmount, tradeOffer, discount, total, restock, damaged, r.notes||'');
    const rid = info.lastInsertRowid;
    _rememberMasters(r);
    const ins = db.prepare(`INSERT INTO sales_return_items (return_id, bill_item_id, product_id, sku_code, product_name,
       kind, pcs, pcs_per_dozen, unit_price, cost, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    for(const l of items){
      ins.run(rid, l.bill_item_id, l.product_id, l.sku_code, l.product_name, l.kind, l.pcs, l.pcs_per_dozen,
        l.unit_price, l.cost, l.line_total);
      if(l.kind === 'GOOD')
        db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, updated_at=datetime('now','localtime') WHERE id=?`).run(l.pcs, l.product_id);
    }
    return { id:rid, return_number:number, total, restocked:restock, return_date:rdate };
  });
  return tx();
}

function _returnFilter(filters = {}) {
  const params = [], clauses = [];
  if (filters.date_from) { clauses.push('return_date >= ?'); params.push(filters.date_from); }
  if (filters.date_to)   { clauses.push('return_date <= ?'); params.push(filters.date_to); }
  if (filters.van)       { clauses.push('van = ?'); params.push(filters.van); }
  if (filters.search)    { clauses.push('(return_number LIKE ? OR bill_number LIKE ? OR customer_name LIKE ? OR customer_code LIKE ?)');
                           const s = `%${filters.search}%`; params.push(s, s, s, s); }
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}
function getAllSalesReturns(filters = {}) {
  const f = _returnFilter(filters);
  return db.prepare(`SELECT * FROM sales_returns${f.where} ORDER BY created_at DESC, id DESC LIMIT 300`).all(...f.params);
}
function getSalesReturnById(id){
  const r = db.prepare('SELECT * FROM sales_returns WHERE id=?').get(id);
  if(!r) return null;
  r.items = db.prepare('SELECT * FROM sales_return_items WHERE return_id=? ORDER BY id').all(id);
  return r;
}
function deleteSalesReturn(id){
  const tx = db.transaction(()=>{
    const r = db.prepare('SELECT return_date FROM sales_returns WHERE id=?').get(id);
    if(!r) throw new Error('Return not found');
    if(isDayClosed(r.return_date)) throw new Error(`Date ${r.return_date} is closed. Re-open it to delete returns.`);
    for(const l of db.prepare("SELECT product_id, pcs FROM sales_return_items WHERE return_id=? AND kind='GOOD'").all(id)){
      const prod = db.prepare('SELECT stock_qty, name FROM products WHERE id=?').get(l.product_id);
      if(prod && prod.stock_qty < l.pcs) throw new Error(`Cannot delete: ${prod.name} stock would go negative (have ${prod.stock_qty}, return added ${l.pcs}). Put ${round2(l.pcs - prod.stock_qty)} pcs back in with a purchase or a stock-in first, then delete this return.`);
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?').run(l.pcs, l.product_id);
    }
    db.prepare('DELETE FROM sales_returns WHERE id=?').run(id); // cascade removes items
  }); tx(); return { success:true };
}

// ref = bill id or bill number. FREE / REPLACE pieces are still stock that can come back,
// they just credit nothing because their unit price is 0.
function getBillForReturn(ref){
  const key = typeof ref === 'number' ? ref : String(ref == null ? '' : ref).trim();
  let bill = typeof key === 'number' ? db.prepare('SELECT * FROM bills WHERE id=?').get(key)
                                     : db.prepare('SELECT * FROM bills WHERE bill_number=?').get(key);
  if(!bill && typeof key === 'string' && /^\d+$/.test(key)) bill = db.prepare('SELECT * FROM bills WHERE id=?').get(Number(key));
  if(!bill) return null;
  const prior = _priorReturned(bill.id);
  const items = db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id').all(bill.id).map(bi=>{
    const returned = round2(prior[bi.id]||0);
    return { bill_item_id:bi.id, product_id:bi.product_id, sku_code:bi.sku_code, product_name:bi.product_name,
      kind:bi.kind, pcs:bi.pcs, returned_pcs:returned, remaining_pcs: Math.max(0, round2(bi.pcs - returned)),
      unit_price:bi.unit_price, cost:bi.cost, pcs_per_dozen:bi.pcs_per_dozen||12 };
  });
  return { id:bill.id, bill_number:bill.bill_number, bill_date:bill.bill_date, customer_code:bill.customer_code,
    customer_name:bill.customer_name, customer_addr:bill.customer_addr, van:bill.van, booker:bill.booker,
    delivery_man:bill.delivery_man, tax_pct:bill.tax_pct, items };
}
function getReturnsForBill(billId){
  return db.prepare(`SELECT sr.id, sr.return_number, sr.return_date, sr.total,
      COALESCE((SELECT SUM(pcs) FROM sales_return_items WHERE return_id=sr.id),0) pcs
    FROM sales_returns sr WHERE sr.bill_id=? ORDER BY sr.return_date DESC, sr.id DESC`).all(billId);
}
// name the returns that stand in the way, so the user knows which ones to go and clear
function _returnsBlockMsg(billNumber, rets){
  return `Bill ${billNumber} has ${rets.length} return(s) against it (${rets.map(x=>`${x.return_number} on ${x.return_date}`).join(', ')}). Delete those returns first.`;
}

// ── Sales Tax Invoice numbering ─────────────────────────────────
function createTaxInvoice(billId){
  const ex = db.prepare('SELECT * FROM tax_invoices WHERE bill_id=?').get(billId);
  if(ex) return ex;
  const n = (db.prepare('SELECT COALESCE(MAX(invoice_no),0) m FROM tax_invoices').get().m)+1;
  db.prepare("INSERT INTO tax_invoices (bill_id, invoice_no) VALUES (?,?)").run(billId, n);
  return db.prepare('SELECT * FROM tax_invoices WHERE bill_id=?').get(billId);
}
function getTaxInvoice(billId){ return db.prepare('SELECT * FROM tax_invoices WHERE bill_id=?').get(billId) || null; }

// ── Van return: returned-good pieces (RTG) go back to stock ──────
// Reconciles against what was already credited, so re-closing a corrected form
// only moves the difference and never double-credits.
function processLoadReturn(id){
  const lf = db.prepare('SELECT * FROM load_forms WHERE id=?').get(id);
  if(!lf) throw new Error('Load form not found');
  const tx=db.transaction(()=>{
    let moved=0;
    for(const line of db.prepare('SELECT id, product_id, rtg_pcs, returned_pcs FROM load_form_lines WHERE load_form_id=?').all(id)){
      const delta=(line.rtg_pcs||0)-(line.returned_pcs||0);
      if(delta===0) continue;
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id=?').run(delta, line.product_id);
      db.prepare('UPDATE load_form_lines SET returned_pcs=? WHERE id=?').run(line.rtg_pcs||0, line.id);
      moved+=delta;
    }
    db.prepare('UPDATE load_forms SET returned=1 WHERE id=?').run(id);
    return moved;
  });
  const restocked=tx();
  if(restocked===0 && lf.returned) return { success:true, already:true };
  return { success:true, restocked };
}

// ── Bill summary (per van / day) ────────────────────────────────
function getBillSummary(filters){
  // the summary totals every matching bill, not just the page the list screen shows
  const f = _billFilter(filters||{});
  const bills = db.prepare(`SELECT * FROM bills${f.where} ORDER BY created_at DESC`).all(...f.params);
  let freeMap = new Map(), retMap = new Map();
  if (bills.length) {
    for (const r of db.prepare(`SELECT bi.bill_id id, COALESCE(SUM(bi.pcs*p.price),0) v
        FROM bill_items bi JOIN products p ON p.id=bi.product_id
        WHERE bi.kind='FREE' AND bi.bill_id IN (SELECT id FROM bills${f.where}) GROUP BY bi.bill_id`).all(...f.params))
      freeMap.set(r.id, r.v);
    for (const r of db.prepare(`SELECT bill_id id, COALESCE(SUM(total),0) v FROM sales_returns
        WHERE bill_id IN (SELECT id FROM bills${f.where}) GROUP BY bill_id`).all(...f.params))
      retMap.set(r.id, r.v);
  }
  const rows = bills.map(b=>{
    return { bill_number:b.bill_number, bill_date:b.bill_date, customer_code:b.customer_code, customer_name:b.customer_name,
             van:b.van, free_amount:round2(freeMap.get(b.id)||0), trade_offer:round2(b.trade_offer||0), discount:round2(b.discount||0),
             returns:round2(retMap.get(b.id)||0), total:round2(b.total||0) };
  });
  const totals = rows.reduce((t,r)=>({free_amount:t.free_amount+r.free_amount, trade_offer:t.trade_offer+r.trade_offer, discount:t.discount+r.discount, returns:t.returns+r.returns, total:t.total+r.total}),{free_amount:0,trade_offer:0,discount:0,returns:0,total:0});
  Object.keys(totals).forEach(k=>totals[k]=round2(totals[k]));
  return { rows, totals };
}


function _billFilter(filters = {}) {
  const params = [], clauses = [];
  if (filters.date_from) { clauses.push("bill_date >= ?"); params.push(filters.date_from); }
  if (filters.date_to)   { clauses.push("bill_date <= ?"); params.push(filters.date_to); }
  if (filters.van)       { clauses.push("van = ?"); params.push(filters.van); }
  if (filters.booker)    { clauses.push("booker = ?"); params.push(filters.booker); }
  if (filters.delivery_man){ clauses.push("delivery_man = ?"); params.push(filters.delivery_man); }
  if (filters.search)    { clauses.push("(bill_number LIKE ? OR customer_name LIKE ? OR customer_code LIKE ?)");
                           params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}
function getAllBills(filters = {}) {
  const f = _billFilter(filters);
  return db.prepare(`SELECT * FROM bills${f.where} ORDER BY created_at DESC LIMIT 300`).all(...f.params);
}
function getBillById(id) {
  const bill = db.prepare('SELECT * FROM bills WHERE id=?').get(id);
  if (!bill) return null;
  bill.items = db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY id').all(id);
  return bill;
}
function deleteBill(id) {
  const tx = db.transaction(() => {
    const bill = db.prepare('SELECT bill_date, bill_number FROM bills WHERE id=?').get(id);
    if (!bill) throw new Error('Bill not found');
    if (isDayClosed(bill.bill_date)) throw new Error(`Date ${bill.bill_date} is closed. Re-open it to delete bills.`);
    const rets = getReturnsForBill(id);
    if (rets.length) throw new Error(_returnsBlockMsg(bill.bill_number, rets));
    // restore stock
    for (const l of db.prepare('SELECT product_id, pcs FROM bill_items WHERE bill_id=?').all(id)) {
      db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id=?').run(l.pcs, l.product_id);
    }
    db.prepare('DELETE FROM load_form_bills WHERE bill_id=?').run(id);
    db.prepare('DELETE FROM bills WHERE id=?').run(id); // cascade removes items
  });
  tx();
  return { success: true };
}


// ── Customers / Shops ───────────────────────────────────────────
function getCustomers(){ return db.prepare('SELECT * FROM customers ORDER BY code').all(); }
function findCustomer(code){ return db.prepare('SELECT * FROM customers WHERE code=?').get(code) || null; }
function upsertCustomer(c){
  if(!c || !c.code || !c.name) throw new Error('Shop code and name required');
  const keep = (col) => `CASE WHEN TRIM(COALESCE(excluded.${col},'')) <> '' THEN excluded.${col} ELSE customers.${col} END`;
  db.prepare(`INSERT INTO customers (code, name, address, phone, ntn, cnic) VALUES (?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      address = ${keep('address')}, phone = ${keep('phone')}, ntn = ${keep('ntn')}, cnic = ${keep('cnic')},
      updated_at = datetime('now','localtime')`)
    .run(String(c.code).trim(), String(c.name).trim(), (c.address||'').trim(),
         (c.phone||'').trim(), (c.ntn||'').trim(), (c.cnic||'').trim());
  return { success:true };
}
function addCustomer(c){
  if(!c || !c.code || !c.name) throw new Error('Shop code and name required');
  const code = String(c.code).trim();
  const existing = findCustomer(code);
  if(existing) throw new Error('Shop code "'+code+'" already belongs to "'+existing.name+'". Delete that shop first before adding a new one on this code.');
  db.prepare('INSERT INTO customers (code, name, address, phone, ntn, cnic) VALUES (?,?,?,?,?,?)')
    .run(code, String(c.name).trim(), (c.address||'').trim(),
         (c.phone||'').trim(), (c.ntn||'').trim(), (c.cnic||'').trim());
  return { success:true };
}
// A bill only ever creates a missing shop or fills a blank address — it never renames one.
function _touchCustomerFromBill(bill){
  if(!bill.customer_code || !bill.customer_name) return;
  const code = String(bill.customer_code).trim();
  const addr = (bill.customer_addr||'').trim();
  const ex = findCustomer(code);
  if(!ex) db.prepare('INSERT INTO customers (code, name, address) VALUES (?,?,?)').run(code, String(bill.customer_name).trim(), addr);
  else if(addr && !String(ex.address||'').trim())
    db.prepare(`UPDATE customers SET address=?, updated_at=datetime('now','localtime') WHERE id=?`).run(addr, ex.id);
}

// ── Route masters (saved vans / bookers / delivery men) ─────────
function listMasters(kind){ return db.prepare('SELECT * FROM route_masters WHERE kind=? ORDER BY name').all(kind); }
function addMaster(kind, name){ if(!name) return {success:false};
  db.prepare('INSERT OR IGNORE INTO route_masters (kind,name) VALUES (?,?)').run(kind, String(name).trim()); return {success:true}; }
function deleteMaster(id){ db.prepare('DELETE FROM route_masters WHERE id=?').run(id); return {success:true}; }
// a van remembers its usual crew; auto-learned every time a bill is saved, still editable
function setVanCrew(van, booker, dm){
  const name = String(van||'').trim();
  if(!name) return { success:false };
  db.prepare("INSERT OR IGNORE INTO route_masters (kind,name) VALUES ('van',?)").run(name);
  db.prepare("UPDATE route_masters SET booker=?, dm=? WHERE kind='van' AND name=?")
    .run(String(booker||'').trim(), String(dm||'').trim(), name);
  return { success:true };
}
function _rememberMasters(b){
  try{
    if(b.van) addMaster('van', b.van);
    if(b.booker) addMaster('booker', b.booker);
    if(b.delivery_man) addMaster('dm', b.delivery_man);
  }catch(e){}
}
function deleteCustomer(id){ db.prepare('DELETE FROM customers WHERE id=?').run(id); return { success:true }; }

// full bills (with items) for a list of ids — used for batch printing
function getBillsMany(ids){
  if(!ids || !ids.length) return [];
  const ph = ids.map(()=>'?').join(',');
  const bills = db.prepare(`SELECT * FROM bills WHERE id IN (${ph}) ORDER BY van, booker, bill_number`).all(...ids);
  const items = db.prepare(`SELECT * FROM bill_items WHERE bill_id IN (${ph}) ORDER BY id`).all(...ids);
  const byBill = {}; for(const it of items){ (byBill[it.bill_id]=byBill[it.bill_id]||[]).push(it); }
  for(const b of bills) b.items = byBill[b.id] || [];
  return bills;
}

// ── Load Forms ──────────────────────────────────────────────────
function listBillsForLoad(filters = {}) {
  // bills not yet attached to any load form, matching filters
  let sql = `SELECT b.* FROM bills b
             WHERE b.id NOT IN (SELECT bill_id FROM load_form_bills)`;
  const params = [];
  if (filters.date_from) { sql += " AND b.bill_date >= ?"; params.push(filters.date_from); }
  if (filters.date_to)   { sql += " AND b.bill_date <= ?"; params.push(filters.date_to); }
  if (filters.van)       { sql += " AND b.van = ?"; params.push(filters.van); }
  if (filters.booker)    { sql += " AND b.booker = ?"; params.push(filters.booker); }
  sql += ' ORDER BY b.created_at DESC LIMIT 300';
  return db.prepare(sql).all(...params);
}

function generateLoadFormNumber(prefix) {
  const p = prefix || 'LF';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const c = db.prepare(`SELECT COUNT(*) c FROM load_forms WHERE date(created_at)=date('now','localtime')`).get().c;
  return `${p}-${dateStr}-${String(c + 1).padStart(3, '0')}`;
}

/**
 * data = { prefix, form_date, van, booker, notes, bill_ids: [] }
 * Aggregates the selected bills into per-product rows.
 */
function generateLoadForm(data) {
  const ids = data.bill_ids || [];
  if (!ids.length) throw new Error('Select at least one bill for the load form');
  const tx = db.transaction(() => {
    const placeholders = ids.map(() => '?').join(',');
    const bills = db.prepare(`SELECT * FROM bills WHERE id IN (${placeholders})`).all(...ids);
    const alreadyUsed = db.prepare(
      `SELECT bill_id FROM load_form_bills WHERE bill_id IN (${placeholders})`).all(...ids);
    if (alreadyUsed.length) throw new Error('One or more bills are already on another load form');

    const bookingAmount = round2(bills.reduce((s, b) => s + b.total, 0));
    const formNumber = generateLoadFormNumber(data.prefix);

    const lfInfo = db.prepare(
      `INSERT INTO load_forms (form_number, form_date, van, booker, booking_amount, bill_count, notes)
       VALUES (?,?,?,?,?,?,?)`
    ).run(formNumber, data.form_date || new Date().toISOString().slice(0, 10),
          data.van || '', data.booker || '', bookingAmount, bills.length, data.notes || '');
    const loadId = lfInfo.lastInsertRowid;

    const linkBill = db.prepare(`INSERT INTO load_form_bills (load_form_id, bill_id) VALUES (?,?)`);
    for (const b of bills) linkBill.run(loadId, b.id);

    // aggregate all items across the selected bills, per product, split by kind
    const agg = {}; // product_id -> row
    const rows = db.prepare(
      `SELECT bi.* FROM bill_items bi WHERE bi.bill_id IN (${placeholders})`).all(...ids);
    for (const r of rows) {
      if (!agg[r.product_id]) {
        agg[r.product_id] = {
          product_id: r.product_id, sku_code: r.sku_code, product_name: r.product_name,
          pcs_per_dozen: r.pcs_per_dozen || 12,
          pieces: 0, free_pcs: 0, replace_pcs: 0, schemes: new Set(),
        };
      }
      const a = agg[r.product_id];
      if (r.kind === 'SALE') a.pieces += r.pcs;
      else if (r.kind === 'FREE') { a.free_pcs += r.pcs; if (r.note) a.schemes.add(r.note); }
      else if (r.kind === 'REPLACE') a.replace_pcs += r.pcs;
    }

    const insLine = db.prepare(
      `INSERT INTO load_form_lines (load_form_id, product_id, sku_code, product_name, pcs_per_dozen,
         pieces, dozens, free_pcs, replace_pcs, scheme_note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const numeric = (c) => /^[0-9]+$/.test(String(c));   // all-digit codes sort first, in number order
    const sorted = Object.values(agg).sort((x, y) => {
      const nx = numeric(x.sku_code), ny = numeric(y.sku_code);
      if (nx && ny) return Number(x.sku_code) - Number(y.sku_code);
      if (nx !== ny) return nx ? -1 : 1;
      return String(x.sku_code).localeCompare(String(y.sku_code));
    });
    for (const a of sorted) {
      const dozens = a.pcs_per_dozen ? round2(a.pieces / a.pcs_per_dozen) : 0;
      insLine.run(loadId, a.product_id, a.sku_code, a.product_name, a.pcs_per_dozen,
                  a.pieces, dozens, a.free_pcs, a.replace_pcs, Array.from(a.schemes).join(', '));
    }
    return { id: loadId, form_number: formNumber };
  });
  return tx();
}

function getLoadForm(id) {
  const lf = db.prepare('SELECT * FROM load_forms WHERE id=?').get(id);
  if (!lf) return null;
  lf.lines = db.prepare(`SELECT * FROM load_form_lines WHERE load_form_id=?
    ORDER BY (sku_code GLOB '*[^0-9]*'), CAST(sku_code AS INTEGER), sku_code`).all(id);
  lf.bills = db.prepare(
    `SELECT b.* FROM bills b JOIN load_form_bills l ON l.bill_id=b.id
     WHERE l.load_form_id=? ORDER BY b.bill_number`).all(id);
  lf.totals = lf.lines.reduce((t, l) => ({
    dozens: round2(t.dozens + l.dozens), pieces: t.pieces + l.pieces,
    free_pcs: t.free_pcs + l.free_pcs, replace_pcs: t.replace_pcs + l.replace_pcs,
    load2_pcs: t.load2_pcs + l.load2_pcs, rtg_pcs: t.rtg_pcs + l.rtg_pcs,
    dented_pcs: t.dented_pcs + l.dented_pcs, leak_pcs: t.leak_pcs + l.leak_pcs,
  }), { dozens: 0, pieces: 0, free_pcs: 0, replace_pcs: 0, load2_pcs: 0, rtg_pcs: 0, dented_pcs: 0, leak_pcs: 0 });
  return lf;
}
function getAllLoadForms(filters = {}) {
  let sql = 'SELECT * FROM load_forms';
  const params = [], clauses = [];
  if (filters.date_from) { clauses.push("form_date >= ?"); params.push(filters.date_from); }
  if (filters.date_to)   { clauses.push("form_date <= ?"); params.push(filters.date_to); }
  if (filters.van)       { clauses.push("van = ?"); params.push(filters.van); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return db.prepare(sql).all(...params);
}
function updateLoadFormLine(line) {
  db.prepare(
    `UPDATE load_form_lines SET load2_pcs=?, rtg_pcs=?, dented_pcs=?, leak_pcs=?, replace_pcs=?, scheme_note=?
     WHERE id=?`
  ).run(line.load2_pcs || 0, line.rtg_pcs || 0, line.dented_pcs || 0, line.leak_pcs || 0,
        line.replace_pcs || 0, line.scheme_note || '', line.id);
  return { success: true };
}
function setLoadFormStatus(id, status) {
  // a failed restock must roll the status back with it, and reach the caller
  const tx = db.transaction(() => {
    db.prepare('UPDATE load_forms SET status=? WHERE id=?').run(status, id);
    return status === 'CLOSED' ? processLoadReturn(id) : null;
  });
  const r = tx();
  return { success: true, ...(r || {}) };
}
function deleteLoadForm(id) {
  const tx = db.transaction(() => {
    for (const l of db.prepare('SELECT product_id, returned_pcs FROM load_form_lines WHERE load_form_id=? AND returned_pcs>0').all(id)) {
      const prod = db.prepare('SELECT stock_qty, name FROM products WHERE id=?').get(l.product_id);
      if (prod && prod.stock_qty < l.returned_pcs) throw new Error(`Cannot delete: ${prod.name} stock would go negative (have ${prod.stock_qty}, form returned ${l.returned_pcs})`);
      db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id=?').run(l.returned_pcs, l.product_id);
    }
    db.prepare('DELETE FROM load_forms WHERE id=?').run(id); // cascade removes lines + bill links
  });
  tx();
  return { success: true };
}


// ── Profit / Loss ───────────────────────────────────────────────
function _startOfWeek(ds){ const x=new Date(ds+'T00:00:00'); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x.toISOString().slice(0,10); }
function _isoWeek(ds){
  const d=new Date(ds+'T00:00:00');
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-dayNum+3);
  const firstThu=new Date(Date.UTC(dt.getUTCFullYear(),0,4));
  const week=1+Math.round(((dt-firstThu)/86400000 - 3 + ((firstThu.getUTCDay()+6)%7))/7);
  return dt.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
}

// What schemes / offers cost in a date range. These amounts are ALREADY reflected in profit
// (trade offers & discounts reduce the billed total; free & replacement pieces are in COGS).
// This just makes them visible so the owner can see what the deals are costing.
function _schemeCost(from, to){
  const q = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN bi.kind='FREE'    THEN bi.cost*bi.pcs END),0) free_cost,
      COALESCE(SUM(CASE WHEN bi.kind='FREE'    THEN p.price*bi.pcs END),0) free_value,
      COALESCE(SUM(CASE WHEN bi.kind='FREE'    THEN bi.pcs END),0)         free_pcs,
      COALESCE(SUM(CASE WHEN bi.kind='REPLACE' THEN bi.cost*bi.pcs END),0) replace_cost,
      COALESCE(SUM(CASE WHEN bi.kind='REPLACE' THEN bi.pcs END),0)         replace_pcs
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN products p ON p.id=bi.product_id
    WHERE b.bill_date BETWEEN ? AND ?`).get(from,to);
  const o = db.prepare(`SELECT COALESCE(SUM(trade_offer),0) trade_offer, COALESCE(SUM(discount),0) discount
    FROM bills WHERE bill_date BETWEEN ? AND ?`).get(from,to);
  const free_cost=round2(q.free_cost), trade_offer=round2(o.trade_offer), discount=round2(o.discount);
  return {
    free_pcs:q.free_pcs, free_cost, free_value:round2(q.free_value),
    replace_pcs:q.replace_pcs, replace_cost:round2(q.replace_cost),
    trade_offer, discount,
    scheme_total: round2(free_cost + trade_offer + discount),
    total_given:  round2(free_cost + trade_offer + discount + round2(q.replace_cost)),
  };
}

// What came back in a range. Only GOOD pieces reverse COGS — damaged goods are lost, so they stay a cost.
function _rangeReturns(from, to){
  const r = db.prepare(`SELECT COALESCE(SUM(total),0) gross, COALESCE(SUM(total-tax_amount),0) net
    FROM sales_returns WHERE return_date BETWEEN ? AND ?`).get(from,to);
  const c = db.prepare(`SELECT COALESCE(SUM(sri.cost*sri.pcs),0) c
    FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id
    WHERE sri.kind='GOOD' AND sr.return_date BETWEEN ? AND ?`).get(from,to).c;
  return { returns:round2(r.gross), returns_net:round2(r.net), returns_cost:round2(c) };
}

// core profit for a date range: profit = (net sales, i.e. billed total minus tax) - cost of goods dispatched
function _rangeProfit(from, to){
  const bills = db.prepare('SELECT id,total,tax_amount FROM bills WHERE bill_date BETWEEN ? AND ?').all(from,to);
  const cogsRows = db.prepare(`SELECT bi.bill_id, SUM(bi.cost*bi.pcs) cogs
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
    WHERE b.bill_date BETWEEN ? AND ? GROUP BY bi.bill_id`).all(from,to);
  const cm={}; for(const r of cogsRows) cm[r.bill_id]=r.cogs||0;
  let sales=0, netrev=0, cost=0;
  for(const b of bills){ sales+=b.total; netrev+=(b.total-(b.tax_amount||0)); cost+=(cm[b.id]||0); }
  const rt=_rangeReturns(from,to);
  sales-=rt.returns; netrev-=rt.returns_net; cost-=rt.returns_cost;
  const profit=netrev-cost;
  return { sales:round2(sales), net_rev:round2(netrev), cost:round2(cost),
           profit:round2(profit), margin: netrev>0?round2(profit/netrev*100):0, bills:bills.length,
           returns:rt.returns, returns_net:rt.returns_net, returns_cost:rt.returns_cost,
           schemes:_schemeCost(from,to) };
}
function getProfitSummary(){
  const today=new Date().toISOString().slice(0,10);
  return {
    today: _rangeProfit(today, today),
    week:  _rangeProfit(_startOfWeek(today), today),
    month: _rangeProfit(today.slice(0,7)+'-01', today),
    year:  _rangeProfit(today.slice(0,4)+'-01-01', today),
  };
}
function getProfitReport(opts){
  opts = opts || {};
  const granularity = opts.granularity || 'monthly';
  const to   = opts.date_to   || new Date().toISOString().slice(0,10);
  const from = opts.date_from || (to.slice(0,4)+'-01-01');
  const bills = db.prepare('SELECT id,bill_date,total,tax_amount FROM bills WHERE bill_date BETWEEN ? AND ?').all(from,to);
  const cogsRows = db.prepare(`SELECT bi.bill_id, SUM(bi.cost*bi.pcs) cogs
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
    WHERE b.bill_date BETWEEN ? AND ? GROUP BY bi.bill_id`).all(from,to);
  const cm={}; for(const r of cogsRows) cm[r.bill_id]=r.cogs||0;
  const keyOf=(ds)=> granularity==='daily'? ds
                   : granularity==='weekly'? _isoWeek(ds)
                   : granularity==='yearly'? ds.slice(0,4)
                   : ds.slice(0,7);
  const rets = db.prepare('SELECT id,return_date,total,tax_amount FROM sales_returns WHERE return_date BETWEEN ? AND ?').all(from,to);
  const rcostRows = db.prepare(`SELECT sri.return_id, SUM(sri.cost*sri.pcs) cogs
    FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id
    WHERE sri.kind='GOOD' AND sr.return_date BETWEEN ? AND ? GROUP BY sri.return_id`).all(from,to);
  const rm={}; for(const r of rcostRows) rm[r.return_id]=r.cogs||0;
  const buckets={};
  const bucket=(k)=> buckets[k] || (buckets[k]={period:k, sales:0, net_rev:0, cost:0, bills:0, returns:0});
  for(const b of bills){
    const x=bucket(keyOf(b.bill_date));
    x.sales+=b.total; x.net_rev+=(b.total-(b.tax_amount||0)); x.cost+=(cm[b.id]||0); x.bills++;
  }
  for(const r of rets){
    const x=bucket(keyOf(r.return_date));
    x.returns+=r.total; x.sales-=r.total; x.net_rev-=(r.total-(r.tax_amount||0)); x.cost-=(rm[r.id]||0);
  }
  const rows=Object.values(buckets).sort((a,b)=> a.period<b.period?-1:1).map(r=>({
    period:r.period, sales:round2(r.sales), cost:round2(r.cost), returns:round2(r.returns),
    profit:round2(r.net_rev-r.cost), margin: r.net_rev>0?round2((r.net_rev-r.cost)/r.net_rev*100):0, bills:r.bills
  }));
  const totals=rows.reduce((t,r)=>({sales:t.sales+r.sales,cost:t.cost+r.cost,returns:t.returns+r.returns,profit:t.profit+r.profit,bills:t.bills+r.bills}),
    {sales:0,cost:0,returns:0,profit:0,bills:0});
  const netrevTotal=rows.reduce((a,r)=>a+ r.profit + r.cost,0); // = sum net_rev
  totals.margin = netrevTotal>0? round2(totals.profit/netrevTotal*100):0;
  totals.sales=round2(totals.sales); totals.cost=round2(totals.cost); totals.returns=round2(totals.returns); totals.profit=round2(totals.profit);
  totals.schemes = _schemeCost(from, to);
  const top=db.prepare(`SELECT bi.sku_code, bi.product_name,
      SUM(CASE WHEN bi.kind='SALE' THEN bi.unit_price*bi.pcs ELSE 0 END) revenue,
      SUM(bi.cost*bi.pcs) cost
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
    WHERE b.bill_date BETWEEN ? AND ?
    GROUP BY bi.product_id HAVING revenue>0 OR cost>0
    ORDER BY (revenue-cost) DESC LIMIT 8`).all(from,to).map(r=>({
      sku_code:r.sku_code, name:r.product_name, revenue:round2(r.revenue), cost:round2(r.cost),
      profit:round2(r.revenue-r.cost), margin: r.revenue>0?round2((r.revenue-r.cost)/r.revenue*100):0 }));
  return { granularity, from, to, rows, totals, top };
}

// ── Dashboard / Settings ────────────────────────────────────────
function getDashboardStats() {
  const today = new Date().toISOString().slice(0, 10);
  const g = (sql, ...a) => db.prepare(sql).get(...a).c;

  // last 7 days sales trend (oldest -> newest)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const row = db.prepare('SELECT COALESCE(SUM(total),0) t, COUNT(*) c FROM bills WHERE bill_date=?').get(ds);
    last7.push({ date: ds, label: ds.slice(5), total: round2(row.t), count: row.c });
  }

  const monthStart = today.slice(0, 7) + '-01';
  const since30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();

  const monthSales = g('SELECT COALESCE(SUM(total),0) c FROM bills WHERE bill_date >= ?', monthStart);
  const monthCount = g('SELECT COUNT(*) c FROM bills WHERE bill_date >= ?', monthStart);
  const monthPL = _rangeProfit(monthStart, today);

  const topProducts = db.prepare(`
    SELECT bi.product_name name, bi.sku_code, SUM(bi.line_total) revenue, SUM(bi.pcs) pcs
    FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
    WHERE bi.kind='SALE' AND b.bill_date >= ?
    GROUP BY bi.product_id ORDER BY revenue DESC LIMIT 6`).all(since30);

  const salesByVan = db.prepare(`
    SELECT COALESCE(NULLIF(van,''),'—') van, SUM(total) total, COUNT(*) c
    FROM bills WHERE bill_date >= ?
    GROUP BY van ORDER BY total DESC LIMIT 6`).all(since30);

  const mix = db.prepare(`
    SELECT kind, COALESCE(SUM(pcs),0) pcs FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
    WHERE b.bill_date >= ? GROUP BY kind`).all(since30);
  const pieceMix = { SALE: 0, FREE: 0, REPLACE: 0 };
  for (const m of mix) pieceMix[m.kind] = m.pcs;

  const stockValueCost   = round2(g('SELECT COALESCE(SUM(stock_qty*cost),0) c FROM products WHERE active=1'));
  const stockValueRetail = round2(g('SELECT COALESCE(SUM(stock_qty*price),0) c FROM products WHERE active=1'));
  const inventoryItems = db.prepare(`SELECT sku_code, name, pcs_per_dozen, stock_qty, min_stock, cost, price,
      (stock_qty*cost) AS value_cost, (stock_qty*price) AS value_retail
      FROM products WHERE active=1 ORDER BY (stock_qty*cost) DESC`).all();
  return {
    totalProducts: g('SELECT COUNT(*) c FROM products WHERE active=1'),
    totalStock:    g('SELECT COALESCE(SUM(stock_qty),0) c FROM products WHERE active=1'),
    stockValueCost, stockValueRetail, inventoryItems,
    lowStock:      g('SELECT COUNT(*) c FROM products WHERE active=1 AND stock_qty <= min_stock AND min_stock > 0'),
    todayBills:    g('SELECT COUNT(*) c FROM bills WHERE bill_date=?', today),
    todaySales:    round2(g('SELECT COALESCE(SUM(total),0) c FROM bills WHERE bill_date=?', today)),
    todayReturns:  round2(g('SELECT COALESCE(SUM(total),0) c FROM sales_returns WHERE return_date=?', today)),
    monthReturns:  round2(g('SELECT COALESCE(SUM(total),0) c FROM sales_returns WHERE return_date >= ?', monthStart)),
    openLoads:     g("SELECT COUNT(*) c FROM load_forms WHERE status='OPEN'"),
    monthSales:    round2(monthSales),
    monthCount,
    avgBill:       monthCount ? round2(monthSales / monthCount) : 0,
    monthProfit:   monthPL.profit,
    monthMargin:   monthPL.margin,
    last7, topProducts, salesByVan, pieceMix,
    lowStockItems: db.prepare('SELECT * FROM products WHERE active=1 AND stock_qty <= min_stock AND min_stock > 0 ORDER BY stock_qty LIMIT 8').all(),
    recentBills:   db.prepare('SELECT * FROM bills ORDER BY created_at DESC LIMIT 6').all(),
    recentLoads:   db.prepare('SELECT * FROM load_forms ORDER BY created_at DESC LIMIT 5').all(),
    recentReturns: db.prepare('SELECT * FROM sales_returns ORDER BY created_at DESC, id DESC LIMIT 5').all(),
  };
}
function getSettings() {
  const o = {};
  for (const r of db.prepare('SELECT * FROM settings').all()) o[r.key] = r.value;
  o.current_day = getCurrentDay();
  return o;
}
function updateSettings(s) {
  const up = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  const tx = db.transaction(() => { for (const [k, v] of Object.entries(s)) up.run(k, String(v)); });
  tx();
  return { success: true };
}

module.exports = {
  initialize,
  getAllProducts, addProduct, updateProduct, deleteProduct, stockIn,
  getAllSchemes, addScheme, updateScheme, deleteScheme,
  resetData, checkpoint, closeDb, getDataStats, loadSampleData, setSamplePrefixes,
  _schemeCost, createBill, updateBill, getAllBills, getBillById, deleteBill, getBillsMany,
  isDayClosed, closeDay, openDay, listClosedDays, getCurrentDay,
  createPurchase, getAllPurchases, getPurchaseById, deletePurchase,
  createSalesReturn, getAllSalesReturns, getSalesReturnById, deleteSalesReturn, getBillForReturn, getReturnsForBill,
  createTaxInvoice, getTaxInvoice, processLoadReturn, getBillSummary,
  getCustomers, findCustomer, addCustomer, upsertCustomer, deleteCustomer,
  listMasters, addMaster, deleteMaster, setVanCrew,
  listBillsForLoad, generateLoadForm, getLoadForm, getAllLoadForms,
  updateLoadFormLine, setLoadFormStatus, deleteLoadForm,
  getProfitSummary, getProfitReport,
  getDashboardStats, getSettings, updateSettings,
};
