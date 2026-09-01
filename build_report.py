#!/usr/bin/env python3
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Image, Table, TableStyle, KeepTogether, PageBreak)

SHOTS = '/home/claude/shots/out'
OUT = '/mnt/user-data/outputs/StockManager-Test-Run-Report.pdf'
NAVY = colors.HexColor('#1d4f91'); DARK = colors.HexColor('#1b2430')
GREY = colors.HexColor('#5b6472'); LINE = colors.HexColor('#c9cfda')
OKG = colors.HexColor('#1f7a3d'); SOFT = colors.HexColor('#eef2f8')

ss = getSampleStyleSheet()
def st(n, **kw): return ParagraphStyle(n, parent=ss['Normal'], **kw)
H1 = st('H1', fontName='Helvetica-Bold', fontSize=15, textColor=NAVY, spaceBefore=2, spaceAfter=7, leading=19)
BODY = st('B', fontSize=9.8, textColor=DARK, leading=14, spaceAfter=6)
CAP = st('C', fontName='Helvetica-Oblique', fontSize=8.4, textColor=GREY, leading=11, spaceAfter=9)
TD = st('TD', fontSize=8.8, textColor=DARK, leading=12)
TDb = st('TDb', fontName='Helvetica-Bold', fontSize=8.8, textColor=DARK, leading=12)
TH = st('TH', fontName='Helvetica-Bold', fontSize=8.6, textColor=colors.white, leading=11.5)
PASS = st('P', fontName='Helvetica-Bold', fontSize=8.8, textColor=OKG, leading=12)

def P(t, s=BODY): return Paragraph(t, s)

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=1.6*cm, rightMargin=1.6*cm,
                      topMargin=1.4*cm, bottomMargin=1.5*cm, title='Stock Manager — Test Run Report')
def foot(cv, d):
    cv.saveState(); cv.setFont('Helvetica', 8); cv.setFillColor(GREY)
    cv.drawString(doc.leftMargin, 1.0*cm, 'Stock Manager — Test Run Report')
    cv.drawRightString(A4[0]-doc.rightMargin, 1.0*cm, f'Page {d.page}')
    cv.restoreState()
doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)], onPage=foot)])

def figure(fn, cap, maxh=11.5*cm):
    p = os.path.join(SHOTS, fn)
    if not os.path.exists(p): return Spacer(1, 1)
    iw, ih = ImageReader(p).getSize()
    w = doc.width; h = w*ih/iw
    if h > maxh: h = maxh; w = h*iw/ih
    im = Image(p, width=w, height=h); im.hAlign = 'CENTER'
    box = Table([[im]], colWidths=[w])
    box.setStyle(TableStyle([('BOX',(0,0),(-1,-1),0.6,LINE),('LEFTPADDING',(0,0),(-1,-1),0),
        ('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    box.hAlign='CENTER'
    return KeepTogether([box, Spacer(1,4), P(cap, CAP)])

def tbl(rows, widths):
    data=[[P(c,TH) if r==0 else (c if isinstance(c,Paragraph) else P(str(c),TD)) for c in row] for r,row in enumerate(rows)]
    t=Table(data,colWidths=widths,repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f4f6f9')]),
        ('GRID',(0,0),(-1,-1),0.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
        ('TOPPADDING',(0,0),(-1,-1),3.5),('BOTTOMPADDING',(0,0),(-1,-1),3.5)]))
    return t

S=[]
band=Table([[P('<font color="white" size="19"><b>Stock Manager — Test Run Report</b></font><br/>'
               '<font color="white" size="11">Every test from the checklist, run against the real app</font>',BODY)]],colWidths=[doc.width])
band.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NAVY),('LEFTPADDING',(0,0),(-1,-1),14),
    ('RIGHTPADDING',(0,0),(-1,-1),14),('TOPPADDING',(0,0),(-1,-1),13),('BOTTOMPADDING',(0,0),(-1,-1),13)]))
S+=[band,Spacer(1,10)]

hdr=Table([[P('<b>Result</b>',TDb),P('<font color="#1f7a3d"><b>All 34 checks passed</b></font>',TDb)],
           [P('<b>Run on</b>',TDb),P('Haramain Marketing Services build (full checklist) + Faisal Enterprises build (edition tests)',TD)],
           [P('<b>How</b>',TDb),P('The real packaged app was driven automatically end to end. Every figure below was read back out of the app, not typed by hand.',TD)],
           [P('<b>Bugs found</b>',TDb),P('One — <b>“Clear bills, loads &amp; purchases” silently failed</b> when load forms or tax invoices existed (a database rule refused the delete order). Found by this run, fixed, and re-tested. The build attached now passes.',TD)]],
          colWidths=[2.6*cm, doc.width-2.6*cm])
hdr.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),
    ('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
S+=[hdr,Spacer(1,12)]

S+=[P('Results at a glance',H1)]
rows=[['Test','What was checked','Result']]
res=[
 ('T-01/26','Company address, phone, NTN, GST pre-filled; owner edits survive restart; blanks refill','NTN 4216176-2, GST 32-77-8761-761-26, rate 18%'),
 ('T-02','Vans / bookers / delivery men: add, remove, re-add, appear as dropdowns','VAN 01, VAN 02, SAQIB, AZHAR'),
 ('T-03','Products with cost and rate; margin worked out','18.9% / 20.0% / 20.8% as expected'),
 ('T-04','Shop stores phone, NTN and CNIC','all three saved on shop 4542'),
 ('T-05','Scheme carries a date','saved with today’s date'),
 ('T-06','Purchase adds stock and updates cost','Rs 72,000.00; stock 600/480/240; 208 cost → Rs 97'),
 ('T-07','Dashboard inventory view: pieces and value','1,320 pieces, Rs 72,000.00 at cost'),
 ('T-08','Bill saves with the right total','HMS-20260829-001 = Rs 15,619.56'),
 ('T-09','Free goods appear; scheme name never printed','FREE line 6 pcs; no scheme name on the memo'),
 ('T-10','“No scheme for this bill” switch','no FREE line despite 132 pcs; new shop auto-saved'),
 ('T-11','Per-line trade offer comes off the total','Rs 1,440.00 → Rs 1,390.00'),
 ('T-12','Same shop + same van + same day refused','refused today, allowed tomorrow'),
 ('T-13','Memo layout','business NTN/GST, Dozen/Pcs/Rate/Amount, Delivered-By left, Booker right'),
 ('T-14','Direct PDF download, paper-saving page','1 page, 210 × 171 mm (not a full A4)'),
 ('T-15','GST Sales Tax Invoice','invoice no 1, same on re-open; 118.33 → 100.28 + 18.05 GST'),
 ('T-16','Per-van Bill Summary','3 rows for VAN 01, grand total Rs 17,153.56'),
 ('T-17','Edit a bill; stock corrects itself','132 → 60 pcs = Rs 7,099.80; 78 pcs returned to stock'),
 ('T-18','Load form van filter','shows under VAN 01, hidden under VAN 02'),
 ('T-19','Keyboard billing','Enter moves field to field; Enter on last box adds a line'),
 ('T-19rtg','RTG returns to stock, once only','408 → 432; closing again did not double it'),
 ('T-20','Closed date blocks billing and edits','blocked, then allowed after re-opening'),
 ('T-21','Profit / Loss figures and pie','sales Rs 24,253.36, profit Rs 4,363.36 (17.99%)'),
 ('T-21b','Scheme cost shown and deducted','6 free pcs Rs 582 + offers Rs 325 → profit Rs 7,260.96 before vs Rs 6,353.96 after'),
 ('T-22','Hotkeys','Alt+4, Alt+1, Ctrl+N, F1 and Esc all correct'),
 ('T-23','Instant search','typing “500” filtered 3 rows → 2'),
 ('T-24','Speed','five screens opened in 646 ms'),
 ('T-25','Editions kept separate','Faisal Enterprises, bills FE-…, red theme, own data file'),
 ('T-27','Logo in the app and on printed bills','sidebar logo + embedded in the memo'),
 ('T-28','Old Moon data carried over','legacy Moon product found after the rename'),
 ('T-29','Windows file details and icon','both exes name the company, 6 icon sizes'),
 ('T-30','Print shows a preview first','preview sheet on bills and on Profit / Loss'),
 ('T-31','No blank first page','exactly 1 A4 page, bill on page 1'),
 ('T-32','Backup and restore','156 KB backup; restore brought back 6 bills / 1 purchase'),
 ('T-33','Reset guards, PIN, safety backup','refused without RESET and with a wrong PIN; correct PIN cleared records but kept catalogue; auto-backup written'),
]
for a,b,c in res: rows.append([P(f'<b>{a}</b>',TDb),P(b,TD),P('PASS — '+c,PASS)])
S+=[tbl(rows,[1.5*cm, 6.3*cm, doc.width-1.5*cm-6.3*cm])]

def sec(title, fn, cap, body=None, maxh=11.5*cm):
    out=[PageBreak(), P(title,H1)]
    if body: out.append(P(body))
    out.append(figure(fn,cap,maxh))
    return out

S+=sec('Purchases — stock in (T-06)','t06-purchases.png',
  'The purchase of Rs 72,000 recorded against vehicle ABC-123; stock and costs updated from it.')
S+=sec('Dashboard — inventory view (T-07)','t07-inventory.png',
  'Total pieces and stock value at cost and at sale rate, with a line per product.')
S+=sec('A saved bill (T-08, T-09, T-11, T-13)','t13-bill-detail.png',
  'The FREE line came from the scheme; the scheme name is not shown. T.O is the per-line trade offer.')
S+=sec('Print preview (T-30, T-31)','t30-print-preview.png',
  'Pressing Print now shows the exact sheet first, with Print / Save as PDF / Close. Printing produces one page — no blank sheet in front.')
S+=sec('GST Sales Tax Invoice (T-15)','t15-tax-invoice.png',
  'Business and customer NTN, own invoice number, and GST worked out from the trade price at 18%.')
S+=sec('Bill Summary per van (T-16)','t16-bill-summary.png',
  'Every bill for VAN 01 with free amount, trade offer, discounts and a grand total.')
S+=sec('Bill after editing (T-17)','t17-edited-bill.png',
  'The bill was edited from 11 dozen down to 5; the total dropped to Rs 7,099.80 and 78 pieces went back into stock automatically.')
S+=sec('Load form and RTG return (T-18, T-19)','t19-load-detail.png',
  'The load sheet with the return columns. Closing it put the 24 RTG pieces back into stock — and only once.')
S+=sec('Day open / close (T-20)','t20-settings-dayclose.png',
  'With the date closed, new bills and edits for that day are refused until it is re-opened.')
S+=sec('Profit / Loss (T-21)','t21-profit-loss.png',
  'Period cards, sales chart, cost-vs-profit pie and the full breakdown.')
S+=sec('What schemes cost (T-21b)','t21b-scheme-cost.png',
  'Free goods, trade offers and discounts listed separately, with profit before and after schemes — proving the scheme money is taken out of profit.')
S+=sec('Keyboard shortcuts (T-22)','t22-hotkeys.png','Press F1 anywhere; Esc closes it.')
S+=sec('Instant search (T-23)','t23-search.png','Typing filters the list as you type.')
S+=sec('Data, backup and starting fresh (T-32, T-33)','t33-data-reset.png',
  'Backup, restore, and the protected reset. Both reset buttons need the word RESET and the owner PIN, and take an automatic backup first.')
S+=sec('After clearing the records (T-33)','t33-after-clear.png',
  'Bills, load forms and purchases gone — products, shops and company details kept.')
S+=sec('After restoring the backup (T-32)','t32-after-restore.png',
  'The same backup put everything back exactly as it was.')
S+=sec('Faisal Enterprises edition (T-25, T-28)','t25-faisal-dashboard.png',
  'Its own red branding, logo, FE bill numbers and separate data — and the old Moon Marketing data carried over automatically.')
S+=sec('Faisal printed bill (T-27)','t27-faisal-memo.png',
  'The Faisal logo, address, phone and NTN print on the memo with no setup needed.')

doc.build(S)
print('WROTE', OUT, os.path.getsize(OUT), 'bytes')
