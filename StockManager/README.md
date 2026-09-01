# Marketing Services — Stock Manager (v2)

Desktop app (Electron + better-sqlite3) for beverage distribution: SKUs, billing,
schemes, and **Issue / Return Load Forms**. One codebase ships **two branded apps**:

| Brand | `BRAND` value | Bill prefix | Load prefix | Accent |
|---|---|---|---|---|
| Haramain Marketing Services | `haramain` | HMS | HL | green |
| Moon Marketing Services | `moon` | MMS | ML | indigo |

Each brand builds to its own installer with its own `appId`, so the two apps install
side-by-side and keep **separate databases** (`haramain-marketing.db` / `moon-marketing.db`
in each app's userData folder).

## Run (dev)
```bash
npm install            # fetches Electron + builds better-sqlite3 for your machine
npm run start:haramain # or: npm run start:moon
```

## Build Windows installers
```bash
npm run build:haramain   # -> dist/haramain/  (NSIS setup + Haramain-Portable.exe)
npm run build:moon       # -> dist/moon/      (NSIS setup + Moon-Portable.exe)
npm run build:all        # both
```
> Build on Windows (or Windows CI). `better-sqlite3` is a native module, so the machine
> that runs `npm install` must match the target OS.

## How the data model maps to the paper forms

**Stock is always stored in PIECES.** A product's `pcs_per_dozen` (default 12) converts
to the "Dozen" column. Enter quantities as dozens + loose pcs; the app computes total pcs.

**Bill line kinds** (New Bill screen):
- `SALE` — billed normally (`pcs × rate`).
- `REPLACE` — piece-for-piece swap. **Rs 0, never added to the bill total**, but the
  pieces still leave the warehouse and appear in the load form's **Replace** column.
- `FREE` — scheme free goods. Rs 0, loaded but not billed. Free goods are also added
  **automatically** from active Free-Goods schemes when you save a bill.

**Schemes** (Schemes screen):
- *Free Goods* — "buy N pcs of product X → M free pcs of X". Applied per matching SALE line.
- *Trade Offer* — flat "Rs off" on any bill ≥ a minimum. Reduces the bill total and is
  noted on the bill. (These mirror the Free Amount / Trade Offer columns on the Shezan
  bill summary.)

**Load Form** = the SAL Enterprises *Issue / Return Load* sheet, generated from a set of
bills for a van/day. Columns:
`Code · Product · Dozen · Pcs · Load 2 · Replace · Free · RTG · Dented · Leak · Scheme`
- **Dozen / Pcs** — issued quantity, aggregated per product across all selected bills.
- **Free / Replace / Scheme** — pre-filled from the bills' FREE/REPLACE lines and schemes.
- **Load 2 / RTG / Dented / Leak** — start at 0, edited on the van's return
  ("Save Check Columns"), then mark the form Closed.
- Shows booking amount, the list of bills on the load, and a scheme summary. Printable.

A bill can only sit on one load form; the "Generate Load Form" flow lists only bills not
yet loaded, so nothing is double-counted.

## Files
```
brand.config.js            two brand profiles + BRAND selector
main.js                    Electron main, brand-aware, IPC handlers
preload.js                 contextBridge api surface
database.js                all SQL + business logic (dbPath injected by main.js)
renderer-dist/index.html   the whole UI (no build step, plain JS)
electron-builder.config.js per-brand build config (reads BRAND)
```

## Assumptions I made (change if wrong)
1. **Brand spelling** — used *Haramain* (your typed spec). The audio transcript said
   "Harman"; adjust `brand.config.js` if it should be Harman.
2. **Load form column 1 = Product**, matching your SAL Enterprises sample. The form is
   *built from* all the selected bills (aggregated per product), which is how I read
   "all bills … quantity in dozens".
3. **Scheme = trade offer / free goods** (as on the Shezan summary), shown on the load
   form. The handwriting on the SAL sheet is a cash-denomination count (5000/1000/500…
   note tally), i.e. collection reconciliation — a separate concern; say the word if you
   want a cash-collection screen too.
4. **1 dozen = 12 pcs** for every SKU in your samples; editable per product.
5. Icon is a shared placeholder — drop per-brand icons in `build/` and point
   `electron-builder.config.js` at them when you want distinct app icons.
