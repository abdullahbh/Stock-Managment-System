#!/usr/bin/env python3
# Stock Manager — Testing Checklist (UAT) PDF. Standalone; no images required.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, KeepTogether, PageBreak)

OUT = '/mnt/user-data/outputs/StockManager-Testing-Checklist.pdf'
GREEN = colors.HexColor('#1d4f91'); DARK = colors.HexColor('#1b2430')
GREY = colors.HexColor('#5b6472'); LINE = colors.HexColor('#c9cfda')
SOFT = colors.HexColor('#eef3ef'); AMBER = colors.HexColor('#fff7e6')

ss = getSampleStyleSheet()
def style(name, **kw): return ParagraphStyle(name, parent=ss['Normal'], **kw)
H1 = style('H1', fontName='Helvetica-Bold', fontSize=16, textColor=GREEN, spaceBefore=4, spaceAfter=7, leading=20)
H2 = style('H2', fontName='Helvetica-Bold', fontSize=12, textColor=DARK, spaceBefore=10, spaceAfter=4, leading=15)
BODY = style('Body', fontSize=10, textColor=DARK, leading=14.5, spaceAfter=6)
TD  = style('TD', fontSize=9.2, textColor=DARK, leading=12.6)
TDs = style('TDs', fontSize=8.8, textColor=DARK, leading=12.2)
TDb = style('TDb', fontName='Helvetica-Bold', fontSize=9.2, textColor=DARK, leading=12.6)
TT  = style('TT', fontName='Helvetica-Bold', fontSize=10.2, textColor=DARK, leading=13.5)
TH  = style('TH', fontName='Helvetica-Bold', fontSize=9, textColor=colors.white, leading=12)
CAP = style('Cap', fontName='Helvetica-Oblique', fontSize=8.6, textColor=GREY, leading=11)

def P(t, s=BODY): return Paragraph(t, s)

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm,
                      topMargin=1.5*cm, bottomMargin=1.6*cm,
                      title='Stock Manager — Testing Checklist')
def footer(cv, d):
    cv.saveState(); cv.setFont('Helvetica', 8); cv.setFillColor(GREY)
    cv.drawString(doc.leftMargin, 1.0*cm, 'Stock Manager — Testing Checklist (UAT)')
    cv.drawRightString(A4[0]-doc.rightMargin, 1.0*cm, f'Page {d.page}')
    cv.restoreState()
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=footer)])

def cbox(size=11):
    t = Table([['']], colWidths=[size], rowHeights=[size])
    t.setStyle(TableStyle([('BOX', (0,0), (-1,-1), 0.9, DARK)])); return t
def passfail():
    t = Table([[P('Pass', TDs), cbox(), P('Fail', TDs), cbox()]], colWidths=[24, 15, 22, 15])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),1),('RIGHTPADDING',(0,0),(-1,-1),3),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    return t

def test(tid, cr, title, asked, steps, expect):
    stepstxt = '<br/>'.join(f'{i+1}.&nbsp; {s}' for i, s in enumerate(steps))
    data = [
        [P(f'<b>{tid} — {title}</b> &nbsp;<font size="8" color="#5b6472">{cr}</font>', TT), passfail()],
        [P(f'<b>What was asked:</b> {asked}', TD), ''],
        [P(f'<b>How to test:</b><br/>{stepstxt}', TD), ''],
        [P(f'<b>You should see:</b> {expect}', TD), ''],
    ]
    t = Table(data, colWidths=[doc.width-82, 82])
    t.setStyle(TableStyle([
        ('SPAN',(0,1),(1,1)), ('SPAN',(0,2),(1,2)), ('SPAN',(0,3),(1,3)),
        ('BOX',(0,0),(-1,-1),0.8,LINE),
        ('LINEBELOW',(0,0),(-1,0),0.6,LINE),
        ('BACKGROUND',(0,0),(-1,0),SOFT),
        ('BACKGROUND',(0,3),(-1,3),colors.HexColor('#f7f9f7')),
        ('VALIGN',(0,0),(-1,-1),'TOP'), ('VALIGN',(1,0),(1,0),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
    ]))
    return KeepTogether([t, Spacer(1, 9)])

def reftable(rows, widths):
    data = [[P(c, TH) if r == 0 else (c if isinstance(c, Paragraph) else P(str(c), TD)) for c in row]
            for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GREEN),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#f4f6f4')]),
        ('GRID',(0,0),(-1,-1),0.4,LINE),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
    ]))
    return t

S = []

# ── TITLE ────────────────────────────────────────────────────────
S += [Spacer(1, 4)]
band = Table([[P('<font color="white" size="20"><b>Stock Manager</b></font><br/>'
                 '<font color="white" size="12">Testing Checklist (UAT) — every requested task, with steps</font>', BODY)]],
             colWidths=[doc.width])
band.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GREEN),
    ('LEFTPADDING',(0,0),(-1,-1),14),('RIGHTPADDING',(0,0),(-1,-1),14),
    ('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12)]))
S += [band, Spacer(1, 10)]
info = Table([[P('<b>Editions under test</b>', TDb), P('Haramain Marketing Services · Faisal Enterprises', TD)],
              [P('<b>Tested by</b>', TDb), P('_____________________________', TD)],
              [P('<b>Date</b>', TDb), P('_____________________________', TD)]],
             colWidths=[4.2*cm, doc.width-4.2*cm])
info.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,LINE),('LEFTPADDING',(0,0),(-1,-1),8),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
S += [info, Spacer(1, 12)]
S += [P('How to use this document: work through the tests in order — the early ones create the '
        'data the later ones need. Tick <b>Pass</b> or <b>Fail</b> on each. If something fails, '
        'note it in the Issues Log at the back and keep going.', BODY)]

# ── A. BEFORE YOU START ─────────────────────────────────────────
S += [P('A. Before you start', H1)]
S += [P('1. Download &amp; open', H2)]
S += [P('Download <b>Haramain-Marketing-Services-Windows.zip</b> (and <b>Faisal-Enterprises-Windows.zip</b>), right-click → <b>Extract All</b> '
        '(do not run from inside the zip), open the extracted folder and double-click '
        '<b>Haramain Marketing Services.exe</b>. If Windows shows a blue “Windows protected your '
        'PC” box, click <b>More info → Run anyway</b> (the app is unsigned; this is normal and '
        'only appears the first time).', BODY)]
S += [P('2. Start clean (optional but recommended)', H2)]
S += [P('The easiest way: open the app, go to <b>Settings → Data, backup &amp; starting fresh</b>, type '
        '<b>RESET</b> and press <b>Erase everything</b>. (A backup is saved first.) Alternatively close '
        'the app and delete the data file:', BODY)]
S += [P('<font face="Courier" size="8.6">C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\Haramain Marketing Services\\haramain-marketing.db</font><br/>'
        '<font face="Courier" size="8.6">C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\Faisal Enterprises\\faisal-enterprises.db</font>', BODY)]
S += [P('Note: if you delete the Faisal file you will also lose anything carried over from the old '
        'Moon Marketing app — skip the delete if you want to check that carry-over (T-28).', BODY)]
S += [P('3. Test plan', H2)]
S += [P('Do the full checklist on the <b>Haramain</b> edition, then do the short edition check '
        '(T-25) on <b>Faisal</b>. All numbers in the “You should see” column assume the exact test '
        'data below — enter it as written and the maths will match to the rupee.', BODY)]

# ── B. TEST DATA ────────────────────────────────────────────────
S += [P('B. Test data used throughout', H1)]
S += [P('You will enter this data during tests T-01 … T-06. It is listed here so you can see it '
        'in one place.', BODY)]
S += [reftable([
    ['Where', 'Values'],
    ['Settings → Business', 'Already filled in for you — leave as is (T-26 checks them). Haramain: H#23, Railway Scheme IV, Chaklala, Rawalpindi · 0307-3976382 · NTN 4216176-2 · GST 32-77-8761-761-26 · GST Rate 18.  Faisal: IJP Road, Khayaban-e-Sir Syed, Rawalpindi · 0314-5360901, 0333-1550788 · NTN J617125-4 · GST Rate 18.'],
    ['Settings → Vans / Bookers / Delivery Men', 'Vans: VAN 01, VAN 02 · Bookers: SAQIB · Delivery Men: AZHAR'],
    ['Products (3 items)', '208 · COLA NEXT 1500ML · pcs/dozen 12 · cost 96 · rate 118.33  |  202 · COLA NEXT 500ML · 12 · 24 · 30  |  3 · COLA NEXT 300ML · 12 · 9.50 · 12   (leave opening stock 0 — stock comes from the purchase in T-06)'],
    ['Schemes', 'Free Goods on 208: buy 120 pcs → 6 free, Active, date = today'],
    ['Shops', '4542 · AW BAKER · National Market · Phone 0300-1234567 · NTN 1234567-8 · CNIC 35202-1234567-1'],
    ['Purchase (T-06)', 'Vehicle ABC-123 · Supplier Next Distributors · 208 × 600 pcs @ 97 · 202 × 480 pcs @ 24 · 3 × 240 pcs @ 9.50'],
], [4.6*cm, doc.width-4.6*cm]), Spacer(1, 6)]

# ── MASTER LIST OF REQUESTED TASKS ──────────────────────────────
S += [PageBreak(), P('C. All requested tasks — master list', H1)]
S += [P('Everything requested across the project, and the test that checks it.', BODY)]
mrows = [['Req.', 'What was requested', 'Test'],
 ['CR-01','Bill printed in the memo layout','T-13'],
 ['CR-02','Booker on the right, Delivery Man on the left of the bill','T-13'],
 ['CR-03','GST Sales Tax Invoice for a bill','T-15'],
 ['CR-04','Direct PDF download without the print dialog','T-14'],
 ['CR-05','Paper-saving page — short bill gives a short page','T-14'],
 ['CR-06','Per-van Bill Summary report','T-16'],
 ['CR-07','Phone, NTN and CNIC on shops','T-04'],
 ['CR-08','Business NTN (and GST) printed on every bill','T-01, T-13'],
 ['CR-09','Customer NTN on the Sales Tax Invoice','T-15'],
 ['CR-10','Scheme name never printed — only the free line shows','T-09'],
 ['CR-11','Scheme has a date','T-05'],
 ['CR-12','Turn the scheme off for one specific bill','T-10'],
 ['CR-13','Saved Vans / Bookers / Delivery Men (create + dropdowns)','T-02'],
 ['CR-14','Purchases module — stock in with vehicle, date, auto amount','T-06'],
 ['CR-15','Van return updates stock','T-19'],
 ['CR-16','Edit / return items on a bill','T-17'],
 ['CR-17','Open / close business dates; closed date blocks bills','T-20'],
 ['CR-18','Edit a bill from the Bills screen','T-17'],
 ['CR-19','Full keyboard billing — Enter, Enter, no mouse','T-08'],
 ['CR-20','Dashboard two views — Daily Sales and Inventory','T-07'],
 ['CR-21','Inventory value on dashboard (pieces + amount)','T-07'],
 ['CR-22','Filters on Load Forms','T-18'],
 ['CR-23','RTG (returned good) pieces go back to stock','T-19'],
 ['CR-24','Pie chart on Profit / Loss','T-21'],
 ['CR-25','Print / save the Profit / Loss report','T-21'],
 ['CR-26','Same shop + same van + same day not allowed (next day fine)','T-12'],
 ['CR-27','Per-line Trade Offer on bill items','T-11'],
 ['P-01','Keyboard shortcuts everywhere (F1 list, Alt-navigation, Ctrl keys)','T-22'],
 ['P-02','Instant search on Products / Shops; sticky table headings','T-23'],
 ['P-03','Speed — indexed database, parallel loading, no white flash','T-24'],
 ['P-04','Updated User Guide','separate PDF'],
 ['B-01','Business address / phone / NTN / GST pre-filled, owner can change','T-26'],
 ['B-02','Company logos in the app and on printed bills / invoices','T-27'],
 ['B-03','Second edition renamed Moon → Faisal Enterprises (data kept)','T-28, T-25'],
 ['B-04','Windows file details and icon show the company, not “Electron”','T-29'],
 ['S-01','Scheme money comes off the profit, and is shown separately','T-21b'],
 ['X-01','Print shows a preview before sending to the printer','T-30'],
 ['X-02','Printing no longer produces a blank first page','T-31'],
 ['D-01','Backup and restore the business data','T-32'],
 ['D-02','Start fresh / clear test data, protected by PIN','T-33'],
]
S += [reftable(mrows, [1.5*cm, doc.width-1.5*cm-1.6*cm, 1.6*cm])]

# ── D. TESTS ────────────────────────────────────────────────────
S += [PageBreak(), P('D. The tests', H1)]
S += [P('Group 1 — Setup &amp; master data', H2)]
S += [test('T-01','CR-08','Business details & GST in Settings',
  'The business NTN / GST number should be saved once and appear on every bill; a GST rate for tax invoices.',
  ['Open <b>Settings</b>.',
   'Enter the Business values from section B (address, phone, NTN, GST No., GST Rate 18) and press <b>Save</b>.',
   'Re-open Settings.'],
  'A “Settings saved” message; the values are still there after re-opening.')]
S += [test('T-02','CR-13','Create Vans, Bookers & Delivery Men',
  'A place to create vans / bookers / delivery men, offered as dropdowns on every new bill.',
  ['In <b>Settings → Vans, Bookers &amp; Delivery Men</b>, add: Vans <b>VAN 01</b> and <b>VAN 02</b>, Booker <b>SAQIB</b>, Delivery Man <b>AZHAR</b> (type the name, press <b>Add</b> or Enter).',
   'Remove one entry with its ✕, then add it back.',
   'Open <b>New Bill</b> and click into the Van box.'],
  'Names appear as chips as you add them; removing works; on New Bill the Van / Booker / Delivery Man boxes offer the saved names as a dropdown.')]
S += [test('T-03','—','Add the three test products',
  'Products with code, pieces-per-dozen, cost and rate (margin should show automatically).',
  ['Open <b>Products → + Add Product</b>.',
   'Add the three products exactly as in section B (leave stock 0).'],
  'All three listed; margin column shows 18.9% for 208, 20% for 202, 20.8% for 3.')]
S += [test('T-04','CR-07','Shop with phone, NTN & CNIC',
  'Shops should store phone number, NTN and CNIC.',
  ['Open <b>Shops → + Add Shop</b>.',
   'Enter shop 4542 (AW BAKER) with the phone, NTN and CNIC from section B and save.'],
  'The shop appears with its Phone and NTN visible in the list; editing it shows the CNIC too.')]
S += [test('T-05','CR-11','Scheme with a date',
  'Schemes should carry a date.',
  ['Open <b>Schemes → + Add Scheme</b>.',
   'Type: Free Goods · product 208 · buy 120 → 6 free · Scheme Date = today · Active.'],
  'The scheme is listed with its date in the Date column.')]

S += [P('Group 2 — Purchases &amp; inventory', H2)]
S += [test('T-06','CR-14','Record a purchase (stock in)',
  'Enter what you purchased — vehicle number, date, products — with the amount auto-filled when a product is picked; stock goes up.',
  ['Open <b>Purchases → + New Purchase</b>.',
   'Vehicle <b>ABC-123</b>, supplier <b>Next Distributors</b>.',
   'Line 1: type code <b>208</b> — the name and cost fill in; change Unit Cost to <b>97</b>, Pieces <b>600</b>.',
   'Line 2: code <b>202</b>, 480 pcs (cost stays 24). Line 3: code <b>3</b>, 240 pcs (cost 9.50).',
   'Press <b>Save Purchase</b>, then check <b>Products</b>.'],
  'Total shows <b>Rs 72,000.00</b> before saving. After saving: stock is 600 / 480 / 240 pieces, and product 208 now shows cost <b>Rs 97</b>.')]
S += [test('T-07','CR-20, CR-21','Dashboard: two views + inventory value',
  'Dashboard should have Daily Sales and Inventory views; Inventory shows total pieces and total value.',
  ['Open <b>Dashboard</b>.',
   'Click <b>Inventory</b> at the top, then back to <b>Daily Sales</b>.'],
  'Inventory view shows <b>1,320 total pieces</b> and <b>Stock Value (at cost) Rs 72,000.00</b>, with a per-product value table. Daily Sales shows the charts.')]

S += [P('Group 3 — Billing', H2)]
S += [test('T-08','CR-19','Make a bill with the keyboard only',
  'Bills should be enterable without the mouse — Enter moves on, Enter on the last box adds a line.',
  ['Press <b>Ctrl+N</b>. Route: VAN 01 · SAQIB · AZHAR (pick from the dropdowns).',
   'Shop Code <b>4542</b> — name/address fill in automatically.',
   'In the first item line type code <b>208</b>, press <b>Enter</b> through the boxes, Dozen <b>11</b>.',
   'Keep pressing Enter to reach the last box of the line, press Enter once more (a new line appears), then press <b>Ctrl+S</b>.'],
  'You never touched the mouse in the items. Focus moved box-to-box with Enter; a new line was added from the last box; Ctrl+S saved: “Saved HMS-…-001 · Rs 15,619.56”.')]
S += [test('T-09','CR-10','Free goods appear — scheme name hidden',
  'The scheme should give the free pieces, but the scheme name must never print; only the free line shows.',
  ['Open the bill you just saved (Bills → View).',
   'Look at the items, then press <b>Print</b> and look at the print preview (you can cancel printing).'],
  'The bill has a <b>FREE</b> line — 208 × 6 pcs at 0.00 (132 sold ⇒ 1 × “buy 120 get 6”). Nowhere on the printed bill does the scheme’s name appear.')]
S += [test('T-10','CR-12','Turn the scheme off for one bill',
  'A per-bill switch to not apply any scheme.',
  ['Press Ctrl+N. Shop code <b>2206</b>, name <b>FRESCO BAKER</b> (a new shop — it will be saved automatically). Route VAN 02.',
   'Item: 208, Dozen 11. Tick <b>“Do not apply any scheme / discount to this bill”</b>. Save.'],
  'The saved bill has <b>no FREE line</b> even though 132 ≥ 120. (This also quietly proves new shops save themselves — check Shops later.)')]
S += [test('T-11','CR-27','Per-line trade offer',
  'Each item line has its own T.O box that comes off the bill total.',
  ['Press Ctrl+N. Shop <b>2206</b> · Van <b>VAN 01</b> (different van than T-10, same day is fine).',
   'Item: code <b>202</b>, Dozen <b>2</b> (48 pcs), and in the line’s <b>T.O</b> box enter <b>50</b>. Save.'],
  'Subtotal Rs 1,440.00, Payable <b>Rs 1,390.00</b>. Opening the bill shows T.O 50 against that line.')]
S += [test('T-12','CR-26','Same shop + same van + same day blocked',
  'The same shop cannot be billed by the same van twice on one day; the next day is fine.',
  ['Press Ctrl+N. Shop <b>4542</b>, Van <b>VAN 01</b>, item 3 × 12 pcs. Save.',
   'When it refuses: change the <b>Bill Date</b> to tomorrow and save again.'],
  'First attempt shows a clear error naming the shop, van, date and the existing bill number. With tomorrow’s date it saves normally.')]
S += [test('T-13','CR-01, CR-02, CR-08','Memo print layout',
  'The printed bill should look like the memo: business header with NTN/GST; Booker signature on the right, Delivered-By on the left.',
  ['Open the T-08 bill → <b>Print</b> and study the preview (cancel printing after).'],
  'Header: business name, address, phone, <b>NTN + GST</b>. Right block: Cash / Credit Memo, bill no, date, van, class. Columns: Code · Product · Dozen · Pcs · Rate · Amount. Signature row: <b>Delivered By (left)</b> — Checked By (centre) — <b>Booker (right)</b>, plus a Shop Keeper line.')]
S += [test('T-14','CR-04, CR-05','Direct PDF download + paper saving',
  'Save a bill as PDF without the print dialog; a short bill should give a short page.',
  ['On the same open bill press <b>Download PDF</b>, choose the Desktop, save.',
   'Open the saved PDF.'],
  'A save-file box appears (no print dialog). The PDF is the memo, and the page is <b>cut short</b> after the content — not a mostly-empty A4.')]
S += [test('T-15','CR-03, CR-09','Sales Tax Invoice (GST)',
  'A proper GST invoice per bill, with its own numbering and the customer’s NTN.',
  ['On the T-08 bill press <b>Sales Tax Invoice</b>.',
   'Check the header and the 208 line, then press Back and open the invoice again.'],
  'Header shows your GST No. + NTN and the customer NTN <b>1234567-8</b>; “Sales Tax Invoice No: 1”. The 208 line: Per Pack TP 118.330 → Per Unit GST <b>18.05</b>, Per Unit Amount <b>100.28</b> (18% inside the price). Re-opening shows the <b>same</b> invoice number — it is not re-issued.')]
S += [test('T-16','CR-06','Bill Summary per van',
  'A one-page per-van summary of bills with free amount, trade offer, discounts and totals.',
  ['Open <b>Bills</b>, set Van filter to <b>VAN 01</b>, press <b>Filter</b>, then <b>Bill Summary</b>.'],
  'A summary table — one row per VAN 01 bill (date, bill no, code, shop, Free Amount, Trade Offer, discounts, Total) with a Grand Total row. Print and Download PDF both work on it.')]
S += [test('T-17','CR-18, CR-16','Edit a bill — stock corrects itself',
  'Bills can be edited (quantities changed / items returned) and stock must follow.',
  ['Note product 208’s stock on <b>Products</b> (should be 462 = 600 − 132 − 6 free).',
   'Bills → <b>Edit</b> on the T-08 bill. Change 208 from Dozen 11 to Dozen <b>5</b> (60 pcs). <b>Save Changes</b>.',
   'Check Products again. (Optional: edit back to Dozen 11 afterwards.)'],
  'Bill total becomes Rs 7,099.80, the FREE line disappears (60 &lt; 120), and 208’s stock rises to <b>540</b> (600 − 60) — the returned pieces went back automatically.')]

S += [P('Group 4 — Load forms &amp; van returns', H2)]
S += [test('T-18','CR-22','Load Forms filters',
  'The load form list should filter by van and date.',
  ['Open <b>Load Forms → + Generate Load Form</b>; pick today, Find Bills, tick the VAN 01 bill(s), Generate.',
   'Back on the list, set Van <b>VAN 02</b> + Filter, then Van <b>VAN 01</b> + Filter.'],
  'With VAN 02 the new form is hidden; with VAN 01 it shows. Date From/To filters work the same way.')]
S += [test('T-19','CR-15, CR-23','RTG return goes back to stock (once)',
  'Returned-good pieces entered on the load form must be added back to stock when the load is closed — and never twice.',
  ['Note 208’s current stock on Products.',
   'Open the VAN 01 load form. On the 208 line enter <b>RTG = 24</b>. Press <b>Mark Closed</b>.',
   'Check Products; then on the form press Reopen and Mark Closed again; check once more.'],
  'Stock rises by exactly <b>+24</b> when first closed (the message says RTG returned to stock). Closing a second time does <b>not</b> add another 24.')]

S += [P('Group 5 — Day control', H2)]
S += [test('T-20','CR-17','Close a date — bills blocked',
  'If a date is closed, no bills can be added (or edited) on that date until it is re-opened.',
  ['<b>Settings → Day open / close</b>: with today’s date shown, press <b>Close this date</b>.',
   'Try Ctrl+N and save any bill for today; also try Edit on an existing today-bill.',
   'Back in Settings press <b>Open</b> next to the date and save a bill again.'],
  'While closed: saving fails with “Date … is closed”. The date is listed under Closed dates. After re-opening, saving works again.')]

S += [P('Group 6 — Reports', H2)]
S += [test('T-21b','S-01','Schemes are deducted from profit — and visible',
  'Scheme money must come off the profit, otherwise profit looks higher than it really is.',
  ['Make a bill big enough to trigger the free-goods scheme (e.g. 208 × 11 dozen) and give a <b>Trade Offer of 200</b> on it. Save.',
   'Open <b>Profit / Loss</b> and set the dates to cover today.',
   'Read the panel <b>“What schemes &amp; offers cost you”</b>.'],
  'The panel lists the free pieces (at cost and at sale value), the trade offer and any discounts, with a <b>Total scheme cost</b>. The bottom line shows <b>profit before schemes → profit after schemes</b>, and the “after” figure matches the Profit shown in the cards at the top. This confirms the scheme money has been taken out of profit, not left in it.')]
S += [test('T-21','CR-24, CR-25','Profit / Loss — pie, print & PDF',
  'A cost-vs-profit pie chart on Profit / Loss, and the report must print / save.',
  ['Open <b>Profit / Loss</b>.',
   'Press <b>Print</b> (cancel after the preview), then <b>Download PDF</b> and open the file.'],
  'A <b>Cost vs Profit</b> donut with the margin %, period cards, chart and breakdown table. The printed/PDF report contains the period summary, the full breakdown <b>and the scheme cost table</b>.')]

S += [P('Group 7 — Hotkeys, search &amp; speed', H2)]
S += [test('T-22','P-01','Keyboard shortcuts',
  'The whole app should be drivable from the keyboard, with a built-in shortcut list.',
  ['Press <b>F1</b> — read the list — press <b>Esc</b>.',
   'Press <b>Alt+4</b> (Bills), <b>Alt+1</b> (Dashboard), <b>Ctrl+N</b> (New Bill).',
   'Open any bill and press <b>Ctrl+P</b>; cancel the print.',
   'On Products press <b>Ctrl+F</b>; press <b>Ctrl+=</b> twice and <b>Ctrl+−</b> twice.'],
  'F1 opens the shortcuts popup (also via the <b>⌨ Keys</b> button, bottom-left); Esc closes it. Alt-numbers jump screens; Ctrl+P prints the open bill; Ctrl+F lands in the search box; Ctrl+= / − changes text size.')]
S += [test('T-23','P-02','Instant search & sticky headings',
  'Products and Shops filter as you type; long tables keep their headings while scrolling.',
  ['On <b>Products</b>, type <b>cola</b> in the search box, then clear it.',
   'On <b>Shops</b>, search by part of a phone number.',
   'Scroll any long list.'],
  'Rows filter instantly with each keystroke (no button press). Column headings stay pinned at the top while the rows scroll.')]
S += [test('T-24','P-03','Launch & responsiveness',
  'Faster app: indexed database, parallel loading, no white flash at start.',
  ['Close and re-open the app; watch the window appear.',
   'Click quickly between Dashboard → Bills → Products → New Bill.'],
  'The window appears already painted (no white rectangle first). Screens switch instantly; typing a product code fills the line without lag.')]

S += [test('T-30','X-01','Print shows a preview first',
  'Pressing Print used to go straight to the Windows dialog with no way to see the bill; you had to save a PDF just to check it.',
  ['Open any bill and press <b>Print</b>.',
   'Do the same on a Sales Tax Invoice, a Bill Summary, a Load Form and the Profit / Loss report.'],
  'Every one of them opens a <b>Print preview</b> showing the sheet exactly as it will print, with <b>Print</b>, <b>Save as PDF</b> and <b>Close</b>. Nothing prints until you press Print. <b>Esc</b> closes the preview.')]
S += [test('T-31','X-02','No blank first page',
  'Printing produced a blank page before the bill.',
  ['From the print preview of a single bill, press <b>Print</b> and choose <b>Microsoft Print to PDF</b>.',
   'Save the file and open it.',
   'Repeat with two bills ticked on the Bills screen (Print selected).'],
  'The single bill is <b>exactly 1 page</b> and the bill is on page 1 — no blank sheet in front of it. Two bills give <b>exactly 2 pages</b>, one bill each.')]

S += [test('T-32','D-01','Backup and restore',
  'A way to keep a copy of the business data and put it back.',
  ['<b>Settings → Data, backup &amp; starting fresh</b>. Read the line showing how much is stored.',
   'Press <b>Save a backup</b> and save it to the Desktop.',
   'Add a test shop, then press <b>Restore from backup</b> and pick the file you just saved.'],
  'The backup file appears on the Desktop. After restoring, the app reloads and the test shop is gone — the data is exactly as it was when the backup was taken.')]
S += [test('T-33','D-02','Starting fresh (and the PIN guard)',
  'After testing, the owner needs a clean copy — unzipping the app again does not clear data because the data lives on the computer.',
  ['In the same section, press <b>Clear bills, loads &amp; purchases</b> without typing anything.',
   'Type <b>RESET</b> in the confirm box and press it again; confirm the warning.',
   'Check <b>Bills</b>, then <b>Products</b> and <b>Settings</b>.',
   'Optional: set an <b>owner PIN</b>, then try clearing with the wrong PIN.'],
  'Nothing happens until RESET is typed. After confirming, all bills/loads/purchases are gone but products, shops and your company details remain. With a PIN set, a wrong PIN refuses. <b>Erase everything</b> clears the catalogue too and the company details come back by themselves. Every reset writes an automatic backup first — check <b>Open backup folder</b>.')]

S += [P('Group 8 — Editions', H2)]
S += [test('T-25','—','Haramain and Faisal stay separate',
  'Two branded builds with completely separate data.',
  ['Extract and open <b>Faisal Enterprises.exe</b> from the Faisal zip.',
   'Look at the sidebar, then open <b>Bills</b> and <b>Products</b>.'],
  'Faisal opens with its <b>red</b> branding and the Faisal logo, and shows <b>none</b> of the Haramain data — its bills, products and settings are its own. New bills there are numbered <b>FE-…</b> (Haramain uses HMS-…).')]


S += [test('T-26','B-01','Business details are already filled in',
  'The owner’s address, phone, NTN and GST should already be there on a new install — and stay changed if he edits them.',
  ['On a fresh install open <b>Settings</b> without typing anything.',
   'Check the Business block against the values below.',
   'Change the Phone to something else, press <b>Save</b>, close and re-open the app, and look again.'],
  '<b>Haramain:</b> H#23, Railway Scheme IV, Chaklala, Rawalpindi, Pakistan · 0307-3976382 · NTN 4216176-2 · GST 32-77-8761-761-26 · GST Rate 18.<br/>'
  '<b>Faisal:</b> IJP Road, Khayaban-e-Sir Syed, Rawalpindi · 0314-5360901, 0333-1550788 · NTN J617125-4 · GST Rate 18 (GST No. blank until he adds it).<br/>'
  'Your edited phone number is <b>still your version</b> after restarting — the app never overwrites what the owner typed.')]
S += [test('T-27','B-02','Logo shows in the app and on print',
  'The company logo should appear in the app and on the printed paperwork.',
  ['Look at the top-left of the sidebar.',
   'Open any bill → <b>Print</b> (cancel after the preview).',
   'On the same bill press <b>Sales Tax Invoice</b>.'],
  'The logo shows in the sidebar, at the top-left of the printed bill next to the business name and address, and at the top-left of the Sales Tax Invoice. Haramain shows the blue/gold HM logo; Faisal shows the red FE logo.')]
S += [test('T-28','B-03','Old Moon data carries over',
  'The second edition was renamed from Moon Marketing Services — nothing entered before the rename should be lost.',
  ['Only if you previously tested the <b>Moon Marketing Services</b> app on this PC: open <b>Faisal Enterprises.exe</b>.',
   'Check <b>Bills</b>, <b>Products</b> and <b>Shops</b>.'],
  'All the data you had entered in the Moon app is there. (On a PC that never ran the Moon app, Faisal simply starts empty — that is correct.)')]
S += [test('T-29','B-04','Windows shows the right name and icon',
  'The program file itself should identify as the right company, not as “Electron”.',
  ['In the extracted folder, right-click <b>Faisal Enterprises.exe → Properties → Details</b>.',
   'Do the same for <b>Haramain Marketing Services.exe</b>.',
   'Also look at the icon on the file, and the icon in the taskbar once it is running.'],
  'Details show <b>Product name</b> = the company name (not “Electron”) and <b>File description</b> = “… — Load &amp; Billing”. The file and taskbar icon is the company logo.')]

# ── ISSUES LOG ──────────────────────────────────────────────────
S += [PageBreak(), P('E. Issues log', H1)]
S += [P('Anything that failed or looked wrong — one line each. Send this page back with the ticks.', BODY)]
il = [['#','Test','What happened / what you expected','Screen']]
for i in range(1, 11): il.append([str(i), '', '', ''])
ilt = Table([[P(c, TH) if r == 0 else P(c, TD) for c in row] for r, row in enumerate(il)],
            colWidths=[0.9*cm, 1.6*cm, doc.width-0.9*cm-1.6*cm-3.0*cm, 3.0*cm],
            rowHeights=[None]+[24]*10)
ilt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GREEN),('GRID',(0,0),(-1,-1),0.4,LINE),
    ('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),6)]))
S += [ilt, Spacer(1, 16)]

S += [P('F. Sign-off', H1)]
so = Table([
    [P('Result', TDb), P('Approved', TD), cbox(), P('Approved with notes', TD), cbox(), P('Changes needed', TD), cbox()],
    [P('Signature', TDb), P('', TD), '', P('Date', TDb), P('', TD), '', ''],
], colWidths=[2.6*cm, 2.5*cm, 0.7*cm, 4.2*cm, 0.7*cm, 3.4*cm, 0.7*cm])
so.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,LINE),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ('LEFTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ('SPAN',(1,1),(2,1)),('SPAN',(4,1),(6,1))]))
S += [so]

doc.build(S)
import os
print('WROTE', OUT, os.path.getsize(OUT), 'bytes')
