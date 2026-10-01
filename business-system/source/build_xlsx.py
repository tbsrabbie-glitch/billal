import json, sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L

OUT = sys.argv[1]
PLAN = json.load(open(sys.argv[2]))

F = 'Arial'
NAVY = '1F3864'
f_base = Font(name=F, size=10)
f_bold = Font(name=F, size=10, bold=True)
f_head = Font(name=F, size=10, bold=True, color='FFFFFF')
f_title = Font(name=F, size=16, bold=True, color=NAVY)
f_sub = Font(name=F, size=10, italic=True, color='595959')
f_input = Font(name=F, size=10, color='0000FF')
f_link = Font(name=F, size=10, color='008000')
f_sect = Font(name=F, size=11, bold=True, color=NAVY)
fill_head = PatternFill('solid', fgColor=NAVY)
fill_input = PatternFill('solid', fgColor='FFFF00')
fill_sect = PatternFill('solid', fgColor='DDEBF7')
fill_total = PatternFill('solid', fgColor='F2F2F2')
fill_calc = PatternFill('solid', fgColor='F2F2F2')
fill_example = PatternFill('solid', fgColor='FCE4D6')
thin = Side(style='thin', color='BFBFBF')
box = Border(top=thin, bottom=thin, left=thin, right=thin)
top_line = Border(top=Side(style='thin', color='000000'))
RS = '#,##0;(#,##0);"-"'
PCT = '0.0%;(0.0%);"-"'
DATE = 'dd-mmm-yyyy'
MON = 'mmm yyyy'
WRAP = Alignment(wrap_text=True, vertical='top')

wb = Workbook()

def sheet(name, title, subtitle, widths):
    ws = wb.create_sheet(name)
    ws['A1'] = title; ws['A1'].font = f_title
    ws['A2'] = subtitle; ws['A2'].font = f_sub
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[L(i)].width = w
    ws.sheet_view.showGridLines = False
    return ws

def header(ws, row, labels, col=1):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=lab)
        c.font = f_head; c.fill = fill_head; c.alignment = Alignment(wrap_text=True, vertical='center'); c.border = box
    ws.row_dimensions[row].height = 30

def inp(c, fmt=None):
    c.font = f_input; c.fill = fill_input; c.border = box
    if fmt: c.number_format = fmt

def calc(c, fmt=None, bold=False):
    c.font = f_bold if bold else f_base; c.border = box
    if fmt: c.number_format = fmt

# =====================================================================
# SETUP
# =====================================================================
st = sheet('Setup', 'Setup: your business profile, accounts and categories',
           'Fill the yellow cells once. Everything else in the workbook reads from here.', [36, 22, 22, 60])
profile = [
    ('Business name', 'Your Business Name', None, 'Trading name used on invoices.'),
    ('Owner(s)', 'Owner name', None, 'Who owns the business.'),
    ('Financial year starts', dt.date(2026, 4, 1), DATE, 'Sri Lanka tax year runs 1 April – 31 March. The P&L and Cash Flow start here.'),
    ('Currency', 'LKR (Rs)', None, 'All amounts in Sri Lankan rupees.'),
    ('Tax reserve (% of net profit)', 0.10, PCT, 'Assumption: move this % of each month\'s profit to a separate tax savings account. Ask your accountant for the right % for you.'),
    ('Target owner salary per month (Rs)', 0, RS, 'Fixed amount you pay yourself each month (set this in Week 4).'),
    ('Default invoice payment terms (days)', 14, '0', 'Used on the Invoices sheet when terms are left blank.'),
]
st['A3'] = 'BUSINESS PROFILE'; st['A3'].font = f_sect
for i, (lab, val, fmt, note) in enumerate(profile):
    r = 4 + i
    st.cell(row=r, column=1, value=lab).font = f_base
    c = st.cell(row=r, column=2, value=val); inp(c, fmt)
    st.cell(row=r, column=4, value=note).font = f_sub
# names: B4 name, B6 FY start, B8 tax %, B9 owner pay, B10 terms
SET_FY, SET_TAX, SET_PAY, SET_TERMS = 'Setup!$B$6', 'Setup!$B$8', 'Setup!$B$9', 'Setup!$B$10'

st['A12'] = 'MONEY ACCOUNTS (where money is kept)'; st['A12'].font = f_sect
header(st, 13, ['Account name', 'Opening balance on FY start (Rs)', 'Account number (last 4)', 'Notes'])
accounts = [('Business bank account', 'Main account for the business. All client payments should come here.'),
            ('Cash in hand', 'Physical cash kept for the business.'),
            ('Owner personal account (temporary)', 'Only while business money still passes through a personal account. Aim to stop using it.'),
            ('Tax savings account', 'Separate savings account where you keep the tax reserve.'),
            ('', ''), ('', '')]
ACC_FIRST = 14
for i, (n, note) in enumerate(accounts):
    r = ACC_FIRST + i
    inp(st.cell(row=r, column=1, value=n or None))
    inp(st.cell(row=r, column=2, value=0 if n else None), RS)
    inp(st.cell(row=r, column=3))
    st.cell(row=r, column=4, value=note or None).font = f_sub
ACC_LAST = ACC_FIRST + len(accounts) - 1
st.cell(row=ACC_LAST + 1, column=1, value='Total opening balance').font = f_bold
c = st.cell(row=ACC_LAST + 1, column=2, value=f'=SUM(B{ACC_FIRST}:B{ACC_LAST})'); calc(c, RS, True)
OPEN_TOTAL = f'Setup!$B${ACC_LAST + 1}'
c = st.cell(row=ACC_FIRST, column=2)
c.comment = Comment('Enter the balance of each account on the financial year start date (from the bank statement for 1 April 2026).', 'Setup')

CAT_HEAD = ACC_LAST + 4
st.cell(row=CAT_HEAD - 1, column=1, value='CATEGORIES (the chart of accounts)').font = f_sect
header(st, CAT_HEAD, ['Category', 'Type (do not change)', 'Report section', 'What goes here'])
cats = [
    ('Income', 'Revenue', [
        ('Service fees – main service', 'Fees for your main service. Rename to your service, e.g. "Web design projects".'),
        ('Service fees – second service', 'Rename to your second service, or leave unused.'),
        ('Retainer / monthly fees', 'Fixed monthly fees from ongoing clients.'),
        ('Other income', 'Small one-off income (interest, sale of scrap, etc.).'),
        ('', 'Spare: type a new income category here.')]),
    ('Direct Cost', 'Cost of delivering services', [
        ('Freelancers & subcontractors', 'People paid to deliver client work.'),
        ('Project staff wages', 'Wages of staff who do client work.'),
        ('Project tools & materials', 'Software, materials or printing bought for a specific client job.'),
        ('Project travel', 'Travel to deliver client work.'),
        ('', 'Spare: type a new direct cost here.')]),
    ('Operating Expense', 'Overheads (running costs)', [
        ('Salaries – admin & sales', 'Staff not directly doing client work.'),
        ('EPF / ETF (employer share)', 'Employer EPF 12% and ETF 3% on staff salaries.'),
        ('Rent', 'Office or workspace rent.'),
        ('Electricity & water', 'Utility bills.'),
        ('Internet & phone', 'Broadband, mobile bills, data.'),
        ('Software & subscriptions', 'Tools used to run the business (not for one client).'),
        ('Marketing & advertising', 'Ads, printing, sponsored posts, website.'),
        ('Professional fees', 'Accountant, lawyer, consultants.'),
        ('Bank charges', 'Fees, card charges, transfer fees.'),
        ('Transport & fuel', 'Business travel not linked to one client.'),
        ('Office supplies', 'Stationery, small office items.'),
        ('Training & books', 'Courses and books to build your skills.'),
        ('Repairs & maintenance', 'Fixing equipment, office.'),
        ('Insurance', 'Business insurance.'),
        ('Licences & registration fees', 'Trade licence, business registration, renewals.'),
        ('Other expenses', 'Anything that doesn\'t fit above. Keep this small.'),
        ('', 'Spare'), ('', 'Spare')]),
    ('Owner Drawings', 'Not in P&L: owner', [('Owner drawings / salary', 'Money the owner takes out for personal use. NOT a business expense.')]),
    ('Owner Capital', 'Not in P&L: owner', [('Owner capital introduced', 'Owner\'s own money put into the business.')]),
    ('Loan In', 'Not in P&L: financing', [('Loan received', 'Money borrowed (bank or person).')]),
    ('Loan Repayment', 'Not in P&L: financing', [('Loan repayment', 'Paying back a loan (put interest under Bank charges).')]),
    ('Asset Purchase', 'Not in P&L: assets', [('Equipment & asset purchases', 'Laptops, cameras, furniture: items used for years.')]),
    ('Tax Payment', 'Not in P&L: tax', [('Income tax paid', 'Income tax instalments and final payments to IRD.'),
                                         ('VAT / SSCL paid', 'Only if you are registered for VAT or SSCL.')]),
    ('Transfer', 'Not in P&L: movement', [('Transfer between own accounts', 'Moving money between your own accounts. Enter TWO rows: money out of one account, money in to the other.')]),
]
r = CAT_HEAD + 1
CAT_ROWS = {}
for typ, section, items in cats:
    for name, note in items:
        inp(st.cell(row=r, column=1, value=name or None))
        c = st.cell(row=r, column=2, value=typ); calc(c)
        c = st.cell(row=r, column=3, value=section); calc(c)
        st.cell(row=r, column=4, value=note).font = f_sub
        CAT_ROWS.setdefault(typ, []).append(r)
        r += 1
CAT_FIRST, CAT_LAST = CAT_HEAD + 1, r - 1
CAT_RANGE = f'Setup!$A${CAT_FIRST}:$A${CAT_LAST}'
TYPE_RANGE = f'Setup!$B${CAT_FIRST}:$B${CAT_LAST}'
st.cell(row=r + 1, column=1, value='Tip: rename the yellow category names to match your business, but never change the Type column. '
        'The reports group your money by Type.').font = f_sub
st.freeze_panes = 'A4'

# =====================================================================
# TRANSACTIONS
# =====================================================================
import os
NT = int(os.environ.get("NT", 1500))
T0 = 5
TN = T0 + NT - 1
tx = sheet('Transactions', 'Transactions: the cash book (every rupee in and out)',
           'One row per payment. Yellow = you type. Grey = calculated. Enter money IN or money OUT, never both on one row.',
           [13, 38, 24, 32, 15, 15, 30, 16, 16, 10, 20, 12, 14, 30])
cols = ['Date', 'Description', 'Client / Supplier', 'Category', 'Money IN (Rs)', 'Money OUT (Rs)', 'Account',
        'Method', 'Reference (invoice / receipt no.)', 'Receipt saved?', 'Type (auto)', 'Month (auto)', 'Net (auto)', 'Notes']
header(tx, 4, cols)
dv_cat = DataValidation(type='list', formula1=f'={CAT_RANGE}', allow_blank=True, showErrorMessage=True,
                        errorTitle='Pick a category', error='Choose a category from the list (edit the list on the Setup sheet).')
dv_acc = DataValidation(type='list', formula1=f'=Setup!$A${ACC_FIRST}:$A${ACC_LAST}', allow_blank=True)
dv_meth = DataValidation(type='list', formula1='"Bank transfer,Cash,Card,Cheque,Online payment,Mobile wallet"', allow_blank=True)
dv_yn = DataValidation(type='list', formula1='"Yes,No"', allow_blank=True)
dv_num = DataValidation(type='decimal', operator='greaterThanOrEqual', formula1='0', allow_blank=True,
                        showErrorMessage=True, error='Enter a positive amount. Use Money OUT for payments.')
for dv in (dv_cat, dv_acc, dv_meth, dv_yn, dv_num):
    tx.add_data_validation(dv)
dv_cat.add(f'D{T0}:D{TN}'); dv_acc.add(f'G{T0}:G{TN}'); dv_meth.add(f'H{T0}:H{TN}'); dv_yn.add(f'J{T0}:J{TN}')
dv_num.add(f'E{T0}:F{TN}')
for rr in range(T0, TN + 1):
    for col, fmt in ((1, DATE), (2, None), (3, None), (4, None), (5, RS), (6, RS), (7, None), (8, None), (9, None), (10, None), (14, None)):
        c = tx.cell(row=rr, column=col)
        c.font = f_input; c.border = box
        if fmt: c.number_format = fmt
    tx.cell(row=rr, column=11, value=f'=IF(D{rr}="","",IFERROR(INDEX({TYPE_RANGE},MATCH(D{rr},{CAT_RANGE},0)),"Check category"))')
    tx.cell(row=rr, column=12, value=f'=IF(A{rr}="","",DATE(YEAR(A{rr}),MONTH(A{rr}),1))')
    tx.cell(row=rr, column=13, value=f'=IF(AND(E{rr}="",F{rr}=""),"",N(E{rr})-N(F{rr}))')
    for col, fmt in ((11, None), (12, MON), (13, RS)):
        c = tx.cell(row=rr, column=col); c.font = f_base; c.fill = fill_calc; c.border = box
        if fmt: c.number_format = fmt
# input fill only on the first block of rows to keep it readable; whole area is still typed input
# example row
ex = [dt.date(2026, 4, 3), 'EXAMPLE: Website project, 50% advance', 'ABC Holdings (Pvt) Ltd', 'Service fees – main service',
      150000, None, 'Business bank account', 'Bank transfer', 'INV-001', 'Yes']
for i, v in enumerate(ex, 1):
    c = tx.cell(row=T0, column=i, value=v); c.fill = fill_example
tx.cell(row=T0, column=14, value='Example row: replace or delete it').fill = fill_example
tx['A3'] = 'Legend:'; tx['A3'].font = f_bold
tx['B3'] = 'Blue text = you type  ·  Grey = automatic  ·  Orange = example row (overwrite it)'; tx['B3'].font = f_sub
tx.conditional_formatting.add(f'K{T0}:K{TN}', CellIsRule(operator='equal', formula=['"Check category"'], font=Font(name=F, color='C00000', bold=True)))
tx.freeze_panes = 'C5'
tx.auto_filter.ref = f'A4:N{TN}'

TX = lambda col: f'Transactions!${col}${T0}:${col}${TN}'
T_IN, T_OUT, T_CAT, T_TYPE, T_MON, T_ACC, T_DATE, T_CLI = TX('E'), TX('F'), TX('D'), TX('K'), TX('L'), TX('G'), TX('A'), TX('C')

# =====================================================================
# MONTHLY P&L
# =====================================================================
pl = sheet('Monthly P&L', 'Profit & Loss: did we make money each month?',
           'Fully automatic from the Transactions sheet. Financial year April–March.', [38] + [12] * 12 + [14])
header(pl, 4, ['Line item (Rs)'] + [''] * 12 + ['FY total'])
for m in range(12):
    c = pl.cell(row=4, column=2 + m)
    c.value = f'={SET_FY}' if m == 0 else f'=EDATE({L(1 + m)}4,1)'
    c.number_format = 'mmm yy'
MCOLS = [L(2 + m) for m in range(12)]

def pl_section(ws, start, title, typ, sign_in):
    """sign_in=True: amount = IN - OUT (income). False: OUT - IN (costs)."""
    ws.cell(row=start, column=1, value=title).font = f_sect
    for col in range(1, 15):
        ws.cell(row=start, column=col).fill = fill_sect
    r = start + 1
    rows = []
    for sr in CAT_ROWS[typ]:
        c = ws.cell(row=r, column=1, value=f'=IF(Setup!$A${sr}="","",Setup!$A${sr})'); c.font = f_link; c.border = box
        for m, mc in enumerate(MCOLS):
            a = f'SUMIFS({T_IN},{T_CAT},$A{r},{T_MON},{mc}$4)'
            b = f'SUMIFS({T_OUT},{T_CAT},$A{r},{T_MON},{mc}$4)'
            expr = f'{a}-{b}' if sign_in else f'{b}-{a}'
            c = ws.cell(row=r, column=2 + m, value=f'=IF($A{r}="",0,{expr})'); calc(c, RS)
        c = ws.cell(row=r, column=14, value=f'=SUM(B{r}:M{r})'); calc(c, RS, True)
        rows.append(r); r += 1
    return rows, r

inc_rows, r = pl_section(pl, 5, 'REVENUE (sales)', 'Income', True)
REV = r
pl.cell(row=r, column=1, value='Total revenue').font = f_bold
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=r, column=col, value=f'=SUM({cl}{inc_rows[0]}:{cl}{inc_rows[-1]})'); calc(c, RS, True); c.fill = fill_total
r += 2
dc_rows, r = pl_section(pl, r, 'DIRECT COSTS (cost of delivering the service)', 'Direct Cost', False)
DC = r
pl.cell(row=r, column=1, value='Total direct costs').font = f_bold
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=r, column=col, value=f'=SUM({cl}{dc_rows[0]}:{cl}{dc_rows[-1]})'); calc(c, RS, True); c.fill = fill_total
r += 2
GP = r
pl.cell(row=r, column=1, value='GROSS PROFIT (revenue − direct costs)').font = f_bold
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=r, column=col, value=f'={cl}{REV}-{cl}{DC}'); calc(c, RS, True); c.fill = fill_sect
GPM = r + 1
pl.cell(row=GPM, column=1, value='Gross margin %').font = f_base
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=GPM, column=col, value=f'=IF({cl}{REV}=0,0,{cl}{GP}/{cl}{REV})'); calc(c, PCT)
r = GPM + 2
ox_rows, r = pl_section(pl, r, 'OPERATING EXPENSES (overheads)', 'Operating Expense', False)
OX = r
pl.cell(row=r, column=1, value='Total operating expenses').font = f_bold
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=r, column=col, value=f'=SUM({cl}{ox_rows[0]}:{cl}{ox_rows[-1]})'); calc(c, RS, True); c.fill = fill_total
r += 2
NP = r
pl.cell(row=NP, column=1, value='NET PROFIT (before owner drawings & tax)').font = f_bold
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=NP, column=col, value=f'={cl}{GP}-{cl}{OX}'); calc(c, RS, True); c.fill = PatternFill('solid', fgColor='E2EFDA')
NPM = NP + 1
pl.cell(row=NPM, column=1, value='Net margin %')
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=NPM, column=col, value=f'=IF({cl}{REV}=0,0,{cl}{NP}/{cl}{REV})'); calc(c, PCT)
pl.cell(row=NPM, column=1).font = f_base
TAXRES = NPM + 1
pl.cell(row=TAXRES, column=1, value='Suggested tax reserve (Setup %)').font = f_base
for col in range(2, 15):
    cl = L(col)
    c = pl.cell(row=TAXRES, column=col, value=f'=MAX(0,{cl}{NP})*{SET_TAX}'); calc(c, RS)
for col in range(2, 15):
    pl.cell(row=NP, column=col).border = Border(top=Side(style='medium'), bottom=Side(style='thin'))
pl.conditional_formatting.add(f'B{NP}:N{NP}', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=F, bold=True, color='C00000')))

r = TAXRES + 2
pl.cell(row=r, column=1, value='MEMO: money that is NOT profit or cost').font = f_sect
for col in range(1, 15):
    pl.cell(row=r, column=col).fill = fill_sect
memo = [('Owner drawings taken', 'Owner Drawings', 'OUT'), ('Owner capital put in', 'Owner Capital', 'IN'),
        ('Income tax / VAT / SSCL paid', 'Tax Payment', 'OUT'), ('Equipment & assets bought', 'Asset Purchase', 'OUT'),
        ('Loans received', 'Loan In', 'IN'), ('Loan repayments', 'Loan Repayment', 'OUT')]
MEMO = {}
for lab, typ, d in memo:
    r += 1
    pl.cell(row=r, column=1, value=lab).font = f_base
    for m, mc in enumerate(MCOLS):
        a = f'SUMIFS({T_IN},{T_TYPE},"{typ}",{T_MON},{mc}$4)'
        b = f'SUMIFS({T_OUT},{T_TYPE},"{typ}",{T_MON},{mc}$4)'
        c = pl.cell(row=r, column=2 + m, value=f'={b}-{a}' if d == 'OUT' else f'={a}-{b}'); calc(c, RS)
    c = pl.cell(row=r, column=14, value=f'=SUM(B{r}:M{r})'); calc(c, RS, True)
    MEMO[typ] = r
r += 2
pl.cell(row=r, column=1, value='How to read this: Revenue − Direct costs = Gross profit. Gross profit − Overheads = Net profit. '
        'Owner drawings and tax come OUT of net profit; they are shown in the memo, not as costs.').font = f_sub
pl.freeze_panes = 'B5'

PLR = lambda row: f"'Monthly P&L'!$B${row}:$M${row}"
PL_MONTHS = "'Monthly P&L'!$B$4:$M$4"

# =====================================================================
# CASH FLOW
# =====================================================================
cf = sheet('Cash Flow', 'Cash Flow: where did the money actually go?',
           'Profit is an opinion, cash is a fact. Closing cash should match your real bank + cash balances.', [40] + [12] * 12 + [14])
header(cf, 4, ['Rs'] + [''] * 12 + ['FY total'])
for m in range(12):
    c = cf.cell(row=4, column=2 + m, value=f"='Monthly P&L'!{L(2 + m)}4"); c.number_format = 'mmm yy'
cf.cell(row=5, column=1, value='Opening cash (all accounts)').font = f_bold
for m in range(12):
    c = cf.cell(row=5, column=2 + m, value=f'={OPEN_TOTAL}' if m == 0 else f'={L(1 + m)}22'); calc(c, RS, True)
lines_in = [('From clients (revenue)', 'Income'), ('Refunds on costs', None), ('Owner capital put in', 'Owner Capital'), ('Loans received', 'Loan In')]
cf.cell(row=6, column=1, value='CASH IN').font = f_sect
r = 7
for lab, typ in lines_in:
    cf.cell(row=r, column=1, value=lab).font = f_base
    for m, mc in enumerate(MCOLS):
        if typ:
            v = f'=SUMIFS({T_IN},{T_TYPE},"{typ}",{T_MON},{mc}$4)'
        else:
            v = (f'=SUMIFS({T_IN},{T_TYPE},"Direct Cost",{T_MON},{mc}$4)+SUMIFS({T_IN},{T_TYPE},"Operating Expense",{T_MON},{mc}$4)'
                 f'+SUMIFS({T_IN},{T_TYPE},"Asset Purchase",{T_MON},{mc}$4)+SUMIFS({T_IN},{T_TYPE},"Tax Payment",{T_MON},{mc}$4)')
        c = cf.cell(row=r, column=2 + m, value=v); calc(c, RS)
    r += 1
# r == 11
cf.cell(row=11, column=1, value='Total cash in').font = f_bold
for col in range(2, 14):
    cl = L(col); c = cf.cell(row=11, column=col, value=f'=SUM({cl}7:{cl}10)'); calc(c, RS, True); c.fill = fill_total
cf.cell(row=12, column=1, value='CASH OUT').font = f_sect
lines_out = [('Direct costs paid', 'Direct Cost'), ('Overheads paid', 'Operating Expense'), ('Owner drawings', 'Owner Drawings'),
             ('Tax paid', 'Tax Payment'), ('Equipment & assets', 'Asset Purchase'), ('Loan repayments', 'Loan Repayment'),
             ('Refunds to clients', 'Income')]
r = 13
for lab, typ in lines_out:
    cf.cell(row=r, column=1, value=lab).font = f_base
    for m, mc in enumerate(MCOLS):
        c = cf.cell(row=r, column=2 + m, value=f'=SUMIFS({T_OUT},{T_TYPE},"{typ}",{T_MON},{mc}$4)'); calc(c, RS)
    r += 1
# r == 20
cf.cell(row=20, column=1, value='Total cash out').font = f_bold
for col in range(2, 14):
    cl = L(col); c = cf.cell(row=20, column=col, value=f'=SUM({cl}13:{cl}19)'); calc(c, RS, True); c.fill = fill_total
cf.cell(row=21, column=1, value='Net cash flow (in − out)').font = f_bold
for col in range(2, 14):
    cl = L(col); c = cf.cell(row=21, column=col, value=f'={cl}11-{cl}20'); calc(c, RS, True)
cf.cell(row=22, column=1, value='CLOSING CASH (check against bank!)').font = f_bold
for col in range(2, 14):
    cl = L(col)
    c = cf.cell(row=22, column=col, value=f'={cl}5+SUMIFS({T_IN},{T_MON},{cl}$4)-SUMIFS({T_OUT},{T_MON},{cl}$4)')
    calc(c, RS, True); c.fill = PatternFill('solid', fgColor='E2EFDA')
for col in range(2, 14):
    if col == 2: pass
for rr in (7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21):
    c = cf.cell(row=rr, column=14, value=f'=SUM(B{rr}:M{rr})'); calc(c, RS, True)
cf.cell(row=23, column=1, value='Actual bank + cash at month end (type it)').font = f_base
for col in range(2, 14):
    inp(cf.cell(row=23, column=col), RS)
cf.cell(row=24, column=1, value='Difference (should be 0)').font = f_bold
for col in range(2, 14):
    cl = L(col)
    c = cf.cell(row=24, column=col, value=f'=IF({cl}23="","",{cl}23-{cl}22)'); calc(c, RS, True)
cf.conditional_formatting.add('B24:M24', FormulaRule(formula=['AND(B24<>"",B24<>0)'], font=Font(name=F, bold=True, color='C00000'), fill=PatternFill('solid', fgColor='FBE4E4')))
cf['A26'] = ('Why closing cash and profit differ: unpaid invoices, owner drawings, tax, equipment and loans move cash without being profit or cost. '
             'Transfers between your own accounts cancel out in the closing balance.')
cf['A26'].font = f_sub
cf.freeze_panes = 'B5'

# =====================================================================
# INVOICES
# =====================================================================
NI = int(os.environ.get("NI", 400)); I0 = 5; IN_ = I0 + NI - 1
iv = sheet('Invoices', 'Invoices: who owes us money?',
           'Add every invoice you send. When it is paid, fill Amount paid + Paid date, AND record the payment on Transactions.',
           [14, 30, 28, 13, 10, 13, 14, 14, 14, 13, 12, 12, 30])
header(iv, 4, ['Invoice no.', 'Client', 'Service', 'Issue date', 'Terms (days)', 'Due date (auto)', 'Amount (Rs)',
               'Amount paid (Rs)', 'Balance due (auto)', 'Paid date', 'Status (auto)', 'Days overdue (auto)', 'Notes / follow-up'])
for rr in range(I0, IN_ + 1):
    for col, fmt in ((1, None), (2, None), (3, None), (4, DATE), (5, '0'), (7, RS), (8, RS), (10, DATE), (13, None)):
        c = iv.cell(row=rr, column=col); c.font = f_input; c.border = box
        if fmt: c.number_format = fmt
    iv.cell(row=rr, column=6, value=f'=IF(D{rr}="","",D{rr}+IF(E{rr}="",{SET_TERMS},E{rr}))')
    iv.cell(row=rr, column=9, value=f'=IF(G{rr}="","",G{rr}-N(H{rr}))')
    iv.cell(row=rr, column=11, value=f'=IF(G{rr}="","",IF(I{rr}<=0,"Paid",IF(TODAY()>F{rr},"Overdue","Open")))')
    iv.cell(row=rr, column=12, value=f'=IF(K{rr}="Overdue",TODAY()-F{rr},"")')
    for col, fmt in ((6, DATE), (9, RS), (11, None), (12, '0')):
        c = iv.cell(row=rr, column=col); c.font = f_base; c.fill = fill_calc; c.border = box; c.number_format = fmt or 'General'
ex = ['INV-001', 'ABC Holdings (Pvt) Ltd', 'Website project', dt.date(2026, 4, 1), 14, None, 300000, 150000, None, None]
for i, v in enumerate(ex, 1):
    if v is not None:
        iv.cell(row=I0, column=i, value=v)
    iv.cell(row=I0, column=i).fill = fill_example
iv.cell(row=I0, column=13, value='Example row: replace or delete').fill = fill_example
iv.conditional_formatting.add(f'K{I0}:K{IN_}', CellIsRule(operator='equal', formula=['"Overdue"'], font=Font(name=F, bold=True, color='C00000'), fill=PatternFill('solid', fgColor='FBE4E4')))
iv.conditional_formatting.add(f'K{I0}:K{IN_}', CellIsRule(operator='equal', formula=['"Paid"'], font=Font(name=F, color='38761D')))
iv['A3'] = 'Total outstanding:'; iv['A3'].font = f_bold
c = iv['C3']; c.value = f'=SUM(I{I0}:I{IN_})'; calc(c, RS, True)
iv['D3'] = 'Overdue:'; iv['D3'].font = f_bold
c = iv['F3']; c.value = f'=SUMIFS(I{I0}:I{IN_},K{I0}:K{IN_},"Overdue")'; calc(c, RS, True)
iv.freeze_panes = 'C5'
iv.auto_filter.ref = f'A4:M{IN_}'
INV_BAL, INV_STAT, INV_CLI = f'Invoices!$I${I0}:$I${IN_}', f'Invoices!$K${I0}:$K${IN_}', f'Invoices!$B${I0}:$B${IN_}'

# =====================================================================
# CLIENTS
# =====================================================================
NC = int(os.environ.get("NC", 100)); C0 = 5; CN = C0 + NC - 1
cl = sheet('Clients', 'Clients: who pays us, and how much?',
           'Type each client once, spelled exactly as on Transactions and Invoices. Revenue and balances fill in automatically.',
           [30, 22, 26, 24, 13, 16, 12, 16, 34])
header(cl, 4, ['Client name', 'Contact person', 'Phone / email', 'Main service', 'Client since', 'Revenue this FY (auto)',
               'Share of revenue (auto)', 'Owed to us (auto)', 'Notes'])
for rr in range(C0, CN + 1):
    for col, fmt in ((1, None), (2, None), (3, None), (4, None), (5, DATE), (9, None)):
        c = cl.cell(row=rr, column=col); c.font = f_input; c.border = box
        if fmt: c.number_format = fmt
    cl.cell(row=rr, column=6, value=f'=IF(A{rr}="","",SUMIFS({T_IN},{T_CLI},A{rr},{T_TYPE},"Income")-SUMIFS({T_OUT},{T_CLI},A{rr},{T_TYPE},"Income"))')
    cl.cell(row=rr, column=7, value=f"=IF(A{rr}=\"\",\"\",IF('Monthly P&L'!$N${REV}=0,0,F{rr}/'Monthly P&L'!$N${REV}))")
    cl.cell(row=rr, column=8, value=f'=IF(A{rr}="","",SUMIFS({INV_BAL},{INV_CLI},A{rr}))')
    for col, fmt in ((6, RS), (7, PCT), (8, RS)):
        c = cl.cell(row=rr, column=col); c.font = f_base; c.fill = fill_calc; c.border = box; c.number_format = fmt
for i, v in enumerate(['ABC Holdings (Pvt) Ltd', 'Mr. Perera', 'perera@example.lk', 'Website project', dt.date(2026, 4, 1)], 1):
    cl.cell(row=C0, column=i, value=v).fill = fill_example
cl.cell(row=C0, column=9, value='Example row: replace or delete').fill = fill_example
cl.conditional_formatting.add(f'G{C0}:G{CN}', CellIsRule(operator='greaterThan', formula=['0.3'], font=Font(name=F, bold=True, color='C00000')))
cl['A3'] = 'Red share = this client is more than 30% of revenue (concentration risk).'; cl['A3'].font = f_sub
cl.freeze_panes = 'B5'
CLI_SHARE = f'Clients!$G${C0}:$G${CN}'

# =====================================================================
# SERVICE PRICING
# =====================================================================
sp = sheet('Service Pricing', 'Service Pricing: what does each service really earn?',
           'One row per service. Use it in Week 5 to find which services make money and what you should charge.',
           [30, 14, 11, 16, 15, 14, 14, 14, 11, 15, 16])
sp['A3'] = 'Target gross margin:'; sp['A3'].font = f_bold
inp(sp['C3'], PCT); sp['C3'] = 0.5
sp['D3'] = 'Assumption: aim for at least 50% gross margin on services (a common rule of thumb). Change it to your target.'; sp['D3'].font = f_sub
header(sp, 5, ['Service', 'Price you charge (Rs)', 'Hours per job', 'Cost per hour of whoever does it (Rs)', 'Other direct costs per job (Rs)',
               'Labour cost (auto)', 'Total cost per job (auto)', 'Gross profit per job (auto)', 'Gross margin (auto)',
               'Profit per hour worked (auto)', 'Price for target margin (auto)'])
for rr in range(6, 18):
    for col, fmt in ((1, None), (2, RS), (3, '0.0'), (4, RS), (5, RS)):
        c = sp.cell(row=rr, column=col); c.font = f_input; c.fill = fill_input; c.border = box
        if fmt: c.number_format = fmt
    sp.cell(row=rr, column=6, value=f'=IF(A{rr}="","",N(C{rr})*N(D{rr}))')
    sp.cell(row=rr, column=7, value=f'=IF(A{rr}="","",F{rr}+N(E{rr}))')
    sp.cell(row=rr, column=8, value=f'=IF(A{rr}="","",N(B{rr})-G{rr})')
    sp.cell(row=rr, column=9, value=f'=IF(OR(A{rr}="",N(B{rr})=0),"",H{rr}/B{rr})')
    sp.cell(row=rr, column=10, value=f'=IF(OR(A{rr}="",N(C{rr})=0),"",H{rr}/C{rr})')
    sp.cell(row=rr, column=11, value=f'=IF(A{rr}="","",IF($C$3>=1,"",G{rr}/(1-$C$3)))')
    for col, fmt in ((6, RS), (7, RS), (8, RS), (9, PCT), (10, RS), (11, RS)):
        c = sp.cell(row=rr, column=col); c.font = f_base; c.fill = fill_calc; c.border = box; c.number_format = fmt
for i, v in enumerate(['EXAMPLE: Small business website', 150000, 40, 1500, 10000], 1):
    sp.cell(row=6, column=i, value=v).fill = fill_example
sp.conditional_formatting.add('I6:I17', FormulaRule(formula=['AND(I6<>"",I6<$C$3)'], font=Font(name=F, bold=True, color='C00000')))
sp['A19'] = ('Cost per hour: if you do the work yourself, use the salary you want ÷ hours you work per month '
             '(e.g. Rs 200,000 ÷ 160 h = Rs 1,250/h). Red margin = below your target: raise the price, cut hours, or cut direct costs.')
sp['A19'].font = f_sub

# =====================================================================
# FORECAST & BUDGET
# =====================================================================
fc = sheet('Forecast', 'Forecast & Budget: October 2026 – March 2027',
           'Plan the next 6 months, then compare with what actually happened. Yellow = your assumptions.', [40] + [13] * 6 + [14])
header(fc, 4, ['Rs'] + [''] * 6 + ['6-month total'])
c = fc['B4']; c.value = dt.date(2026, 10, 1); c.number_format = 'mmm yy'; c.font = Font(name=F, bold=True, color='FFFF00')
for m in range(1, 6):
    c = fc.cell(row=4, column=2 + m, value=f'=EDATE({L(1 + m)}4,1)'); c.number_format = 'mmm yy'
FC = [L(2 + m) for m in range(6)]
fc['A5'] = 'REVENUE PLAN'; fc['A5'].font = f_sect
rows_fc = {}
def fc_row(r, label, values=None, formula=None, fmt=RS, bold=False, total=True):
    fc.cell(row=r, column=1, value=label).font = f_bold if bold else f_base
    for i, colL in enumerate(FC):
        c = fc.cell(row=r, column=2 + i)
        if values is not None:
            c.value = values[i] if isinstance(values, list) else values; inp(c, fmt)
        else:
            c.value = formula(colL); calc(c, fmt, bold)
    if total:
        c = fc.cell(row=r, column=8, value=f'=SUM(B{r}:G{r})'); calc(c, fmt, True)
fc_row(6, 'Number of jobs / paying clients', 0, fmt='0')
fc_row(7, 'Average fee per job (Rs)', 0, total=False)
fc_row(8, 'Forecast revenue', formula=lambda c: f'={c}6*{c}7', bold=True)
fc_row(9, 'Direct costs as % of revenue', 0.3, fmt=PCT, total=False)
fc.cell(row=9, column=1).comment = Comment('Assumption: 30% placeholder. Use the gross margin from your Monthly P&L (100% − gross margin %).', 'Forecast')
fc_row(10, 'Forecast direct costs', formula=lambda c: f'={c}8*{c}9')
fc_row(11, 'Forecast gross profit', formula=lambda c: f'={c}8-{c}10', bold=True)
fc['A13'] = 'MONTHLY BUDGET FOR OVERHEADS'; fc['A13'].font = f_sect
budget = ['Salaries – admin & sales (incl. EPF/ETF)', 'Rent & utilities', 'Internet, phone & software', 'Marketing & advertising',
          'Professional fees (accountant)', 'Transport & other']
for i, b in enumerate(budget):
    fc_row(14 + i, b, 0)
fc_row(20, 'Total overheads budget', formula=lambda c: f'=SUM({c}14:{c}19)', bold=True)
fc_row(22, 'FORECAST NET PROFIT', formula=lambda c: f'={c}11-{c}20', bold=True)
fc_row(23, 'Owner salary (from Setup)', formula=lambda c: f'={SET_PAY}')
fc_row(24, 'Tax reserve (Setup % of profit)', formula=lambda c: f'=MAX(0,{c}22)*{SET_TAX}')
fc_row(25, 'Left to reinvest or save', formula=lambda c: f'={c}22-{c}23-{c}24', bold=True)
fc['A27'] = 'ACTUAL vs FORECAST (auto from Monthly P&L)'; fc['A27'].font = f_sect
def actual(row):
    return lambda c: f"=IFERROR(INDEX({PLR(row)},MATCH({c}$4,{PL_MONTHS},0)),0)"
fc_row(28, 'Actual revenue', formula=actual(REV))
fc_row(29, 'Revenue difference (actual − forecast)', formula=lambda c: f'={c}28-{c}8')
fc_row(30, 'Revenue achieved %', formula=lambda c: f'=IF({c}8=0,0,{c}28/{c}8)', fmt=PCT, total=False)
fc_row(31, 'Actual overheads', formula=actual(OX))
fc_row(32, 'Overheads difference (actual − budget)', formula=lambda c: f'={c}31-{c}20')
fc_row(33, 'Actual net profit', formula=actual(NP), bold=True)
fc_row(34, 'Profit difference (actual − forecast)', formula=lambda c: f'={c}33-{c}22')
for rr in (29, 32, 34):
    fc.conditional_formatting.add(f'B{rr}:H{rr}', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=F, color='C00000')))
fc['A36'] = ('How to use: fill rows 6–7, 9 and 14–19 in Week 8. Start with your real averages from the Monthly P&L, then decide what is realistic. '
             'Months with no actuals yet show 0 in the actual rows.')
fc['A36'].font = f_sub
fc.freeze_panes = 'B5'

# =====================================================================
# SALES PIPELINE
# =====================================================================
NP_ = int(os.environ.get("NS", 200)); S0 = 5; SN = S0 + NP_ - 1
sl = sheet('Sales Pipeline', 'Sales Pipeline: every enquiry, until it is won or lost',
           'Add every lead the day it arrives. Always fill "Next action" and "Next action date".',
           [13, 28, 22, 18, 24, 15, 16, 34, 14, 12, 30])
stages = ['New enquiry', 'Contacted', 'Meeting held', 'Proposal sent', 'Negotiating', 'Won', 'Lost']
header(sl, 4, ['Date in', 'Lead / company', 'Contact', 'Source', 'Service wanted', 'Value (Rs)', 'Stage', 'Next action', 'Next action date',
               'Overdue? (auto)', 'Notes / reason lost'])
dv_stage = DataValidation(type='list', formula1='"' + ','.join(stages) + '"', allow_blank=True)
dv_src = DataValidation(type='list', formula1='"Referral,Repeat client,Website,Facebook,Instagram,LinkedIn,Google,WhatsApp,Walk-in / event,Other"', allow_blank=True)
sl.add_data_validation(dv_stage); sl.add_data_validation(dv_src)
dv_stage.add(f'G{S0}:G{SN}'); dv_src.add(f'D{S0}:D{SN}')
for rr in range(S0, SN + 1):
    for col, fmt in ((1, DATE), (2, None), (3, None), (4, None), (5, None), (6, RS), (7, None), (8, None), (9, DATE), (11, None)):
        c = sl.cell(row=rr, column=col); c.font = f_input; c.border = box
        if fmt: c.number_format = fmt
    c = sl.cell(row=rr, column=10, value=f'=IF(OR(I{rr}="",G{rr}="Won",G{rr}="Lost"),"",IF(I{rr}<TODAY(),"OVERDUE",""))')
    c.font = Font(name=F, bold=True, color='C00000'); c.fill = fill_calc; c.border = box
for i, v in enumerate([dt.date(2026, 10, 2), 'EXAMPLE: XYZ Hotels', 'Ms. Fernando', 'Referral', 'Social media management', 80000,
                       'Proposal sent', 'Call to answer questions on the proposal', dt.date(2026, 10, 6)], 1):
    sl.cell(row=S0, column=i, value=v).fill = fill_example
sl['A3'] = 'Open pipeline value:'; sl['A3'].font = f_bold
c = sl['C3']; c.value = f'=SUMIFS(F{S0}:F{SN},G{S0}:G{SN},"<>Won",G{S0}:G{SN},"<>Lost",G{S0}:G{SN},"<>")'; calc(c, RS, True)
sl['D3'] = 'Win rate:'; sl['D3'].font = f_bold
c = sl['E3']; c.value = f'=IF(COUNTIF(G{S0}:G{SN},"Won")+COUNTIF(G{S0}:G{SN},"Lost")=0,0,COUNTIF(G{S0}:G{SN},"Won")/(COUNTIF(G{S0}:G{SN},"Won")+COUNTIF(G{S0}:G{SN},"Lost")))'; calc(c, PCT, True)
sl.freeze_panes = 'C5'
sl.auto_filter.ref = f'A4:K{SN}'

# =====================================================================
# DASHBOARD
# =====================================================================
db = sheet('Dashboard', 'Dashboard: the business on one page',
           'Pick a month in the yellow cell. Everything else is automatic.', [42, 18, 4, 42, 18])
db['A4'] = 'Month to review:'; db['A4'].font = f_bold
c = db['B4']; c.value = dt.date(2026, 9, 1); inp(c, MON)
dv_m = DataValidation(type='list', formula1=f"={PL_MONTHS}", allow_blank=False)
db.add_data_validation(dv_m); dv_m.add('B4')
db['D4'] = 'Pick from the list (financial-year months).'; db['D4'].font = f_sub
def pick(row):
    return f"=IFERROR(INDEX({PLR(row)},MATCH($B$4,{PL_MONTHS},0)),0)"
def ytd(row):
    return f"=SUMPRODUCT(({PL_MONTHS}<=$B$4)*{PLR(row)})"
left = [
    ('THIS MONTH', None, None),
    ('Revenue', pick(REV), RS), ('Gross profit', pick(GP), RS), ('Gross margin %', pick(GPM), PCT),
    ('Overheads', pick(OX), RS), ('Net profit', pick(NP), RS), ('Net margin %', pick(NPM), PCT),
    ('Owner drawings', pick(MEMO['Owner Drawings']), RS),
    ('Closing cash (Cash Flow)', "=IFERROR(INDEX('Cash Flow'!$B$22:$M$22,MATCH($B$4,'Cash Flow'!$B$4:$M$4,0)),0)", RS),
    ('', None, None),
    ('YEAR TO DATE (from April)', None, None),
    ('Revenue YTD', ytd(REV), RS), ('Net profit YTD', ytd(NP), RS),
    ('Net margin YTD', '=IF(B17=0,0,B18/B17)', PCT),
    ('Average monthly revenue YTD', f"=IFERROR(B17/SUMPRODUCT(({PL_MONTHS}<=$B$4)*1),0)", RS),
]
r = 6
for lab, f, fmt in left:
    if f is None:
        db.cell(row=r, column=1, value=lab).font = f_sect
    else:
        db.cell(row=r, column=1, value=lab).font = f_base
        c = db.cell(row=r, column=2, value=f); calc(c, fmt, True)
    r += 1
# B17 Revenue YTD, B18 NP YTD — verify positions
assert left[11][0] == 'Revenue YTD' and 6 + 11 == 17
right = [
    ('MONEY OWED TO US', None, None),
    ('Total outstanding invoices', f'=SUM({INV_BAL})', RS),
    ('Overdue amount', f'=SUMIFS({INV_BAL},{INV_STAT},"Overdue")', RS),
    ('Number of overdue invoices', f'=COUNTIF({INV_STAT},"Overdue")', '0'),
    ('', None, None),
    ('RISK & HEALTH', None, None),
    ('Biggest client share of revenue', f'=MAX({CLI_SHARE})', PCT),
    ('Avg monthly spending (last 3 months)',
     f"=SUMPRODUCT(({PL_MONTHS}<=$B$4)*({PL_MONTHS}>EDATE($B$4,-3))*({PLR(DC)}+{PLR(OX)}))/3", RS),
    ('Cash runway (months of spending covered)', '=IF(E13<=0,0,B14/E13)', '0.0'),
    ('Tax reserve suggested YTD', ytd(TAXRES), RS),
    ('', None, None),
    ('SALES', None, None),
    ('Open pipeline value', "='Sales Pipeline'!C3", RS),
    ('Win rate', "='Sales Pipeline'!E3", PCT),
]
r = 6
for lab, f, fmt in right:
    if f is None:
        db.cell(row=r, column=4, value=lab).font = f_sect
    else:
        db.cell(row=r, column=4, value=lab).font = f_base
        c = db.cell(row=r, column=5, value=f); calc(c, fmt, True)
    r += 1
assert right[7][0].startswith('Avg monthly') and 6 + 7 == 13
db['A23'] = 'ACCOUNT BALANCES TODAY'; db['A23'].font = f_sect
header(db, 24, ['Account', 'Balance (Rs)'])
for i in range(ACC_FIRST, ACC_LAST + 1):
    rr = 25 + i - ACC_FIRST
    c = db.cell(row=rr, column=1, value=f'=IF(Setup!$A${i}="","",Setup!$A${i})'); c.font = f_link; c.border = box
    c = db.cell(row=rr, column=2, value=f'=IF(A{rr}="","",Setup!$B${i}+SUMIFS({T_IN},{T_ACC},A{rr})-SUMIFS({T_OUT},{T_ACC},A{rr}))'); calc(c, RS)
db['D23'] = 'WARNING SIGNS'; db['D23'].font = f_sect
warns = [
    ('Net profit this month is negative', '=IF(B11<0,"⚠ YES","OK")'),
    ('Gross margin below 50%', '=IF(AND(B7<>0,B9<0.5),"⚠ YES","OK")'),
    ('One client is more than 30% of revenue', '=IF(E12>0.3,"⚠ YES","OK")'),
    ('Less than 3 months of cash runway', '=IF(AND(E13>0,E14<3),"⚠ YES","OK")'),
    ('Overdue invoices exist', '=IF(E9>0,"⚠ YES","OK")'),
    ('Transactions with a wrong category', f'=IF(COUNTIF({T_TYPE},"Check category")>0,"⚠ YES","OK")'),
]
for i, (lab, f) in enumerate(warns):
    rr = 24 + i
    db.cell(row=rr, column=4, value=lab).font = f_base
    c = db.cell(row=rr, column=5, value=f); calc(c, None, True)
db.conditional_formatting.add('E24:E29', CellIsRule(operator='equal', formula=['"⚠ YES"'], font=Font(name=F, bold=True, color='C00000'), fill=PatternFill('solid', fgColor='FBE4E4')))
db.conditional_formatting.add('E24:E29', CellIsRule(operator='equal', formula=['"OK"'], font=Font(name=F, bold=True, color='38761D')))
db['A33'] = ('Rules of thumb used above (assumptions, adjust to your business): services gross margin ≥ 50%; no client above 30% of revenue; '
             'keep at least 3 months of spending in cash.')
db['A33'].font = f_sub

# =====================================================================
# WEEKLY REVIEW
# =====================================================================
wr = sheet('Weekly Review', 'Weekly Review: 30 minutes every Sunday or Monday',
           'Answer Yes/No honestly. The money columns fill in automatically from Transactions.',
           [10, 13, 13, 14, 14, 14, 13, 13, 13, 13, 13, 30, 30, 30])
header(wr, 4, ['Week', 'From', 'To', 'Money in (auto)', 'Money out (auto)', 'Net (auto)', 'All transactions entered?', 'Receipts saved?',
               'Invoices sent & chased?', 'Bank matches sheet?', 'Plan tasks done?', 'Biggest win', 'Biggest problem', 'Focus for next week'])
weeks = [(p['week'], p['dates']) for p in PLAN]
starts = [dt.date(2026, 10, 1)] + [dt.date(2026, 10, 5) + dt.timedelta(days=7 * i) for i in range(12)] + [dt.date(2026, 12, 28)]
ends = [dt.date(2026, 10, 4)] + [dt.date(2026, 10, 11) + dt.timedelta(days=7 * i) for i in range(12)] + [dt.date(2026, 12, 31)]
dv_yn2 = DataValidation(type='list', formula1='"Yes,No,Partly"', allow_blank=True); wr.add_data_validation(dv_yn2)
for i, (w, _) in enumerate(weeks):
    rr = 5 + i
    wr.cell(row=rr, column=1, value=w).font = f_bold
    for col, d in ((2, starts[i]), (3, ends[i])):
        c = wr.cell(row=rr, column=col, value=d); c.number_format = 'dd-mmm'; c.font = f_base; c.border = box
    c = wr.cell(row=rr, column=4, value=f'=SUMIFS({T_IN},{T_DATE},">="&B{rr},{T_DATE},"<="&C{rr})-SUMIFS({T_IN},{T_DATE},">="&B{rr},{T_DATE},"<="&C{rr},{T_TYPE},"Transfer")'); calc(c, RS)
    c = wr.cell(row=rr, column=5, value=f'=SUMIFS({T_OUT},{T_DATE},">="&B{rr},{T_DATE},"<="&C{rr})-SUMIFS({T_OUT},{T_DATE},">="&B{rr},{T_DATE},"<="&C{rr},{T_TYPE},"Transfer")'); calc(c, RS)
    c = wr.cell(row=rr, column=6, value=f'=D{rr}-E{rr}'); calc(c, RS, True)
    for col in range(7, 15):
        c = wr.cell(row=rr, column=col); c.font = f_input; c.border = box; c.alignment = WRAP
    dv_yn2.add(f'G{rr}:K{rr}')
wr.conditional_formatting.add(f'G5:K{4 + len(weeks)}', CellIsRule(operator='equal', formula=['"No"'], font=Font(name=F, bold=True, color='C00000')))
wr.conditional_formatting.add(f'G5:K{4 + len(weeks)}', CellIsRule(operator='equal', formula=['"Yes"'], font=Font(name=F, bold=True, color='38761D')))
wr.freeze_panes = 'B5'

# =====================================================================
# 90-DAY PLAN
# =====================================================================
pn = sheet('90-Day Plan', '90-Day Plan: October – December 2026',
           'Your task list from the crash course. Change Status as you go; progress updates automatically.',
           [10, 14, 26, 12, 70, 50, 14])
header(pn, 5, ['Week', 'Dates', 'Theme', 'Area', 'Task', 'Done when…', 'Status'])
dv_s = DataValidation(type='list', formula1='"Not started,In progress,Done,Skipped"', allow_blank=True); pn.add_data_validation(dv_s)
rr = 6
for p in PLAN:
    for area, task, done in p['tasks']:
        vals = [p['week'], p['dates'], p['theme'], area, task, done]
        for i, v in enumerate(vals, 1):
            c = pn.cell(row=rr, column=i, value=v); c.font = f_base; c.border = box; c.alignment = WRAP
        c = pn.cell(row=rr, column=7, value='Not started'); inp(c)
        rr += 1
PN_LAST = rr - 1
dv_s.add(f'G6:G{PN_LAST}')
pn['A3'] = 'Progress:'; pn['A3'].font = f_bold
c = pn['B3']; c.value = f'=COUNTIF(G6:G{PN_LAST},"Done")/COUNTA(E6:E{PN_LAST})'; calc(c, '0%', True)
pn['C3'] = f'=COUNTIF(G6:G{PN_LAST},"Done")&" of "&COUNTA(E6:E{PN_LAST})&" tasks done"'; pn['C3'].font = f_bold
pn.conditional_formatting.add(f'G6:G{PN_LAST}', CellIsRule(operator='equal', formula=['"Done"'], fill=PatternFill('solid', fgColor='C6EFCE'), font=Font(name=F, color='006100')))
pn.conditional_formatting.add(f'G6:G{PN_LAST}', CellIsRule(operator='equal', formula=['"In progress"'], fill=PatternFill('solid', fgColor='FFEB9C'), font=Font(name=F, color='9C5700')))
pn.freeze_panes = 'A6'

# =====================================================================
# TAX CALENDAR
# =====================================================================
tc = sheet('Tax Calendar', 'Tax & Compliance Calendar (Sri Lanka)',
           'Researched October 2026 from IRD notices and tax-firm summaries. Rules change often: confirm every item with your accountant.',
           [16, 44, 30, 58, 14])
header(tc, 4, ['Date', 'What', 'Who it applies to', 'What to do', 'Status'])
cal = [
    ('Before 1 Nov 2026', 'TIN certificate compulsory for key transactions', 'Every individual 18+ and every business',
     'Get your TIN on the IRD e-Services portal. Needed from 1 Nov 2026 to open bank accounts, register a business, vehicles, land, get credit cards.'),
    ('15 Nov 2026', '2nd quarterly income tax instalment, Y/A 2026/27 (Jul–Sep)', 'Anyone with taxable business income',
     'Accountant estimates the amount; pay and record it as "Income tax paid".'),
    ('30 Nov 2026', 'Income tax return for Y/A 2025/26 (1 Apr 2025 – 31 Mar 2026)', 'Individuals, partnerships, companies with taxable income',
     'File the return (usually via your accountant). Any balance tax was due by 30 Sep 2026: if unpaid, settle it now.'),
    ('31 Dec 2026', 'Quarter end (Oct–Dec)', 'Your business', 'Close the books for the quarter; review Dashboard.'),
    ('15 Feb 2027', '3rd quarterly instalment, Y/A 2026/27 (Oct–Dec)', 'Anyone with taxable business income', 'Pay the estimate.'),
    ('31 Mar 2027', 'Financial / tax year ends', 'Everyone', 'Year-end close. Count assets, list unpaid invoices and bills.'),
    ('15 May 2027', '4th quarterly instalment, Y/A 2026/27 (Jan–Mar)', 'Anyone with taxable business income', 'Pay the estimate.'),
    ('Monthly', 'If you employ staff: EPF (8% employee + 12% employer) and ETF (3% employer)', 'Employers',
     'Register with the Labour Department (EPF) and ETF Board; pay monthly. Confirm due dates with your accountant.'),
    ('Ongoing', 'Withholding tax (WHT) on your fees', 'Individuals earning service fees > Rs 100,000 per month from one payer',
     'Clients may deduct 5% WHT. Collect every WHT certificate: it is credited against your income tax.'),
    ('Watch', 'VAT registration (18%)', 'Turnover above Rs 60 million a year (Rs 15 million a quarter)',
     'The cut to Rs 36 million was proposed, then dropped in June 2026. Check if you are near the limit.'),
    ('Watch', 'SSCL registration (2.5% levy on turnover)', 'From 1 Jul 2026: turnover above Rs 9 million in a quarter or Rs 36 million over 4 quarters',
     'Check your quarterly revenue on the Monthly P&L against this threshold.'),
    ('Every payment', 'Large cash payments', 'Payments of Rs 500,000 or more',
     'From the 2026 amendment, these are not tax-deductible if paid in cash or through non-approved methods. Pay big bills by bank.'),
]
for i, (d, w, who, what) in enumerate(cal):
    rr = 5 + i
    for col, v in enumerate([d, w, who, what], 1):
        c = tc.cell(row=rr, column=col, value=v); c.font = f_bold if col == 1 else f_base; c.border = box; c.alignment = WRAP
    inp(tc.cell(row=rr, column=5, value='To check'))
dv_tc = DataValidation(type='list', formula1='"To check,Not applicable,Done"', allow_blank=True); tc.add_data_validation(dv_tc)
dv_tc.add(f'E5:E{4 + len(cal)}')
tc.cell(row=6 + len(cal), column=1, value='Main sources: IRD notices; KPMG Sri Lanka tax alerts (2025–2026); Inland Revenue (Amendment) Act No. 11 of 2026; '
        'VAT (Amendment) Act No. 14 of 2026; IRD Circular SEC/2026/E/04 (WHT). Personal income tax: Rs 1.8m relief, then 6% / 18% / 24% / 30% / 36% slabs (from Y/A 2025/26).').font = f_sub

# =====================================================================
# START HERE (first sheet)
# =====================================================================
sh = wb['Sheet']; sh.title = 'Start Here'
sh.sheet_view.showGridLines = False
sh.column_dimensions['A'].width = 4; sh.column_dimensions['B'].width = 26; sh.column_dimensions['C'].width = 95
sh['B1'] = 'Business Control Center'; sh['B1'].font = Font(name=F, size=20, bold=True, color=NAVY)
sh['B2'] = 'Bookkeeping and management workbook for a Sri Lankan service business. Financial year April 2026 – March 2027.'; sh['B2'].font = f_sub
rows = [
    ('HOW THE WORKBOOK FITS TOGETHER', None),
    ('1. Setup', 'Fill once: business details, opening balances, your categories.'),
    ('2. Transactions', 'THE ONLY PLACE YOU TYPE MONEY. Every payment in or out, one row each. Everything else is calculated from here.'),
    ('3. Invoices', 'Every invoice you send, and whether it is paid. Shows who owes you.'),
    ('4. Clients', 'Your client list, with revenue and amount owed per client.'),
    ('5. Monthly P&L', 'Automatic. Profit and loss by month: revenue, costs, profit, margins.'),
    ('6. Cash Flow', 'Automatic. Cash in and out by month. Closing cash must match your bank.'),
    ('7. Dashboard', 'Automatic. One-page health check for any month, with warning signs.'),
    ('8. Service Pricing', 'Work out what each service really earns and what to charge.'),
    ('9. Forecast', 'Plan revenue and costs for Oct 2026 – Mar 2027 and compare with actuals.'),
    ('10. Sales Pipeline', 'Every lead, until it is won or lost.'),
    ('11. Weekly Review', 'Your 30-minute weekly check-in, one row per week of the 90 days.'),
    ('12. 90-Day Plan', 'Your crash-course task list, with progress tracking.'),
    ('13. Tax Calendar', 'Sri Lankan deadlines and thresholds to confirm with your accountant.'),
    ('', None),
    ('COLOUR LEGEND', None),
    ('Yellow cell / blue text', 'You type here.'),
    ('Grey cell / black text', 'Calculated automatically. Do not type over it.'),
    ('Green text', 'Pulled from another sheet.'),
    ('Orange row', 'An example to show the format. Overwrite or delete it.'),
    ('', None),
    ('THE 5 GOLDEN RULES', None),
    ('Rule 1', 'Business money and personal money never mix. Pay yourself a fixed salary (Owner drawings) instead of taking cash when needed.'),
    ('Rule 2', 'Every rupee gets a row. If it left or entered an account, it goes on Transactions with a category.'),
    ('Rule 3', 'No receipt, no record. Photograph every receipt the same day; note its number in the Reference column.'),
    ('Rule 4', 'Match the bank every month. Cash Flow closing cash must equal the real balance (Difference row = 0).'),
    ('Rule 5', 'Look at the numbers weekly. 30 minutes every week on the Weekly Review beats 3 days of panic at tax time.'),
    ('', None),
    ('DAILY 10-MINUTE ROUTINE', 'Open the bank app → enter yesterday\'s payments on Transactions → save receipts → mark any paid invoices.'),
    ('MONTHLY CLOSE (1–2 h)', 'Enter everything → type real balances on Cash Flow row 23 → fix differences → chase overdue invoices → read P&L and Dashboard → move tax reserve.'),
]
r = 4
for a, b in rows:
    c = sh.cell(row=r, column=2, value=a)
    if b is None:
        c.font = f_sect
    else:
        c.font = f_bold
        d = sh.cell(row=r, column=3, value=b); d.font = f_base; d.alignment = Alignment(wrap_text=True, vertical='top')
    r += 1
sh['B21'].fill = fill_input; sh['B21'].font = Font(name=F, bold=True, color='0000FF')
sh['B22'].fill = fill_calc
sh['B23'].font = Font(name=F, bold=True, color='008000')
sh['B24'].fill = fill_example

order = ['Start Here', 'Setup', 'Transactions', 'Invoices', 'Clients', 'Monthly P&L', 'Cash Flow', 'Dashboard', 'Service Pricing',
         'Forecast', 'Sales Pipeline', 'Weekly Review', '90-Day Plan', 'Tax Calendar']
wb._sheets = [wb[n] for n in order]
tabc = {'Start Here': '1F3864', 'Setup': '7F7F7F', 'Transactions': 'C00000', 'Invoices': 'C00000', 'Clients': 'C00000',
        'Monthly P&L': '2E75B6', 'Cash Flow': '2E75B6', 'Dashboard': '2E75B6', 'Service Pricing': '538135', 'Forecast': '538135',
        'Sales Pipeline': '538135', 'Weekly Review': 'BF9000', '90-Day Plan': 'BF9000', 'Tax Calendar': 'BF9000'}
for n, col in tabc.items():
    wb[n].sheet_properties.tabColor = col
# default font on all cells without explicit font
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if c.font is None or c.font.name != F:
                c.font = Font(name=F, size=c.font.size if c.font else 10, bold=c.font.bold if c.font else False,
                              italic=c.font.italic if c.font else False, color=c.font.color if c.font else None)
from openpyxl.workbook.properties import CalcProperties
wb.calculation = CalcProperties(fullCalcOnLoad=True)
wb.save(OUT)
print('saved', OUT, 'P&L rows: REV', REV, 'GP', GP, 'OX', OX, 'NP', NP, 'TAXRES', TAXRES)
