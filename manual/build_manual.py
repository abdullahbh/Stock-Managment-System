#!/usr/bin/env python3
# Stock Manager — User Guide (both editions: Haramain Marketing Services & Faisal Enterprises)
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Image, Table, TableStyle, KeepTogether, PageBreak, ListFlowable, ListItem)

IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img')
OUT = '/mnt/user-data/outputs/StockManager-User-Guide.pdf'

GREEN = colors.HexColor('#1d4f91'); DARK = colors.HexColor('#1b2430')
GREY = colors.HexColor('#5b6472'); LINE = colors.HexColor('#c9cfda')
SOFT = colors.HexColor('#eef3ef')

ss = getSampleStyleSheet()
def st(name, **kw): return ParagraphStyle(name, parent=ss['Normal'], **kw)
H1  = st('H1', fontName='Helvetica-Bold', fontSize=16, textColor=GREEN, spaceBefore=2, spaceAfter=8, leading=20)
H2  = st('H2', fontName='Helvetica-Bold', fontSize=12, textColor=DARK, spaceBefore=11, spaceAfter=4, leading=15)
BODY= st('Body', fontSize=10.2, textColor=DARK, leading=15, spaceAfter=7)
CAP = st('Cap', fontName='Helvetica-Oblique', fontSize=8.6, textColor=GREY, leading=11, spaceAfter=10)
TD  = st('TD', fontSize=9.3, textColor=DARK, leading=12.8)
TDb = st('TDb', fontName='Helvetica-Bold', fontSize=9.3, textColor=DARK, leading=12.8)
TH  = st('TH', fontName='Helvetica-Bold', fontSize=9, textColor=colors.white, leading=12)

def P(t, s=BODY): return Paragraph(t, s)

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=1.8*cm, rightMargin=1.8*cm,
                      topMargin=1.6*cm, bottomMargin=1.6*cm, title='Stock Manager — User Guide')
def footer(cv, d):
    cv.saveState(); cv.setFont('Helvetica', 8); cv.setFillColor(GREY)
    cv.drawString(doc.leftMargin, 1.0*cm, 'Stock Manager — User Guide')
    cv.drawRightString(A4[0]-doc.rightMargin, 1.0*cm, f'Page {d.page}')
    cv.restoreState()
doc.addPageTemplates([PageTemplate(id='p',
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')], onPage=footer)])

def figure(fn, caption, maxh=13.2*cm):
    path = os.path.join(IMG, fn)
    iw, ih = ImageReader(path).getSize()
    w = doc.width; h = w * ih / iw
    if h > maxh: h = maxh; w = h * iw / ih
    im = Image(path, width=w, height=h)
    im.hAlign = 'CENTER'
    box = Table([[im]], colWidths=[w])
    box.setStyle(TableStyle([('BOX',(0,0),(-1,-1),0.6,LINE),('BACKGROUND',(0,0),(-1,-1),colors.white),
                             ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
                             ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    box.hAlign = 'CENTER'
    return KeepTogether([box, Spacer(1,4), P(caption, CAP)])

def table(rows, widths):
    data = [[P(c, TH) if r == 0 else (c if isinstance(c, Paragraph) else P(str(c), TD)) for c in row]
            for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GREEN),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#f4f6f4')]),
        ('GRID',(0,0),(-1,-1),0.4,LINE), ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),4.5),('BOTTOMPADDING',(0,0),(-1,-1),4.5)]))
    return t

def bullets(items):
    return ListFlowable([ListItem(P(i), leftIndent=12) for i in items],
                        bulletType='bullet', start='•', leftIndent=14, bulletFontSize=8)

def note(text):
    t = Table([[P(text, TD)]], colWidths=[doc.width])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),SOFT),('BOX',(0,0),(-1,-1),0.6,GREEN),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    return KeepTogether([t, Spacer(1,9)])

S = []

# ── COVER ────────────────────────────────────────────────────────
band = Table([[P('<font color="white" size="22"><b>Stock Manager</b></font><br/>'
                 '<font color="white" size="12.5">User Guide — load &amp; billing for your distribution business</font>', BODY)]],
             colWidths=[doc.width])
band.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GREEN),
    ('LEFTPADDING',(0,0),(-1,-1),16),('RIGHTPADDING',(0,0),(-1,-1),16),
    ('TOPPADDING',(0,0),(-1,-1),16),('BOTTOMPADDING',(0,0),(-1,-1),16)]))
S += [band, Spacer(1, 14)]

logos = Table([[Image(os.path.join(IMG,'brand-haramain.png'), width=4.6*cm, height=4.6*cm*631/692),
                Image(os.path.join(IMG,'brand-faisal.png'), width=3.9*cm, height=3.9*cm*747/700)],
               [P('<b>Haramain Marketing Services</b>', TD), P('<b>Faisal Enterprises</b>', TD)]],
              colWidths=[doc.width/2, doc.width/2])
logos.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'CENTER'),('VALIGN',(0,0),(-1,0),'BOTTOM'),
    ('TOPPADDING',(0,1),(-1,1),8)]))
S += [logos, Spacer(1, 14)]
S += [P('This guide covers both editions of the app. They work in exactly the same way — only the '
        'company name, colours, logo and bill numbering differ, and each keeps its own separate '
        'data on your computer.', BODY)]
S += [note('<b>Never used it before?</b> Read sections 1 to 4, then jump to section 19 (“Your everyday '
           'routine”). Everything else is there when you need it. Press <b>F1</b> inside the app at any '
           'time to see the keyboard shortcuts.')]

S += [P('What is in this guide', H2)]
toc = [['#','Section'],
 ['1','Installing and opening the app'],['2','The main screen'],['3','Your company details (already filled in)'],
 ['4','Products'],['5','Schemes (free goods &amp; trade offers)'],['6','Shops'],
 ['7','Making a bill'],['8','Finding, printing and invoicing bills'],['9','Load forms for the van'],
 ['10','When the van comes back'],['11','Profit / Loss'],['12','The Dashboard’s two views'],
 ['13','Purchases — recording stock you buy in'],['14','The Sales Tax Invoice (GST)'],
 ['15','The Bill Summary (per van)'],['16','Editing bills, returns and closing dates'],
 ['17','Vans &amp; staff, scheme options, fast entry'],['18','Keyboard shortcuts'],
 ['19','Your everyday routine'],['20','Tips, backups and problems']]
S += [table(toc, [1.2*cm, doc.width-1.2*cm])]

# ── 1 INSTALL ────────────────────────────────────────────────────
S += [PageBreak(), P('1. Installing and opening the app', H1)]
S += [P('There is nothing to install. The app is a folder you keep on the computer.', BODY)]
S += [P('1. Copy the ZIP file onto the computer (for example onto the Desktop).<br/>'
        '2. Right-click it and choose <b>Extract All…</b> — this is important, the app will not run '
        'from inside the ZIP.<br/>'
        '3. Open the folder that appears and double-click the program:<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;• <b>Haramain Marketing Services.exe</b>, or<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;• <b>Faisal Enterprises.exe</b>', BODY)]
S += [note('The first time you open it, Windows may show a blue box saying “Windows protected your PC”. '
           'Click <b>More info</b> and then <b>Run anyway</b>. This happens because the app is not '
           'signed with a paid certificate; it is safe, and the message will not appear again.')]
S += [P('Keep the whole folder together — do not move the .exe out on its own. For convenience, '
        'right-click the .exe and choose <b>Send to → Desktop (create shortcut)</b>.', BODY)]
S += [P('Where your information is kept', H2)]
S += [P('Everything you enter is saved automatically on the same computer, in a single file:', BODY)]
S += [table([['Edition','Data file'],
  ['Haramain Marketing Services','<font face="Courier" size="8.4">C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\Haramain Marketing Services\\haramain-marketing.db</font>'],
  ['Faisal Enterprises','<font face="Courier" size="8.4">C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\Faisal Enterprises\\faisal-enterprises.db</font>']],
  [5.0*cm, doc.width-5.0*cm])]
S += [Spacer(1,7), P('Copy that file somewhere safe now and then — that is your backup (section 20). '
        'The two editions never mix: each has its own products, bills and settings.', BODY)]
S += [note('<b>If you used the old “Moon Marketing Services” app:</b> that edition is now <b>Faisal '
           'Enterprises</b>. The first time you open Faisal Enterprises it brings your old Moon data '
           'across automatically — your products, shops and bills will be there.')]

# ── 2 MAIN SCREEN ────────────────────────────────────────────────
S += [PageBreak(), P('2. The main screen', H1)]
S += [P('The menu down the left never changes. Click any item to move between the main areas — '
        'Dashboard, Profit / Loss, New Bill, Bills, Load Forms, Products, Schemes, Shops, Purchases '
        'and Settings. The Dashboard has two views (Daily Sales and Inventory) and gives you a quick '
        'picture of the business: sales today, bills today, sales and profit this month, open loads, '
        'a 7-day chart, your best-selling products, sales by van, and anything running low on stock.', BODY)]
S += [figure('01-dashboard.png', 'The Dashboard (Daily Sales view). Your company logo is at the top-left.')]
S += [P('At the very bottom of the menu you can switch between <b>light and dark</b>, make the text '
        '<b>bigger or smaller</b>, and open the <b>keyboard shortcuts</b> list.', BODY)]

# ── 3 SETTINGS ───────────────────────────────────────────────────
S += [PageBreak(), P('3. Your company details (already filled in)', H1)]
S += [P('Your company’s address, phone, NTN and GST number are <b>already entered</b> when the app is '
        'first opened, so bills and tax invoices print correctly from day one. Open <b>Settings</b> to '
        'see them. If anything is wrong, or changes later, simply type over it and press <b>Save</b> — '
        'what you type is kept and never overwritten.', BODY)]
S += [table([['Setting','Haramain Marketing Services','Faisal Enterprises'],
  ['Address','H#23, Railway Scheme IV, Chaklala, Rawalpindi, Pakistan','IJP Road, Khayaban-e-Sir Syed, Rawalpindi'],
  ['Phone','0307-3976382','0314-5360901, 0333-1550788'],
  ['Business NTN','4216176-2','J617125-4'],
  ['Business GST No.','32-77-8761-761-26','(blank — add it when you have it)'],
  ['GST Rate %','18','18']],
  [3.2*cm, (doc.width-3.2*cm)/2, (doc.width-3.2*cm)/2])]
S += [Spacer(1,8), figure('10-settings.png', 'Settings — appearance, your company details and GST, day open/close, and your saved vans, bookers and delivery men.')]
S += [P('<b>GST Rate %</b> is used by the Sales Tax Invoice (section 14). The rate is treated as '
        '<b>included in your selling price</b>, exactly like the sample invoice: a piece at Rs 118.33 '
        'is Rs 100.28 plus Rs 18.05 GST. <b>Default Tax %</b> is different — leave it at 0 unless you '
        'want a tax line added on top of ordinary bills.', BODY)]

# ── 4 PRODUCTS ───────────────────────────────────────────────────
S += [PageBreak(), P('4. Products', H1)]
S += [P('Everything you sell is listed here. Press <b>+ Add Product</b> and fill in the code (the '
        'number your team already uses), name, how many pieces make a dozen, the cost you pay and the '
        'rate you sell at. The app works out your margin.', BODY)]
S += [figure('02-products.png', 'The Products list. Stock is shown in pieces and dozens; low stock turns red.')]
S += [P('You do not have to type stock in here — it comes in through <b>Purchases</b> (section 13) and '
        'goes out as you bill. The <b>Min</b> column is your low-stock warning level: when stock falls '
        'to it or below, the product appears in Low Stock on the Dashboard.', BODY)]

# ── 5 SCHEMES ────────────────────────────────────────────────────
S += [PageBreak(), P('5. Schemes (free goods &amp; trade offers)', H1)]
S += [P('A scheme is a deal you give the shops, and the app applies it for you when you save a bill.', BODY)]
S += [P('<b>Free Goods</b> — “buy so many pieces, get so many free”. Choose the product, the buy '
        'quantity and the free quantity. <b>Trade Offer</b> — an amount off the bill once it reaches a '
        'minimum value.', BODY)]
S += [figure('03-schemes.png', 'Schemes, each with its own date. Switch one off with Active = No instead of deleting it.')]
S += [note('The scheme’s <b>name is never printed on the customer’s bill</b> — the free pieces simply '
           'appear as a FREE line. You can also switch schemes off for one particular bill (section 17).')]

# ── 6 SHOPS ──────────────────────────────────────────────────────
S += [PageBreak(), P('6. Shops', H1)]
S += [P('Your customers. Each shop has a code, name, address, and — for tax invoices — a phone number, '
        'NTN and CNIC. When you type a shop code on a new bill, the name and address fill in by '
        'themselves.', BODY)]
S += [figure('09-shops.png', 'The Shops list. You can search it as you type.')]
S += [P('You do not have to add shops in advance. Any new code and name you use on a bill is saved '
        'here automatically.', BODY)]

# ── 7 NEW BILL ───────────────────────────────────────────────────
S += [PageBreak(), P('7. Making a bill', H1)]
S += [P('This is the screen you will use most. Press <b>New Bill</b> in the menu, or <b>Ctrl+N</b> '
        'from anywhere.', BODY)]
S += [figure('04-new-bill.png', 'A bill being entered. Totals on the right update as you type.')]
S += [P('<b>The route bar (green box at the top).</b> Van, Order Booker and Delivery Man. Set them '
        'once — they stay for every following bill, so you can bill a whole van’s round without '
        'retyping. Click into the box to pick from your saved names.', BODY)]
S += [P('<b>The shop.</b> Type the Shop Code and the name and address appear. For a new shop, just type '
        'the code and name — it will be remembered.', BODY)]
S += [P('<b>The items.</b> Type the product code and the rest of the line fills in. Enter the quantity '
        'as <b>Dozen</b>, or <b>Loose Pcs</b>, or both; Total Pcs is worked out for you. The <b>Type</b> '
        'box is SALE for normal goods, <b>REPLACE</b> for replacements and <b>FREE</b> for a give-away — '
        'replace and free lines go onto the van but are not charged. The <b>T.O</b> box gives a trade '
        'offer on that one product.', BODY)]
S += [P('The totals on the right show subtotal, tax, trade offer, discount and the final <b>Payable</b>. '
        'Any matching free-goods scheme is added when you press <b>Save &amp; Next</b> (or Ctrl+S). '
        'After saving, the screen is ready for the next shop.', BODY)]
S += [note('<b>Handy to know:</b> the same shop cannot be billed on the same van twice in one day (the '
           'next day is fine) — this stops accidental double billing. You can also tick '
           '<b>“Do not apply any scheme / discount to this bill”</b> for a shop that gets no deal, and '
           'the whole bill can be typed <b>without the mouse</b> — see section 17.')]

# ── 8 BILLS ──────────────────────────────────────────────────────
S += [PageBreak(), P('8. Finding, printing and invoicing bills', H1)]
S += [P('The <b>Bills</b> screen lists everything you have made, with filters for van, booker, delivery '
        'man, dates, and a search box.', BODY)]
S += [figure('06-bills.png', 'The Bills list. Each row can be viewed, edited, printed or deleted.')]
S += [P('Open a bill to see it in full and to use the buttons at the top:', BODY)]
S += [bullets([
    '<b>Edit</b> — change quantities or remove items (section 16).',
    '<b>Sales Tax Invoice</b> — a GST invoice for this bill (section 14).',
    '<b>Download PDF</b> — save the bill as a PDF file, without opening the print dialog.',
    '<b>Print</b> — print the memo (Ctrl+P).',
])]
S += [Spacer(1,7), figure('05-bill-detail.png', 'A saved bill. The FREE line came from a scheme; T.O is a per-item trade offer.')]
S += [P('Print preview', H2)]
S += [P('Pressing <b>Print</b> anywhere in the app — a bill, a tax invoice, a bill summary, a load form '
        'or the Profit / Loss report — first shows a <b>preview of the exact sheet</b> that will come out '
        'of the printer. From there press <b>Print</b> to send it to the printer, <b>Save as PDF</b> to '
        'keep it as a file, or <b>Close</b> to go back (Esc also closes it). Nothing is printed until you '
        'choose, so you never waste paper checking a bill.', BODY)]
S += [figure('19-print-preview.png', 'The print preview — check the sheet before using any paper.', maxh=11*cm)]
S += [P('To print several at once, tick the bills in the list and press <b>Print selected</b>, or use '
        '<b>Print all</b>. Deleting a bill puts its stock back automatically.', BODY)]

# ── 9 LOAD FORMS ─────────────────────────────────────────────────
S += [PageBreak(), P('9. Load forms for the van', H1)]
S += [P('A load form gathers all of a van’s bills into one sheet for the driver — how much of each '
        'product to load, and columns to fill in when he returns.', BODY)]
S += [P('Press <b>Load Forms → + Generate Load Form</b>, choose the date and van, press <b>Find Bills</b>, '
        'tick the bills to include, and press <b>Generate</b>.', BODY)]
S += [figure('07-load-list.png', 'The Load Forms list, with filters for van and dates.')]
S += [figure('08-load-detail.png', 'A load form: total issue per product, and the check columns for the return.')]
S += [P('Press <b>Print</b> to give the driver a paper copy.', BODY)]

# ── 10 RETURNS ───────────────────────────────────────────────────
S += [PageBreak(), P('10. When the van comes back', H1)]
S += [P('Open the load form and fill in the check columns against each product:', BODY)]
S += [table([['Column','What it means'],
  ['Load 2','A second load sent out during the day.'],
  ['RTG','Returned good stock — unsold pieces that came back in good condition.'],
  ['Dented / Leak','Damaged pieces that came back.'],
  ['Replace','Pieces given to shops as replacements (not charged).'],
  ['Free','Free pieces given from schemes.']], [3.2*cm, doc.width-3.2*cm])]
S += [Spacer(1,8), P('Press <b>Save Check Columns</b> as you go, and <b>Mark Closed</b> when the van is '
        'settled. Closing the load <b>puts the RTG pieces back into your stock automatically</b> — so '
        'your inventory stays right without any extra work. Closing twice will not add them twice.', BODY)]

# ── 11 PROFIT ────────────────────────────────────────────────────
S += [PageBreak(), P('11. Profit / Loss', H1)]
S += [P('Sales, cost and profit for any period. The cards at the top show today, this week, this month '
        'and this year. Below, choose your own dates and group the figures by day, week, month or year.', BODY)]
S += [figure('11-profit.png', 'Profit / Loss — period cards, charts, what your schemes cost, and a full breakdown.')]
S += [P('Profit is sales minus the cost of the goods sold, so keep each product’s <b>Cost</b> up to date '
        '(recording purchases does this for you). Use <b>Print</b> or <b>Download PDF</b> at the top '
        'right to save or print the report.', BODY)]
S += [P('What your schemes cost', H2)]
S += [P('Schemes are already taken off your profit — the app does not show profit as if you never gave '
        'anything away. A <b>trade offer or discount</b> reduces the bill, so it reduces sales. <b>Free '
        'goods</b> do not reduce the bill, but the pieces came out of your stock, so they are counted at '
        'what they cost you to buy. Replacements are treated the same way.', BODY)]
S += [P('The <b>“What schemes &amp; offers cost you”</b> panel shows all of this in one place — free '
        'pieces given (at cost, and what they were worth at your selling rate), trade offers, discounts, '
        'and a total. The line at the bottom spells it out: what the profit would have been before any '
        'scheme, and what it is after. Use it to judge whether a deal is worth continuing.', BODY)]

# ── 12 DASH INVENTORY ────────────────────────────────────────────
S += [PageBreak(), P('12. The Dashboard’s two views', H1)]
S += [P('At the top of the Dashboard you can switch between <b>Daily Sales</b> and <b>Inventory</b>. '
        'The Inventory view shows how much stock you are holding — total pieces and total value, both '
        'at cost and at selling rate — with a line for every product.', BODY)]
S += [figure('12-dash-inventory.png', 'The Inventory view — total pieces and stock value, with a per-product breakdown.')]

# ── 13 PURCHASES ─────────────────────────────────────────────────
S += [PageBreak(), P('13. Purchases — recording stock you buy in', H1)]
S += [P('When new stock arrives, open <b>Purchases</b> and press <b>+ New Purchase</b>. Enter the date, '
        'vehicle number and supplier, then add a line for each product. Type the product code and its '
        'cost fills in automatically; the amount is pieces × cost.', BODY)]
S += [figure('14-purchase-form.png', 'Recording a purchase — type a code and the cost auto-fills; the amount is worked out for you.')]
S += [P('When you save, the pieces are <b>added to your stock</b> and each product’s cost is updated to '
        'the new purchase price, so your profit figures stay accurate. Every purchase is listed, and '
        'deleting one removes its stock again.', BODY)]
S += [figure('13-purchases.png', 'The Purchases list.')]

# ── 14 TAX INVOICE ───────────────────────────────────────────────
S += [PageBreak(), P('14. The Sales Tax Invoice (GST)', H1)]
S += [P('For customers who need a GST invoice, open the bill and press <b>Sales Tax Invoice</b>. The app '
        'produces a proper tax invoice with your logo, your business NTN and GST number, the customer’s '
        'NTN, and a full GST breakdown for every line — trade price, per-unit GST, amount before GST, '
        'total GST and total amount. Each invoice gets its own number, and re-opening it shows the same '
        'number rather than issuing a new one.', BODY)]
S += [figure('15-tax-invoice.png', 'A Sales Tax Invoice. The rate is treated as GST-inclusive at the rate set in Settings.')]
S += [P('The customer’s NTN comes from the shop record (section 6). Use <b>Download PDF</b> to save the '
        'invoice as a file to send, or <b>Print</b> for a paper copy.', BODY)]

# ── 15 BILL SUMMARY ──────────────────────────────────────────────
S += [PageBreak(), P('15. The Bill Summary (per van)', H1)]
S += [P('On the <b>Bills</b> screen, choose a van (and a date range) in the filter, then press '
        '<b>Bill Summary</b>. You get a one-page summary of every bill for that van — shop, free amount, '
        'trade offer, discounts and total — with a grand total, ready to print or save as a PDF.', BODY)]
S += [figure('16-bill-summary.png', 'A per-van Bill Summary with a grand total.')]

# ── 16 EDIT / RETURNS / DAY CLOSE ────────────────────────────────
S += [PageBreak(), P('16. Editing bills, returns and closing dates', H1)]
S += [P('<b>Edit a bill.</b> On the Bills screen (or from an open bill) press <b>Edit</b>. The bill opens '
        'in the bill screen; change quantities, remove lines or add items, then <b>Save Changes</b>. '
        'Stock is corrected automatically — pieces you remove go back into stock, pieces you add come '
        'out of it.', BODY)]
S += [P('<b>Van returns (RTG).</b> When a van comes back with unsold good stock, enter the pieces in the '
        '<b>RTG</b> column of its load form and press <b>Mark Closed</b>. Those pieces are added back '
        'into stock (section 10).', BODY)]
S += [P('<b>Closing a date.</b> In <b>Settings → Day open / close</b> you can close a date. Once closed, '
        'no bills can be added or edited for that day — useful after the day’s accounts are settled. '
        'Re-open it at any time to allow changes again.', BODY)]
S += [note('Closing a date does not stop you recording purchases or looking at reports — it only locks '
           'the billing for that day.')]

# ── 17 MASTERS / OPTIONS / KEYBOARD ──────────────────────────────
S += [PageBreak(), P('17. Vans &amp; staff, scheme options, and fast entry', H1)]
S += [P('<b>Vans, bookers &amp; delivery men.</b> Add these once in <b>Settings</b> so they appear as '
        'dropdowns on every new bill. Any new name you type on a bill is also saved there automatically, '
        'and you can remove one you no longer use with the ✕ beside it.', BODY)]
S += [P('<b>Scheme options.</b> Each scheme can carry a <b>date</b>, and on a bill you can tick '
        '<b>“Do not apply any scheme / discount to this bill”</b> to bill a shop at plain prices. Scheme '
        'names are never printed on the customer’s bill — only the free line shows.', BODY)]
S += [P('<b>Per-line trade offer.</b> On New Bill each item has a <b>T.O</b> box, so you can give a trade '
        'offer on a single product; it comes off the bill total.', BODY)]
S += [P('<b>Instant search.</b> The Products and Shops screens have a search box — start typing a code, '
        'name or phone number and the list filters as you type. Long lists keep their column headings '
        'visible while you scroll.', BODY)]
S += [figure('18-products-search.png', 'Typing in the search box filters the list instantly.')]

# ── 18 SHORTCUTS ─────────────────────────────────────────────────
S += [PageBreak(), P('18. Keyboard shortcuts — work faster', H1)]
S += [P('The whole app can be driven from the keyboard. Press <b>F1</b> at any time (or the <b>Keys</b> '
        'button at the bottom-left) to see this list inside the app.', BODY)]
hk = [['Keys','What it does'],
 [P('Alt + 1 … 9, 0', TDb),'Jump straight to a screen, in menu order — 1 Dashboard, 2 Profit/Loss, 3 New Bill, 4 Bills, 5 Load Forms, 6 Products, 7 Schemes, 8 Shops, 9 Purchases, 0 Settings.'],
 [P('Ctrl + N', TDb),'Start a New Bill from anywhere.'],
 [P('Enter', TDb),'On New Bill: move to the next box. On the last box of an item line it adds a new line — so you can bill without touching the mouse.'],
 [P('Ctrl + S', TDb),'Save — the bill, purchase or settings you are on.'],
 [P('Ctrl + P', TDb),'Print whatever is open — a bill, tax invoice, bill summary or the Profit / Loss report.'],
 [P('Ctrl + F', TDb),'Jump to the search / filter box on the screen.'],
 [P('Esc', TDb),'Close a popup, or cancel a bill edit.'],
 [P('Ctrl + =  /  Ctrl + −', TDb),'Make the text bigger or smaller.'],
 [P('F1', TDb),'Show the shortcut list.']]
S += [table(hk, [4.3*cm, doc.width-4.3*cm]), Spacer(1,9)]
S += [figure('17-hotkeys.png', 'Press F1 anywhere to see the shortcuts.', maxh=11*cm)]

# ── 19 ROUTINE ───────────────────────────────────────────────────
S += [PageBreak(), P('19. Your everyday routine', H1)]
routine = [['#','Each day','Where'],
 ['1','Record any new stock that arrived','Purchases → + New Purchase'],
 ['2','Make a bill for each shop','New Bill (Ctrl+N)'],
 ['3','Give GST customers a tax invoice','Bill → Sales Tax Invoice'],
 ['4','Generate a load form for each van','Load Forms → Generate'],
 ['5','Print the load form for the driver','Load Form → Print'],
 ['6','On return, fill the check columns (RTG) and close','Load Form → Save / Mark Closed'],
 ['7','Check per-van totals and profit','Bills → Bill Summary · Profit / Loss'],
 ['8','Close the date once the day is settled','Settings → Day open / close']]
S += [table(routine, [1.1*cm, doc.width-1.1*cm-6.2*cm, 6.2*cm])]
S += [Spacer(1,10), P('A typical van round: set the Van, Booker and Delivery Man once, then bill shop '
        'after shop — code, quantities, Ctrl+S, next shop. When the round is booked, generate that '
        'van’s load form and print it.', BODY)]

# ── 20 TIPS ──────────────────────────────────────────────────────
S += [PageBreak(), P('20. Tips, backups and problems', H1)]
S += [P('Backups', H2)]
S += [P('Open <b>Settings → Data, backup &amp; starting fresh</b>. It tells you how much is stored and where.', BODY)]
S += [bullets([
  '<b>Save a backup</b> — writes your whole business to a single file. Keep it on a USB stick or in a cloud folder; weekly at least.',
  '<b>Restore from backup</b> — puts a backup file back. A safety copy of the current data is taken first, so nothing is lost by accident.',
  '<b>Open backup folder</b> — shows the automatic backups the app takes before any data is deleted.',
])]
S += [P('To move to a new computer: copy the app folder across, open it once, then use '
        '<b>Restore from backup</b> with a backup from the old machine.', BODY)]
S += [P('Starting fresh', H2)]
S += [P('Unzipping a newer copy of the app does <b>not</b> clear your data — the information lives on the '
        'computer, not in the app folder, which is what lets you update without losing anything. When you '
        'genuinely want a clean start (after testing, or before handing the app to someone else), use the '
        '<b>Start fresh</b> section:', BODY)]
S += [bullets([
  '<b>Clear bills, loads &amp; purchases</b> — wipes the day-to-day records but keeps your products, shops, schemes and company details. This is the one to use after a test run.',
  '<b>Erase everything</b> — puts the app back to the day it was installed. Your company name, address, NTN and GST are filled in again automatically.',
])]
S += [P('Both ask for the word <b>RESET</b> to be typed, and for the <b>owner PIN</b> if one is set — and '
        'both take an automatic backup first, so a mistake can always be undone.', BODY)]
S += [figure('20-data-reset.png', 'Settings — backups, and the protected “Start fresh” section.', maxh=13.5*cm)]
S += [P('Set an owner PIN at the bottom of the same card if you want to stop staff clearing the data.', BODY)]
S += [P('Everyday tips', H2)]
S += [bullets([
    '<b>Press F1</b> any time to see every keyboard shortcut.',
    '<b>Enter the day’s purchases first</b>, so stock and costs are right before you bill.',
    '<b>Let the app remember things</b> — shops, vans, bookers and delivery men all save themselves as you work.',
    '<b>Use Download PDF</b> when a customer wants the bill or invoice by WhatsApp or email; the page is trimmed to fit, so you do not waste paper when printing.',
    '<b>Do not delete a scheme</b> you may use again — set Active to No instead.',
    '<b>Check Low Stock</b> on the Dashboard before placing your next order.',
])]
S += [P('If something goes wrong', H2)]
S += [table([['What you see','What to do'],
 ['“Windows protected your PC” on opening','Click <b>More info → Run anyway</b>. Only appears the first time.'],
 ['A message that the shop is already billed','That shop was already billed on that van today. Bill it tomorrow, or edit the existing bill.'],
 ['A message that the date is closed','The date was closed in Settings. Re-open it there to add or edit bills.'],
 ['“Insufficient stock” when saving','You are billing more pieces than you hold. Record the purchase first (section 13).'],
 ['The screen looks blank or stuck','Close the app and open it again. Your information is saved as you go — nothing is lost.'],
 ['A number looks wrong on a report','Check the product’s <b>Cost</b> and <b>Rate</b> in Products — profit is worked out from them.']],
 [5.6*cm, doc.width-5.6*cm])]
S += [Spacer(1,10), note('Still stuck? Note the screen you were on and what you were doing, and send that '
                         'with a photo of the message — it makes the fix much quicker.')]

doc.build(S)
print('WROTE', OUT, os.path.getsize(OUT), 'bytes')
