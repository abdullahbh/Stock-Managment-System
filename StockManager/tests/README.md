# StockManager tests

Automated integrity & correctness checks for the billing engine (`database.js`) and the
real bill/return/purchase screens (`renderer-dist/index.html`). They exist so a change can
never again silently break money or stock — every bug we hit is pinned here.

## Run them

```bash
cd StockManager/tests
npm install      # once — installs a plain-node better-sqlite3 + jsdom (safe: does NOT touch the app's Electron build)
npm test         # runs every suite and prints a pass/fail summary
```

`npm install` here builds test-only copies of the native modules for your machine's Node,
separate from the app's Electron-ABI copy in `StockManager/node_modules`, so the two never
interfere and the packaged app is unaffected.

## What is covered

**Billing math** — subtotal/tax/total, percentage & flat trade offers, per-line and manual
offers, rounding, tax base.
**Stock integrity** (`test-stock-integrity`) — stock is never silently wrong across create /
edit / delete of bills, purchases and returns; product-swap on a bill line; closed-day gates;
negative-stock guards; a full purchase→bill→return→delete round-trip ending exactly at zero.
**Schemes** (`test-schemes-matrix`, `test-freegroup`) — free goods per product and per flavour
**group** (mixed flavours adding up to a dozen), most-bought-flavour allocation, no double-dip,
best-ratio selection; trade offers with min-bill thresholds and stacking.
**Sales returns** (`test-returns*`, `test-return-guards`, `test-return-parity`) — credit
pro-rated to the bill's discount/offer, over-return and product-mismatch guards, GOOD restocks
vs DAMAGED written off, delete reverses stock, and the on-screen credit equals what is saved.
**A full trading day** (`test-scenario-day`) — ~15 bills over 3 vans, purchases, returns, and
cross-checks that stock, profit (= revenue − COGS, net of returns), the dashboard, the bill
summary and the profit report all reconcile.
**The real UI** (`test-billrate`, `test-editbill-rate`, `test-ui-forms`, `test-freegroup-ui`) —
drives the actual renderer in a headless DOM: the code→rate auto-fill follows the product the
code resolves to (the bug where every line billed at the first product's rate), a hand-typed
rate sticks, edited bills keep their historical rate, a van is required, and the Group / scheme
fields save correctly.

## Adding a test

Drop a `test-*.js` file in this folder that prints `ALL PASS` (or exits non-zero on failure);
`run-all.js` picks it up automatically. A UI (jsdom) suite must be added to the `UI` set in
`run-all.js` so it runs without the database shim.
