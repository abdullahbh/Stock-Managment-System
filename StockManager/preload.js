const { contextBridge, ipcRenderer } = require('electron');

// Get the brand from the main process over IPC. This works even when the
// preload is sandboxed (a sandboxed preload cannot require local files).
let brand;
try { brand = ipcRenderer.sendSync('brand:get'); } catch (e) { brand = null; }
contextBridge.exposeInMainWorld('brand', brand);

const invoke = (channel, arg) => ipcRenderer.invoke(channel, arg);

contextBridge.exposeInMainWorld('api', {
  // products
  getProducts:  () => invoke('products:getAll'),
  addProduct:   (p) => invoke('products:add', p),
  updateProduct:(p) => invoke('products:update', p),
  deleteProduct:(id) => invoke('products:delete', id),
  stockIn:      (d) => invoke('products:stockIn', d),
  // schemes
  getSchemes:   () => invoke('schemes:getAll'),
  addScheme:    (s) => invoke('schemes:add', s),
  updateScheme: (s) => invoke('schemes:update', s),
  deleteScheme: (id) => invoke('schemes:delete', id),
  // bills
  createBill:   (b) => invoke('bills:create', b),
  getBills:     (f) => invoke('bills:getAll', f),
  getBill:      (id) => invoke('bills:getById', id),
  deleteBill:   (id) => invoke('bills:delete', id),
  getBillsMany: (ids) => invoke('bills:getMany', ids),
  // customers / shops
  getCustomers: () => invoke('customers:getAll'),
  findCustomer: (code) => invoke('customers:find', code),
  addCustomer:  (c) => invoke('customers:add', c),
  upsertCustomer:(c) => invoke('customers:upsert', c),
  deleteCustomer:(id) => invoke('customers:delete', id),
  listMasters:  (kind) => invoke('masters:list', kind),
  addMaster:    (d) => invoke('masters:add', d),
  deleteMaster: (id) => invoke('masters:delete', id),
  // bill edit
  updateBill:   (id, bill) => invoke('bills:update', { id, bill }),
  // day open/close
  isDayClosed:  (date) => invoke('days:isClosed', date),
  closeDay:     (date) => invoke('days:close', date),
  openDay:      (date) => invoke('days:open', date),
  listClosedDays: () => invoke('days:list'),
  // purchases
  createPurchase:(p) => invoke('purchases:create', p),
  getPurchases: () => invoke('purchases:getAll'),
  getPurchaseById:(id) => invoke('purchases:getById', id),
  deletePurchase:(id) => invoke('purchases:delete', id),
  // sales returns
  createReturn: (r) => invoke('returns:create', r),
  getReturns:   (f) => invoke('returns:getAll', f),
  getReturn:    (id) => invoke('returns:getById', id),
  deleteReturn: (id) => invoke('returns:delete', id),
  getBillForReturn:(ref) => invoke('returns:forBill', ref),
  getReturnsForBill:(id) => invoke('returns:ofBill', id),
  // tax invoice + summary + returns + pdf
  createTaxInvoice:(billId) => invoke('tax:create', billId),
  getTaxInvoice:(billId) => invoke('tax:get', billId),
  processLoadReturn:(id) => invoke('load:processReturn', id),
  getBillSummary:(f) => invoke('bills:summary', f),
  savePdf:      (d) => invoke('pdf:save', d),
  // data maintenance
  dataStats:    () => invoke('data:stats'),
  backupData:   () => invoke('data:backup'),
  restoreData:  () => invoke('data:restore'),
  resetData:    (o) => invoke('data:reset', o),
  openBackupFolder: () => invoke('data:openBackupFolder'),
  loadSampleData: () => invoke('data:sample'),
  // load forms
  listBillsForLoad: (f) => invoke('load:listBills', f),
  generateLoad: (d) => invoke('load:generate', d),
  getLoad:      (id) => invoke('load:get', id),
  getLoads:     (f) => invoke('load:getAll', f),
  updateLoadLine:(l) => invoke('load:updateLine', l),
  setLoadStatus:(d) => invoke('load:setStatus', d),
  deleteLoad:   (id) => invoke('load:delete', id),
  // profit / loss
  getProfitSummary: () => invoke('profit:summary'),
  getProfitReport:  (o) => invoke('profit:report', o),
  // misc
  getStats:     () => invoke('dashboard:stats'),
  getSettings:  () => invoke('settings:get'),
  updateSettings:(s) => invoke('settings:update', s),
});
