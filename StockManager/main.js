const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { getActiveBrand } = require('./brand.config');
let DB_PATH = null;

const brand = getActiveBrand();
// A demo copy keeps its own data folder so it can never mix with a real install on the same PC.
const IS_DEMO = (() => { try { return fs.existsSync(path.join(__dirname, 'demo.flag')); } catch (e) { return false; } })();
app.setName(IS_DEMO ? brand.name + ' Demo' : brand.name);

// Attach the brand logo (shown in the sidebar and printed on bills / invoices)
try {
  if (brand.logoFile) {
    const lp = path.join(__dirname, 'assets', brand.logoFile);
    if (fs.existsSync(lp)) {
      let img = nativeImage.createFromPath(lp);
      if (img.getSize().width > 256) img = img.resize({ width: 256 });
      brand.logo = 'data:image/png;base64,' + img.toPNG().toString('base64');
    }
  }
} catch (e) {}

// database.js is fully synchronous, so it runs on its own thread — a heavy query can never freeze typing.
const unpacked = (p) => p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
const pending = new Map();
let worker = null, seq = 0, startedAt = 0, respawnAt = 0, quitting = false;

function spawnWorker() {
  const w = new Worker(unpacked(path.join(__dirname, 'db-worker.js')));
  let down = false;
  const fell = (why) => { if (down || quitting) return; down = true; if (w === worker) workerDied(why); };
  w.on('message', (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
  });
  w.on('error', (err) => fell(err.message));
  w.on('exit', (code) => { if (code !== 0) fell('the database thread stopped (code ' + code + ')'); });
  worker = w;
  startedAt = Date.now();
}

function workerDied(why) {
  const msg = 'The database stopped responding: ' + why;
  for (const p of pending.values()) p.reject(new Error(msg));
  pending.clear();
  worker = null;
  if (respawnAt && Date.now() - startedAt < 10000) {   // the restarted thread died too — stop here
    dialog.showErrorBox(brand.name, msg + '\n\nPlease restart the app. Your saved data is safe.');
    app.quit();
    return;
  }
  respawnAt = Date.now();
  spawnWorker();
  if (DB_PATH) dbCall('initialize', DB_PATH, brand.settings || {})
    .then(() => dbCall('setSamplePrefixes', brand.billPrefix, brand.loadPrefix, brand.returnPrefix))
    .catch(() => {});
}

function dbCall(method, ...args) {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('The database is not running — please restart the app.'));
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    show: false,                    // avoid white flash; shown on ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // the preload only needs contextBridge / ipcRenderer
      spellcheck: false,
    },
    icon: (() => {
      const cand = [brand.iconFile, 'icon.png'].filter(Boolean).map(f => path.join(__dirname, 'build', f));
      return cand.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || cand[cand.length - 1];
    })(),
    title: brand.name + (IS_DEMO ? '  —  DEMO (sample data)' : ''),
    backgroundColor: '#0f1117',
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer-dist', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  // a file dropped on the window must never replace the app document
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// A second copy would fight over the same sqlite file, so keep one instance only.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  spawnWorker();
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    const dbPath = path.join(app.getPath('userData'), brand.dbFile);
    DB_PATH = dbPath;
    // One-time migration: this edition used to be "Moon Marketing Services".
    let legacyErr = null;
    try {
      if (brand.legacy && !fs.existsSync(dbPath)) {
        const oldDb = path.join(app.getPath('appData'), brand.legacy.name, brand.legacy.dbFile);
        if (fs.existsSync(oldDb)) {
          fs.mkdirSync(path.dirname(dbPath), { recursive: true });
          fs.copyFileSync(oldDb, dbPath);
        }
      }
    } catch (e) { legacyErr = e; }
    try {
      await dbCall('initialize', dbPath, brand.settings || {});
      await dbCall('setSamplePrefixes', brand.billPrefix, brand.loadPrefix, brand.returnPrefix);
    } catch (err) {
      dialog.showErrorBox(brand.name, 'The database could not be opened:\n\n' + err.message);
      app.quit();
      return;
    }

    // Demo build: a "demo.flag" file beside the app fills a brand-new install with sample data,
    // so the folder can be unzipped and shown straight away. Real installs never have this file.
    try {
      if (IS_DEMO && (await dbCall('getDataStats')).bills === 0) {
        await dbCall('loadSampleData');
      }
    } catch (e) {}
    Menu.setApplicationMenu(null);   // no menu means no stray Ctrl+W / Ctrl+R / F12 accelerators
    createWindow();
    if (legacyErr) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: brand.name,
        message: `Your old "${brand.legacy.name}" data could not be copied.`,
        detail: legacyErr.message +
          '\n\nThe old data has not been touched — it is still in its own folder, so nothing is lost. ' +
          'The app is starting with a fresh, empty file. Ask your supplier of this app to copy the old data across.',
        buttons: ['OK'],
      }).then(() => {}).catch(() => {});
    }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());

// wrap handlers so thrown errors come back as { error } instead of crashing the renderer
const h = (fn) => async (_e, arg) => { try { return { ok: true, data: await fn(arg) }; }
                                       catch (err) { return { ok: false, error: err.message }; } };

// brand (also exposed statically via preload)
ipcMain.on('brand:get', (e) => { e.returnValue = Object.assign({}, brand, { isDemo: IS_DEMO }); });
ipcMain.handle('app:brand', () => brand);

// products
ipcMain.handle('products:getAll', h(() => dbCall('getAllProducts')));
ipcMain.handle('products:add',    h((p) => dbCall('addProduct', p)));
ipcMain.handle('products:update', h((p) => dbCall('updateProduct', p)));
ipcMain.handle('products:delete', h((id) => dbCall('deleteProduct', id)));
ipcMain.handle('products:stockIn', h((d) => dbCall('stockIn', d)));

// schemes
ipcMain.handle('schemes:getAll', h(() => dbCall('getAllSchemes')));
ipcMain.handle('schemes:add',    h((s) => dbCall('addScheme', s)));
ipcMain.handle('schemes:update', h((s) => dbCall('updateScheme', s)));
ipcMain.handle('schemes:delete', h((id) => dbCall('deleteScheme', id)));

// bills
ipcMain.handle('bills:create',  h((b) => dbCall('createBill', b)));
ipcMain.handle('bills:getAll',  h((f) => dbCall('getAllBills', f)));
ipcMain.handle('bills:getById', h((id) => dbCall('getBillById', id)));
ipcMain.handle('bills:delete',  h((id) => dbCall('deleteBill', id)));
ipcMain.handle('bills:getMany', h((ids) => dbCall('getBillsMany', ids)));

// customers / shops
ipcMain.handle('customers:getAll', h(() => dbCall('getCustomers')));
ipcMain.handle('customers:find',   h((code) => dbCall('findCustomer', code)));
ipcMain.handle('customers:add',    h((c) => dbCall('addCustomer', c)));
ipcMain.handle('customers:upsert', h((c) => dbCall('upsertCustomer', c)));
ipcMain.handle('customers:delete', h((id) => dbCall('deleteCustomer', id)));
ipcMain.handle('masters:list', h((kind) => dbCall('listMasters', kind)));
ipcMain.handle('masters:add',  h((d) => dbCall('addMaster', d.kind, d.name)));
ipcMain.handle('masters:delete', h((id) => dbCall('deleteMaster', id)));
ipcMain.handle('masters:setVanCrew', h((d) => dbCall('setVanCrew', d.van, d.booker, d.dm)));

// bill edit
ipcMain.handle('bills:update', h((d) => dbCall('updateBill', d.id, d.bill)));
// day open / close
ipcMain.handle('days:isClosed', h((date) => dbCall('isDayClosed', date)));
ipcMain.handle('days:close',    h((date) => dbCall('closeDay', date)));
ipcMain.handle('days:open',     h((date) => dbCall('openDay', date)));
ipcMain.handle('days:list',     h(() => dbCall('listClosedDays')));
// purchases
ipcMain.handle('purchases:create',  h((p) => dbCall('createPurchase', p)));
ipcMain.handle('purchases:getAll',  h(() => dbCall('getAllPurchases')));
ipcMain.handle('purchases:getById', h((id) => dbCall('getPurchaseById', id)));
ipcMain.handle('purchases:delete',  h((id) => dbCall('deletePurchase', id)));
// sales returns
ipcMain.handle('returns:create',  h((r) => dbCall('createSalesReturn', r)));
ipcMain.handle('returns:getAll',  h((f) => dbCall('getAllSalesReturns', f)));
ipcMain.handle('returns:getById', h((id) => dbCall('getSalesReturnById', id)));
ipcMain.handle('returns:delete',  h((id) => dbCall('deleteSalesReturn', id)));
ipcMain.handle('returns:forBill', h((ref) => dbCall('getBillForReturn', ref)));
ipcMain.handle('returns:ofBill',  h((id) => dbCall('getReturnsForBill', id)));
// tax invoice + summary + returns
ipcMain.handle('tax:create', h((billId) => dbCall('createTaxInvoice', billId)));
ipcMain.handle('tax:get',    h((billId) => dbCall('getTaxInvoice', billId)));
ipcMain.handle('load:processReturn', h((id) => dbCall('processLoadReturn', id)));
ipcMain.handle('bills:summary', h((f) => dbCall('getBillSummary', f)));

// ── Data maintenance: backup, restore, reset ────────────────────
function stamp(){ const d=new Date(), p=(n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
async function autoBackup(tag){
  try{
    await dbCall('checkpoint');
    const dir = path.join(path.dirname(DB_PATH), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const to = path.join(dir, `${brand.shortName}-${tag}-${stamp()}.db`);
    await fs.promises.copyFile(DB_PATH, to);
    return to;
  }catch(e){ return null; }
}
ipcMain.handle('data:stats', h(async () => ({ ...(await dbCall('getDataStats')), path: DB_PATH,
  size: (()=>{ try{ return fs.statSync(DB_PATH).size; }catch(e){ return 0; } })() })));

ipcMain.handle('data:backup', async () => {
  try{
    await dbCall('checkpoint');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save a backup of your data',
      defaultPath: `${brand.shortName}-backup-${stamp()}.db`,
      filters: [{ name: 'Stock Manager backup', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { ok:true, data:{ saved:false } };
    await fs.promises.copyFile(DB_PATH, filePath);
    return { ok:true, data:{ saved:true, path:filePath } };
  }catch(err){ return { ok:false, error:err.message }; }
});

ipcMain.handle('data:restore', async () => {
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a backup file to restore',
      properties: ['openFile'],
      filters: [{ name: 'Stock Manager backup', extensions: ['db'] }],
    });
    if (canceled || !filePaths || !filePaths[0]) return { ok:true, data:{ restored:false } };
    const src = filePaths[0];
    // check the chosen file before the live database is touched
    try{
      const probe = new (require('better-sqlite3'))(src, { readonly:true, fileMustExist:true });
      const row = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bills'").get();
      probe.close();
      if (!row) return { ok:false, error:'That file is not a Stock Manager backup.' };
    }catch(e){ return { ok:false, error:'That file is not a Stock Manager backup.' }; }
    const safety = await autoBackup('before-restore');
    await dbCall('closeDb');
    try{
      await fs.promises.copyFile(src, DB_PATH);
      for (const ext of ['-wal','-shm']) { try{ fs.unlinkSync(DB_PATH+ext); }catch(e){} }
      await dbCall('initialize', DB_PATH, brand.settings || {});
    }catch(err){
      try{ await dbCall('initialize', DB_PATH, brand.settings || {}); }catch(e){}
      return { ok:false, error:err.message };
    }
    if (mainWindow) mainWindow.reload();
    return { ok:true, data:{ restored:true, safety } };
  }catch(err){ return { ok:false, error:err.message }; }
});

ipcMain.handle('data:reset', h(async (opts) => {
  const o = opts || {};
  const backup = await autoBackup(o.scope === 'everything' ? 'before-erase' : 'before-clear');
  if (!backup) throw new Error('Could not take a safety backup — nothing was erased. Check disk space and try again.');
  await dbCall('resetData', { scope: o.scope, zero_stock: o.zero_stock });
  if (o.scope === 'everything') await dbCall('initialize', DB_PATH, brand.settings || {});   // put the company details back
  if (mainWindow) setTimeout(() => mainWindow.reload(), 400);
  return { success: true, backup };
}));

ipcMain.handle('data:sample', h(async () => { const r = await dbCall('loadSampleData'); if (mainWindow) setTimeout(()=>mainWindow.reload(), 400); return r; }));

ipcMain.handle('data:openBackupFolder', h(() => {
  const dir = path.join(path.dirname(DB_PATH), 'backups');
  try{ fs.mkdirSync(dir, { recursive:true }); }catch(e){}
  shell.openPath(dir);
  return { success:true, dir };
}));


// Direct PDF download: render provided HTML to a PDF file (page height fits content to save paper)
ipcMain.handle('pdf:save', async (_e, { html, suggestedName }) => {
  const tmpHtml = path.join(require('os').tmpdir(),
    `${brand.shortName}-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  const limit = (p) => { let t;
    const guard = new Promise((_r, rej) => { t = setTimeout(() => rej(new Error('PDF rendering timed out')), 30000); });
    return Promise.race([p, guard]).finally(() => clearTimeout(t)); };
  let win = null;
  try {
    fs.writeFileSync(tmpHtml, html);
    win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await limit(win.loadFile(tmpHtml));
    let px = 1123;
    try { px = await limit(win.webContents.executeJavaScript('Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)')); } catch (e) {}
    const heightMm = Math.min(Math.max(60, Math.ceil(px / 96 * 25.4) + 12), 5000);   // fit page to content (paper saving)
    try { await limit(win.webContents.executeJavaScript(
      `(function(){var s=document.createElement('style');s.textContent='@page{size:210mm ${heightMm}mm;margin:6mm}';document.head.appendChild(s);})()`)); } catch (e) {}
    const data = await limit(win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true }));
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF', defaultPath: (suggestedName || 'document') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: true, data: { saved: false } };
    fs.writeFileSync(filePath, data);
    return { ok: true, data: { saved: true, path: filePath } };
  } catch (err) { return { ok: false, error: err.message }; }
  finally {
    try { if (win && !win.isDestroyed()) win.destroy(); } catch (e) {}
    try { fs.unlinkSync(tmpHtml); } catch (e) {}
  }
});

// load forms
ipcMain.handle('load:listBills', h((f) => dbCall('listBillsForLoad', f)));
ipcMain.handle('load:generate',  h((d) => dbCall('generateLoadForm', d)));
ipcMain.handle('load:get',       h((id) => dbCall('getLoadForm', id)));
ipcMain.handle('load:getAll',    h((f) => dbCall('getAllLoadForms', f)));
ipcMain.handle('load:updateLine',h((l) => dbCall('updateLoadFormLine', l)));
ipcMain.handle('load:setStatus', h((d) => dbCall('setLoadFormStatus', d.id, d.status)));
ipcMain.handle('load:delete',    h((id) => dbCall('deleteLoadForm', id)));

// profit / loss
ipcMain.handle('profit:summary', h(() => dbCall('getProfitSummary')));
ipcMain.handle('profit:report',  h((o) => dbCall('getProfitReport', o)));

// misc
ipcMain.handle('dashboard:stats', h(() => dbCall('getDashboardStats')));
ipcMain.handle('settings:get',    h(() => dbCall('getSettings')));
ipcMain.handle('settings:update', h((s) => dbCall('updateSettings', s)));
