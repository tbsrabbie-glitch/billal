const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, TableOfContents, Footer, PageNumber,
  Header,
} = require('docx');

const FONT = 'Calibri';
const NAVY = '1F3864';
const ACCENT = 'C0504D';
const W = 9026; // A4 text width in DXA with 1" margins (11906 - 2*1440)

// ---------- inline formatting: **bold**, _italic_ ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|_(?=[^_\s])[^_]+?(?<=[^_\s])_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (t, opts = {}) => new Paragraph({ children: runs(t, opts.run), spacing: { after: 120, line: 290 }, ...opts.para });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const B = (items, level = 0) => items.map((t) => new Paragraph({ numbering: { reference: 'bullets', level }, children: runs(t), spacing: { after: 60, line: 280 } }));
let numRef = 0;
const N = (items) => { const ref = 'num' + (numRef++ % 40); return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60, line: 280 } })); };
const Q = (t, who) => [
  new Paragraph({ children: runs(t, { italics: true, color: '404040' }), indent: { left: 567, right: 567 }, spacing: { after: who ? 40 : 160, line: 290 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'A5A5A5', space: 12 } } }),
  ...(who ? [new Paragraph({ children: [new TextRun({ text: '— ' + who, size: 20, color: '595959' })], indent: { left: 567 }, spacing: { after: 160 } })] : []),
];

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const borders = { top: border, bottom: border, left: border, right: border };

const BOX_STYLES = {
  key: { fill: 'FFF2CC', edge: 'BF9000', label: 'KEY IDEA' },
  lk: { fill: 'E2F0D9', edge: '385723', label: 'SRI LANKA RULE' },
  tool: { fill: 'F2F2F2', edge: '404040', label: 'IN YOUR WORKBOOK' },
  ex: { fill: 'FDF2E9', edge: 'C55A11', label: 'WORKED EXAMPLE' },
  research: { fill: 'EDE7F6', edge: '5B3F8F', label: 'WHY IT MATTERS' },
  try: { fill: 'DDEBF7', edge: '1F4E79', label: 'DO THIS' },
  mistake: { fill: 'FBE4E4', edge: 'C00000', label: 'COMMON MISTAKE' },
  link: { fill: 'EDE7F6', edge: '5B3F8F', label: 'HOW THIS CONNECTS' },
  mistake2: { fill: 'FBE4E4', edge: 'C00000', label: 'COMMON MISTAKE' },
};
function Box(kind, title, lines) {
  const s = BOX_STYLES[kind];
  const eb = { style: BorderStyle.SINGLE, size: 4, color: s.edge };
  const children = [
    new Paragraph({ children: [new TextRun({ text: s.label + (title ? ':  ' : ''), bold: true, color: s.edge, size: 20 }), new TextRun({ text: title || '', bold: true, size: 22 })], spacing: { after: 80 } }),
  ];
  for (const l of lines) {
    if (Array.isArray(l)) children.push(...B(l));
    else children.push(new Paragraph({ children: runs(l), spacing: { after: 80, line: 280 } }));
  }
  return [
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [W],
      rows: [new TableRow({ children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { fill: s.fill, type: ShadingType.CLEAR, color: 'auto' },
        borders: { top: eb, bottom: eb, right: eb, left: { style: BorderStyle.SINGLE, size: 24, color: s.edge } },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children,
      })] })],
    }),
    new Paragraph({ children: [], spacing: { after: 120 } }),
  ];
}

function T(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, i, head) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders,
    shading: head ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: String(t).split('\n').map((line) => new Paragraph({ children: runs(line, head ? { bold: true, color: 'FFFFFF' } : { size: 21 }), spacing: { after: 40 } })),
  });
  return [
    new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => {
          const tc = cell(c, i, false);
          return tc;
        }) })),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 160 } }),
  ];
}


// =====================================================================
// CONTENT: 90-Day Business Operating System
// =====================================================================
const PLAN = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const C = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? C.push(...x) : C.push(x)));

// ---------- Title ----------
add(
  new Paragraph({ children: [], spacing: { before: 2200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'THE 90-DAY BUSINESS OPERATING SYSTEM', bold: true, size: 48, color: NAVY })], spacing: { after: 200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'A practical crash course for running your service business properly', size: 30, color: '404040' })], spacing: { after: 120 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'October – December 2026 · Sri Lanka', italics: true, size: 26, color: '595959' })], spacing: { after: 600 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 8 } }, children: [], spacing: { after: 200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: runs('Bookkeeping · Money management · Tax basics · Business plan · Pricing · Marketing & branding · Sales · Operations · Building your team', { size: 22, color: '404040' }), spacing: { after: 160 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: runs('Use with the companion workbook: **Business_Control_Center.xlsx**', { size: 22, color: NAVY }) }),
);
add(
  new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Contents', bold: true, size: 36, color: NAVY })], spacing: { after: 200 } }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  P('_If the contents list looks empty, right-click it in Word and choose “Update Field”._', { run: { size: 20, color: '7F7F7F' } }),
);

// ---------- 0. Start here ----------
add(
  H1('0. Start Here: Where You Are and Where You’re Going'),
  H2('0.1 An honest diagnosis'),
  P('You have something many people never get: **a business that already earns revenue and makes some profit**. Customers pay you. That is the hardest part, and you have done it.'),
  P('What you don’t have yet is a **system**. The business runs on memory, bank statements and effort. That works while the business is small, but it creates five problems that grow with every month:'),
  ...N([
    '**You can’t see.** You don’t know your real profit, which services make money, or where the cash goes.',
    '**You can’t plan.** Without numbers, a forecast or business plan is guesswork.',
    '**You can’t delegate.** If everything is in your head, nobody else can help you: no “army”.',
    '**You carry tax risk.** Sri Lanka’s tax office is tightening enforcement (TIN rules, digital records). Messy records cost money at tax time.',
    '**You can’t grow safely.** Spending on marketing without knowing your margins can grow losses as fast as sales.',
  ]),
  ...Box('key', 'This is normal', ['Almost every small business goes through this stage. Business-growth writers often call it moving from **survival** to **stability**: from “doing the work” to “running the business”. This course is that move, in 13 weeks.']),
  H2('0.2 Is “bookkeeping” the right word?'),
  P('Yes, and it is the right place to start. But it is one layer of three:'),
  ...T(['Layer', 'What it means', 'Who usually does it', 'In this course'], [
    ['Bookkeeping', 'Recording every transaction correctly, every day or week.', 'You at first, later a bookkeeper', 'October (Weeks 0–4)'],
    ['Accounting & tax', 'Turning the records into financial statements, tax returns and compliance.', 'A qualified accountant', 'October–November'],
    ['Financial management', 'Using the numbers to make decisions: pricing, budgets, forecasts, hiring, growth.', 'You, the owner. This cannot be outsourced.', 'November–December'],
  ], [1800, 3200, 2200, 1826]),
  H2('0.3 The Business Operating System: seven pillars'),
  P('A properly run business has seven parts working together. You asked about marketing, branding and “everything”. Here is “everything”, on one page:'),
  ...T(['Pillar', 'The question it answers', 'Tools you’ll build'], [
    ['1. Money', 'Are we making money, and where is the cash?', 'Cash book, P&L, cash flow, dashboard'],
    ['2. Legal & tax', 'Are we registered, compliant and safe?', 'TIN, registration, accountant, tax calendar'],
    ['3. Strategy', 'Where are we going and why?', 'One-page business plan, goals, forecast'],
    ['4. Offer & pricing', 'What do we sell, to whom, at what price?', 'Service pricing, ideal client profile'],
    ['5. Marketing & brand', 'How do the right people find and trust us?', 'Positioning, brand basics, channel plan'],
    ['6. Sales', 'How do enquiries become paying clients?', 'Sales pipeline, proposal, follow-up'],
    ['7. Operations & people', 'How does the work get done well without me doing everything?', 'SOPs, org chart, hiring plan, meeting rhythm'],
  ], [2200, 3600, 3226]),
  H2('0.4 Should you do marketing and branding now? The right order'),
  P('Not all at once. **The order matters more than the effort.**'),
  ...T(['Month', 'Phase', 'Why this order'], [
    ['October', '**SEE the money**: bookkeeping, cash, tax and legal health', 'You can’t steer what you can’t see. Fixing the foundation also removes tax risk before the 15 and 30 November deadlines.'],
    ['November', '**UNDERSTAND and PLAN**: pricing, clients, business plan, forecast', 'Once the numbers are visible, you can see which services and clients make money and set real goals.'],
    ['December', '**GROW and ORGANISE**: brand, marketing, sales, systems, team', 'Now marketing money goes to the most profitable services, and you have systems for others to follow.'],
  ], [1400, 3600, 4026]),
  ...Box('research', 'Marketing before numbers is a trap', ['If a service has a 10% margin and you spend Rs 100,000 on ads to sell more of it, you might need Rs 1,000,000 of extra sales just to get your ad money back. Know your margins first (November), then market the services that earn the most (December).']),
  H2('0.5 Your toolkit'),
  P('This document is the **course**. The workbook **Business_Control_Center.xlsx** is the **tool**. Every week you learn one idea here and apply it there.'),
  ...T(['Workbook sheet', 'Purpose', 'First used'], [
    ['Start Here, Setup', 'How the workbook works; your business details and categories', 'Week 0'],
    ['Transactions', 'The cash book: every rupee in and out (the only place you type money)', 'Week 1'],
    ['Invoices, Clients', 'Who owes you, and who your clients are', 'Week 2'],
    ['Monthly P&L, Cash Flow', 'Automatic profit and cash reports', 'Week 4'],
    ['Dashboard', 'One-page health check with warning signs', 'Week 4'],
    ['Service Pricing', 'Real profit per service, and the right price', 'Week 5'],
    ['Forecast', 'Plan for Oct 2026 – Mar 2027, compared with actuals', 'Week 8'],
    ['Sales Pipeline', 'Every lead until won or lost', 'Week 10'],
    ['Weekly Review, 90-Day Plan', 'Your weekly check-in and task tracker', 'Every week'],
    ['Tax Calendar', 'Sri Lankan deadlines and thresholds', 'Week 3'],
  ], [2600, 4826, 1600]),
  H2('0.6 Time commitment'),
  ...T(['Routine', 'Time', 'When'], [
    ['Daily bookkeeping', '10 minutes', 'Every working day'],
    ['Weekly review + this week’s tasks', '30 minutes + 3–4 hours', 'Same day every week (e.g. Sunday evening or Monday morning)'],
    ['Reading / learning', '20–30 minutes a day', 'Morning or commute'],
    ['Month-end close', '1–2 hours', 'First 3 working days of each month'],
  ], [3200, 2400, 3426]),
  P('About **5–6 hours a week**. October is the heaviest month, because you rebuild six months of records.'),
);

// ---------- 1. Money language ----------
add(
  H1('1. The Money Language: Ten Words Every Owner Must Know'),
  P('Business owners who “don’t do numbers” usually just never learned the vocabulary. Here are the ten words that matter most, in plain language.'),
  ...T(['Term', 'Plain meaning', 'In a service business'], [
    ['Revenue (sales, turnover)', 'Money you earn from customers for your work.', 'Project fees, monthly retainers.'],
    ['Direct costs (cost of sales)', 'Costs you only have because you delivered a job.', 'Freelancers, project staff, materials for a job.'],
    ['Gross profit', 'Revenue − direct costs. What a job really leaves you.', 'Rs 150,000 job − Rs 50,000 freelancer = Rs 100,000.'],
    ['Gross margin %', 'Gross profit ÷ revenue. How much of each rupee you keep after delivery.', 'Rs 100,000 ÷ Rs 150,000 = 67%.'],
    ['Overheads (operating expenses)', 'Costs of running the business whether or not you have jobs.', 'Rent, internet, software, admin staff, accountant.'],
    ['Net profit', 'Gross profit − overheads. What the business earned this period.', 'The bottom line on your P&L.'],
    ['Cash flow', 'Money actually moving in and out of your accounts.', 'Different from profit (see below).'],
    ['Receivables (debtors)', 'Money customers owe you for invoices not yet paid.', 'Your Invoices sheet.'],
    ['Owner drawings', 'Money the owner takes out for personal use. **Not** a business cost.', 'Your monthly “salary” as a sole proprietor.'],
    ['Assets / liabilities', 'Things the business owns / money it owes.', 'Laptop, cash in bank / loans, unpaid bills, tax owed.'],
  ], [2300, 3600, 3126]),
  H2('1.1 Profit is not cash'),
  P('This is the single most important lesson in small-business finance. **A business can be profitable and still run out of money**, and it can have money in the bank while losing money.'),
  ...Box('ex', 'One month, two different answers', [
    'In October you finish jobs worth **Rs 800,000** and invoice them. Freelancers cost Rs 300,000 and overheads Rs 280,000.',
    ['**Profit:** 800,000 − 300,000 − 280,000 = **Rs 220,000 profit** (27.5% net margin).',
     '**But** one client hasn’t paid their Rs 200,000 invoice, you bought a Rs 180,000 laptop, and you took Rs 150,000 for yourself.',
     '**Cash:** received 600,000 − paid 580,000 − laptop 180,000 − drawings 150,000 = **Rs −310,000**. Your bank balance went DOWN.'],
    'Same month, same business: a good profit and a cash shortage. Your workbook shows both: the **Monthly P&L** (profit) and the **Cash Flow** sheet (cash).',
  ]),
  H2('1.2 The three financial statements'),
  ...T(['Statement', 'Answers', 'Where you get it'], [
    ['Profit & Loss (Income Statement)', 'Did we make money in this period?', 'Workbook: Monthly P&L (automatic)'],
    ['Cash Flow Statement', 'Where did the cash come from and go?', 'Workbook: Cash Flow (automatic)'],
    ['Balance Sheet', 'What do we own and owe on a given date?', 'Your accountant prepares it at year end from your records'],
  ], [3000, 3400, 2626]),
  H2('1.3 Cash basis vs. accrual basis'),
  P('Your workbook records money **when it moves** (cash basis), plus a separate list of unpaid invoices. That is simple and right for now. Formal accounts use **accrual basis**: income is counted when you earn it, not when you are paid. Your accountant converts your records at year end using your Invoices sheet. Just keep both sheets complete.'),
  ...Box('try', 'Week 0 learning check', ['Explain to a partner or friend, in your own words: (1) the difference between gross profit and net profit, and (2) why the October example has profit but no cash. If you can, you are ready for Part 2.']),
);

// ---------- 2. Bookkeeping system ----------
add(
  H1('2. Building Your Bookkeeping System'),
  H2('2.1 The five golden rules'),
  ...N([
    '**Business and personal money never mix.** One business bank account. You pay yourself a fixed monthly amount (owner drawings) instead of taking money when you need it.',
    '**Every rupee gets a row.** If money entered or left a business account, it goes on the Transactions sheet with a category.',
    '**No receipt, no record.** Photograph every receipt the same day. Write its number in the Reference column.',
    '**Match the bank every month.** Your workbook’s closing cash must equal your real bank and cash balances. The Cash Flow sheet has a “Difference” row that must show 0.',
    '**Look at the numbers weekly.** Thirty minutes a week beats three days of panic at tax time.',
  ]),
  H2('2.2 Separate the money (Week 0)'),
  P('Choose one account that is **only** for the business. Tell every client to pay into it. Pay every business cost from it. If you must use a personal account for a while, the workbook has an “Owner personal account (temporary)” account: record only the business payments from it, and aim to stop using it by the end of October.'),
  ...Box('lk', 'TIN and bank accounts', ['From **1 November 2026**, a TIN certificate is compulsory to open a bank account (and to register a business, vehicles or land, or get a credit card). If you need a new business account, get your TIN first, in October. Apply on the Inland Revenue Department’s e-Services portal.']),
  H2('2.3 The chart of accounts (categories)'),
  P('A **chart of accounts** is just your list of categories. Good categories answer the questions you will ask later (“How much do we spend on freelancers?”). Your workbook’s Setup sheet has a ready-made list for a service business, grouped into types:'),
  ...T(['Type', 'Examples', 'Counted in profit?'], [
    ['Income', 'Service fees, retainers, other income', 'Yes: revenue'],
    ['Direct Cost', 'Freelancers, project staff, project tools, project travel', 'Yes: reduces gross profit'],
    ['Operating Expense', 'Rent, salaries (admin), EPF/ETF, internet, software, marketing, accountant, bank charges', 'Yes: reduces net profit'],
    ['Owner Drawings / Owner Capital', 'Money taken out by or put in by the owner', 'No: owner’s money'],
    ['Asset Purchase', 'Laptops, cameras, furniture', 'No: depreciated by your accountant'],
    ['Loan In / Loan Repayment', 'Borrowing and paying back', 'No: financing'],
    ['Tax Payment', 'Income tax instalments, VAT/SSCL', 'No: paid out of profit'],
    ['Transfer', 'Moving money between your own accounts', 'No: enter both sides'],
  ], [2400, 4600, 2026]),
  P('Rename the income categories to your real services (e.g. “Social media management”, “Website projects”). That way, the P&L shows which service earns what.'),
  H2('2.4 Rebuilding April–September 2026 (Weeks 1–2)'),
  P('Your financial year started on **1 April 2026**. To see this year clearly, you will rebuild the past six months from your bank statements. It feels slow at first, then fast.'),
  ...N([
    'Find the bank balance on 31 March 2026 (from the statement). Enter it as the opening balance on Setup. Do the same for cash in hand (your best estimate).',
    'Work through one month at a time. For each line on the statement, add a row: date, description, who, category, amount in or out.',
    'If you can’t tell what a payment was, use your phone, email or WhatsApp history. If still unclear, use “Other expenses” and write “unclear” in Notes. Keep these few.',
    'Personal spending from the business account goes to **Owner drawings**, not to an expense.',
    'At the end of each month, type the real bank balance into Cash Flow row 23. The Difference must be 0. If not, a row is missing or duplicated.',
  ]),
  ...Box('tool', 'Speed tip', ['Many Sri Lankan banks let you download statements as Excel or CSV. Copy the date, description and amount columns straight into Transactions, then fill in only the category. Six months can take an evening instead of a week.']),
  H2('2.5 Invoices: get paid on time'),
  ...B([
    'Number every invoice in order: INV-001, INV-002…',
    'Include: your business name and address, TIN (if you have one), the client’s name, date, a clear description, the amount, payment terms (e.g. 14 days) and your bank details.',
    'Record every invoice on the Invoices sheet the day you send it.',
    'When paid: fill in “Amount paid” and “Paid date” on Invoices, **and** record the money on Transactions.',
    'Chase overdue invoices every week. A polite message on day 1 overdue works better than an angry one on day 60.',
  ]),
  ...Box('lk', 'Withholding tax (WHT) certificates', ['If you are an individual earning more than Rs 100,000 a month in service fees from one payer, the client may deduct **5% WHT** and pay you 95%. Record the full invoice amount as income, then record the 5% gap as tax deducted, and **collect the WHT certificate**: it is credited against your income tax. (This 5% is not a final tax.)']),
  H2('2.6 Your routines'),
  ...T(['Routine', 'Steps'], [
    ['Daily (10 min)', 'Open the bank app → enter yesterday’s payments on Transactions → save receipts → mark paid invoices.'],
    ['Weekly (30 min)', 'Fill one row on Weekly Review → check overdue invoices and chase them → check Sales Pipeline next actions → tick this week’s 90-Day Plan tasks.'],
    ['Monthly close (1–2 hours, first 3 working days)', 'Enter every transaction → type real balances on Cash Flow row 23 → fix differences → read Monthly P&L and Dashboard → move tax reserve to the tax savings account → pay yourself → write 3 lessons.'],
    ['Quarterly (half day)', 'Compare actual vs Forecast → update the forecast → review goals → meet your accountant → check VAT/SSCL thresholds and tax instalments.'],
  ], [2600, 6426]),
  ...Box('mistake', 'The five classic bookkeeping mistakes', [
    ['Recording owner drawings as expenses (makes profit look smaller than it is).',
     'Recording a laptop or camera as an expense (it is an asset).',
     'Forgetting cash payments (no row = invisible money).',
     'Recording a transfer between your own accounts as income (makes revenue look bigger than it is).',
     'Leaving the bookkeeping for “later” (later becomes March, and March becomes a crisis).'],
  ]),
);

// ---------- 3. Tax & legal ----------
add(
  H1('3. The Legal and Tax Foundation (Sri Lanka)'),
  ...Box('mistake', 'Read this first', ['This chapter is a researched **orientation** (October 2026), not tax advice. Sri Lankan tax law changed several times in 2025 and 2026. Confirm every point with a qualified accountant before acting.']),
  H2('3.1 What type of business are you?'),
  ...T(['Structure', 'How it works', 'Good for', 'Watch out'], [
    ['Sole proprietorship', 'You are the business. Profit is your personal income. Register the business name (usually with the Divisional Secretariat or provincial authority).', 'One owner, simple and cheap', 'You are personally liable for business debts.'],
    ['Partnership', 'Two or more owners share profits under a partnership agreement.', 'Several owners', 'Have a written agreement: profit split, roles, exit.'],
    ['Private limited company (Pvt) Ltd', 'A separate legal person, registered with the Department of the Registrar of Companies (eROC online). Owners hold shares.', 'Growing businesses, bigger clients, investors', 'More compliance: audited accounts, annual returns, company secretary. Company income tax rate is generally 30%.'],
  ], [1900, 3100, 1900, 2126]),
  P('Many service businesses start as sole proprietors and become companies when they grow or need to sign larger contracts. **Ask your accountant which fits you now and in two years.**'),
  H2('3.2 The tax year and key deadlines'),
  P('The Sri Lankan tax (“assessment”) year runs **1 April – 31 March**. Year of Assessment 2026/27 = 1 April 2026 to 31 March 2027.'),
  ...T(['Date', 'What'], [
    ['Before **1 Nov 2026**', 'Get a TIN: compulsory from this date for opening bank accounts, registering businesses, vehicles, land, and getting credit cards.'],
    ['**15 Nov 2026**', '2nd quarterly income tax instalment for 2026/27 (July–September).'],
    ['**30 Nov 2026**', 'Income tax return for 2025/26 (1 Apr 2025 – 31 Mar 2026). Balance tax for that year was due 30 Sep 2026.'],
    ['15 Feb 2027', '3rd instalment (October–December).'],
    ['15 May 2027', '4th instalment (January–March).'],
  ], [2400, 6626]),
  ...Box('key', 'Act in October', ['The 15 and 30 November deadlines arrive in Month 2. That is why the course has you hire an accountant in **Week 3**. If you missed earlier deadlines, tell the accountant early. The 2026 amendment introduced relief from interest on tax arrears, which may help.']),
  H2('3.3 Personal income tax (sole proprietors and partners)'),
  P('From Year of Assessment 2025/26, the rates for individuals are:'),
  ...T(['Taxable income band (per year)', 'Rate'], [
    ['First Rs 1,800,000 (personal relief)', '0%'],
    ['Next Rs 1,000,000', '6%'],
    ['Next Rs 500,000', '18%'],
    ['Next Rs 500,000', '24%'],
    ['Next Rs 500,000', '30%'],
    ['Balance', '36%'],
  ], [6000, 3026]),
  P('_Taxable income is profit after allowable expenses and reliefs. Your accountant calculates it._ This is why the workbook includes a **tax reserve %**: set money aside every month so tax is never a shock.'),
  H2('3.4 Other taxes and rules to check'),
  ...T(['Item', 'Applies when', 'Action'], [
    ['VAT (18%)', 'Turnover above Rs 60 million a year (Rs 15 million a quarter). A cut to Rs 36 million was proposed in 2026, then dropped.', 'Watch your quarterly revenue on the P&L.'],
    ['SSCL (2.5% levy on turnover)', 'From 1 July 2026: turnover above Rs 9 million in a quarter, or Rs 36 million over four quarters.', 'Check every quarter. This threshold is lower than VAT.'],
    ['Withholding tax on your fees', 'Individuals paid over Rs 100,000/month for services by one payer: 5%.', 'Collect certificates; claim the credit.'],
    ['EPF / ETF', 'When you employ staff: EPF 8% (employee) + 12% (employer); ETF 3% (employer).', 'Register as an employer; budget the extra 15% on top of salaries.'],
    ['Large cash payments', 'Payments of Rs 500,000 or more in cash or through non-approved methods are not tax-deductible (2026 amendment).', 'Pay big bills by bank transfer.'],
    ['Record keeping', 'Always.', 'Keep receipts, invoices, statements and the workbook for several years (ask your accountant how long).'],
  ], [2200, 4300, 2526]),
  H2('3.5 Choosing an accountant (Week 2–3)'),
  P('Look for a member of **CA Sri Lanka** (Chartered Accountants), **CMA Sri Lanka**, or **AAT Sri Lanka**, or a registered tax practitioner who works with small service businesses. Ask:'),
  ...B([
    '“Do you work with service businesses of my size? Can I speak to one of your clients?”',
    '“What exactly will you do: tax returns, instalment estimates, year-end accounts, advice on structure?”',
    '“What is your fee, and what do you need from me each month or quarter?”',
    '“Can you work from my Excel workbook and bank statements?”',
    '“What deadlines am I facing right now, and have I missed any?”',
  ]),
  ...Box('try', 'Bring this to the first meeting', [['Your TIN (or application)', 'Business registration certificate', 'Bank statements April 2025 – now', 'Your workbook (even half-done)', 'Any WHT certificates and past tax papers', 'This question list']]),
);

// ---------- 4. Pricing & unit economics ----------
add(
  H1('4. Understanding Your Business: Services, Pricing and Clients'),
  P('Once October’s records exist, November is about **understanding**. Which services make money? Which clients matter? Are you charging enough?'),
  H2('4.1 Unit economics: what one job really earns'),
  P('**Unit economics** means the profit from one unit of what you sell. For a service business, that’s one job, one project or one month of a retainer.'),
  ...Box('ex', 'A website project', [
    ['Price: **Rs 150,000**', 'Your time: 40 hours × Rs 1,500 per hour (the salary you want ÷ hours worked) = Rs 60,000', 'Other direct costs (stock photos, hosting setup): Rs 10,000',
     'Total cost: **Rs 70,000** → gross profit **Rs 80,000** → gross margin **53%**', 'Profit per hour worked: 80,000 ÷ 40 = **Rs 2,000 per hour**'],
    'If the same project usually takes 70 hours instead of 40, the margin falls to about 23%. **Time is your biggest cost**, so track it, even roughly.',
  ]),
  ...Box('tool', 'Service Pricing sheet', ['Enter each service: price, hours, cost per hour, other direct costs. The sheet shows gross margin, profit per hour, and the price you would need for your target margin. Red margin means the service is under-priced or over-delivered.']),
  H2('4.2 Four ways to price a service'),
  ...T(['Method', 'How', 'When to use'], [
    ['Cost-plus', 'Total cost ÷ (1 − target margin). With a Rs 70,000 cost and a 50% target, charge Rs 140,000.', 'Minimum price floor: never go below it.'],
    ['Market-based', 'What competitors charge for similar work.', 'Reality check, not a strategy.'],
    ['Value-based', 'Price on the value to the client (more sales, time saved, risk avoided).', 'When your results are measurable and you can show them.'],
    ['Packages & retainers', 'Bronze/Silver/Gold packages; monthly retainers.', 'Makes buying easy and makes revenue predictable.'],
  ], [2000, 4500, 2526]),
  ...Box('research', 'Small price changes, big profit changes', ['If your net margin is 20%, a 10% price increase (with no lost clients) raises profit by 50%: from 20 to 30 per 100 rupees of old sales. Most small service businesses are under-priced. Raise prices for **new** clients first, and give existing clients notice.']),
  H2('4.3 Client analysis'),
  ...B([
    '**Concentration risk:** if one client is more than about 30% of revenue, losing them could break the business. The Clients sheet highlights this in red.',
    '**The 80/20 rule:** often about 20% of clients bring about 80% of profit. Find them: they show you who to look for next.',
    '**Problem clients:** slow payers, endless revisions, low margin. Raise their price, change the terms, or let them go.',
  ]),
  H2('4.4 The service business scorecard (KPIs)'),
  P('A **KPI** (key performance indicator) is a number you watch regularly. Start with these:'),
  ...T(['KPI', 'Formula', 'Healthy sign (rule of thumb)', 'Where'], [
    ['Monthly revenue', 'Total income', 'Growing or stable month to month', 'Dashboard'],
    ['Gross margin %', 'Gross profit ÷ revenue', '50% or more for most services', 'Dashboard'],
    ['Net margin %', 'Net profit ÷ revenue', '15–25%+ for a healthy small service business', 'Dashboard'],
    ['Biggest client share', 'Biggest client ÷ revenue', 'Under 30%', 'Dashboard'],
    ['Overdue invoices', 'Unpaid past the due date', 'Close to zero', 'Dashboard'],
    ['Cash runway', 'Cash ÷ average monthly spending', '3 months or more', 'Dashboard'],
    ['Win rate', 'Leads won ÷ (won + lost)', 'Improving over time', 'Sales Pipeline'],
    ['Average job value', 'Revenue ÷ number of jobs', 'Rising as you move upmarket', 'Forecast'],
  ], [2000, 2500, 2900, 1626]),
  P('_These benchmarks are general rules of thumb, not laws. Your own trend over time matters more than any benchmark._'),
);

// ---------- 5. Business plan ----------
add(
  H1('5. The Business Plan, Forecast and Budget'),
  H2('5.1 Why one page'),
  P('You don’t need a 40-page document. Banks and investors sometimes ask for long plans, but **for running the business**, a one-page plan you actually read every month is worth far more. It answers: where are we going, how will we get there, and how will we know?'),
  H2('5.2 Before you write: listen to your best clients (Week 6)'),
  P('Talk to your five best clients for 15–20 minutes each. Ask, and write down their **exact words**:'),
  ...N([
    '“What problem were you trying to solve when you first came to us?”',
    '“What else did you consider? Why did you choose us?”',
    '“What has changed for you since working with us?”',
    '“What’s one thing we could do better?”',
    '“If you described us to a friend, what would you say?”',
    '“Is there anything else you wish we offered?”',
  ]),
  P('Their words become your marketing (Part 6), and their answers show your real strengths.'),
  H2('5.3 Ideal Client Profile'),
  ...Box('try', 'Fill in the blanks', ['**We serve** ____ (type of business or person, size, location) **who** ____ (problem or goal). **They choose us because** ____. **They can afford** ____ **and decide** ____ (who decides, how fast). **Warning signs of a bad-fit client:** ____.']),
  H2('5.4 The One-Page Business Plan (Week 7)'),
  ...T(['Section', 'Answer in 1–3 lines'], [
    ['Vision (3 years)', 'What will the business look like at the end of 2029? Revenue, team size, reputation.'],
    ['Mission', 'What we do, for whom, and the result we create.'],
    ['Ideal clients', 'From 5.3.'],
    ['Core services & prices', 'The 2–4 services we focus on (from the Service Pricing sheet).'],
    ['Why us (difference)', 'What makes us the better choice: proof, speed, specialisation, results.'],
    ['How clients find us', 'The 1–2 main marketing channels plus referrals.'],
    ['Money model', 'Revenue target, gross margin target, net margin target, owner salary.'],
    ['1-year goals (2027)', '3 measurable goals, e.g. revenue Rs __ million, net margin __%, 2 retainer clients.'],
    ['Q1 2027 priorities', 'The 3 most important projects for January–March.'],
    ['Key people', 'Who does what now; who we need next.'],
    ['Biggest risks', 'What could break us (client concentration, cash, key person, tax) and our response.'],
  ], [2600, 6426]),
  H2('5.5 Goals that work'),
  P('Use **SMART** goals: Specific, Measurable, Achievable, Relevant, Time-bound. “Grow the business” is a wish. “Reach Rs 1.2 million average monthly revenue by March 2027 with at least 55% gross margin” is a goal.'),
  H2('5.6 Forecasting the simple way (Week 8)'),
  P('A forecast is not a prediction. It is **a plan written in numbers**. For a service business, build it from drivers:'),
  ...B([
    '**Revenue** = number of jobs (or retainer clients) × average fee.',
    '**Direct costs** = revenue × your real direct-cost % (from the P&L).',
    '**Overheads** = a monthly budget per group (salaries, rent, software, marketing…).',
    '**Net profit** = gross profit − overheads. Then subtract owner salary and tax reserve.',
  ]),
  P('Start from your **real averages** for April–September, then decide what is realistic. Every month, compare actual with forecast (the Forecast sheet does this automatically) and ask: why the difference?'),
  ...Box('key', 'Three scenarios', ['Make a quick copy of the forecast for three cases: **Expected**, **Bad** (lose your biggest client, revenue −30%) and **Good**. If the bad case runs you out of cash, act now: build a cash buffer, find more clients, or cut costs.']),
  H2('5.7 Paying yourself and keeping money safe: profit-first thinking'),
  P('Mike Michalowicz’s book _Profit First_ flips the usual formula. Instead of Sales − Expenses = Profit (whatever is left), use **Sales − Profit = Expenses**: set aside profit, owner pay and tax **first**, then run the business on the rest. A simple version for you:'),
  ...N([
    'Pay yourself a **fixed monthly salary** (owner drawings) set on the Setup sheet.',
    'Move the **tax reserve %** of every month’s profit into a separate tax savings account.',
    'Build a **cash buffer** of 3 months of spending.',
    'Only then spend on growth (marketing, hiring, equipment).',
  ]),
);

// ---------- 6. Marketing, brand & sales ----------
add(
  H1('6. Marketing, Branding and Sales'),
  H2('6.1 Plain definitions'),
  ...T(['Word', 'Plain meaning'], [
    ['Brand', 'What people say and feel about you when you’re not in the room. Logo and colours are only its face.'],
    ['Positioning', 'The specific place you own in your clients’ minds: “the ___ for ___”.'],
    ['Marketing', 'Everything that makes the right people know, like and trust you, so they enquire.'],
    ['Sales', 'Turning an enquiry into a paying client.'],
  ], [2000, 7026]),
  H2('6.2 Positioning statement (Week 9)'),
  ...Box('try', 'Template', [
    '**For** ____ (ideal client) **who** ____ (problem), **we provide** ____ (service) **that** ____ (key result). **Unlike** ____ (alternatives), **we** ____ (your real difference, with proof).',
    'Then shorten it into a **one-liner** you can say at an event or put on your profiles: “We help ____ to ____ so they can ____.”',
  ]),
  H2('6.3 Brand basics checklist'),
  ...B([
    'One business name, spelled the same everywhere.',
    'A clean logo and 2–3 brand colours, used consistently on invoices, proposals and profiles.',
    'Profiles that match and show how to contact you: **Google Business Profile**, **Facebook page**, **LinkedIn**, **WhatsApp Business** (with catalogue and quick replies).',
    '3–5 client testimonials (with permission), ideally with real results.',
    'A simple portfolio or case-study page (website, PDF or Google Drive).',
    'Professional email and a standard proposal and invoice template.',
  ]),
  H2('6.4 Marketing for a service business: what actually works'),
  ...T(['Priority', 'Channel', 'Why', 'First action'], [
    ['1', 'Referrals & repeat clients', 'Trust is already built; cheapest client you will ever get.', 'Ask happy clients for introductions and testimonials (Week 10).'],
    ['2', 'Direct outreach', 'You choose who to talk to.', 'List 30 ideal-client businesses; contact 5 a week with a useful message.'],
    ['3', 'One content channel', 'Shows expertise to many people at once.', 'Pick ONE (LinkedIn for B2B, Facebook/Instagram for consumers); post 2–3 times a week.'],
    ['4', 'Google Business Profile', 'People searching for your service nearby.', 'Complete the profile; ask clients for reviews.'],
    ['5', 'Paid ads', 'Speed, but costs money.', 'Only after margins are known; start small and measure cost per client.'],
  ], [900, 2200, 3000, 2926]),
  ...Box('key', 'One or two channels, done well', ['Most small businesses fail at marketing by doing a little of everything. Pick **referrals plus one channel** for the next 90 days, measure the results on the Sales Pipeline (Source column), then decide.']),
  H2('6.5 The sales process'),
  ...T(['Stage', 'What happens', 'Your standard'], [
    ['New enquiry', 'Someone contacts you.', 'Reply within 24 hours (same day is better).'],
    ['Contacted', 'You understand their need.', 'Ask questions before quoting.'],
    ['Meeting held', 'Call or meeting to scope the work.', 'Confirm budget, decision-maker and timeline.'],
    ['Proposal sent', 'Clear scope, price, timeline, terms.', 'Send within 2 working days.'],
    ['Negotiating', 'Questions, changes.', 'Follow up within 3 days; don’t discount without removing scope.'],
    ['Won / Lost', 'Decision.', 'Won: send invoice for advance. Lost: write the reason down.'],
  ], [2000, 3500, 3526]),
  ...Box('mistake', 'No follow-up', ['Many enquiries are lost simply because nobody followed up. The Sales Pipeline sheet flags any lead whose “next action date” has passed as **OVERDUE**.']),
  ...Box('try', 'Always take an advance', ['For project work, ask for 30–50% upfront. It protects your cash flow (Part 1.1) and filters out unserious clients.']),
);

// ---------- 7. Operations & army ----------
add(
  H1('7. Operations and Building Your Army'),
  H2('7.1 SOPs: getting work out of your head'),
  P('An **SOP** (standard operating procedure) is a simple checklist for a task you repeat. SOPs are how a business stops depending on one person. Start with the three tasks you do most often (e.g. onboarding a new client, delivering a project, monthly invoicing).'),
  ...Box('try', 'SOP template', [['**Name** of the task and **who** owns it', '**When** it happens (trigger)', '**Steps** numbered 1, 2, 3… (each one a clear action)', '**Tools / templates** used', '**Done when** (the quality check)', 'Record a screen video or voice note while you do the task; then write the steps from it.']]),
  H2('7.2 The roles in every business'),
  P('Even with only one or two people, every business has these jobs. Write a name next to each one; at first it will often be yours.'),
  ...T(['Role', 'Responsible for', 'Who now', 'Next step'], [
    ['Leader / CEO', 'Vision, plan, key decisions, people', 'You', 'Keep'],
    ['Delivery', 'Doing the client work to standard', '', 'SOPs → freelancers → staff'],
    ['Sales & marketing', 'Leads, proposals, brand, content', '', 'Freelance marketer or part-time assistant'],
    ['Finance & admin', 'Bookkeeping, invoices, payments, records', '', 'Bookkeeper (part-time) once routines are stable'],
    ['Tax & compliance', 'Returns, instalments, registrations', '', 'Accountant (Week 3)'],
    ['Legal', 'Contracts, structure, disputes', '', 'Lawyer as needed; client contract template'],
    ['Advisors', 'Experience, accountability', '', 'A mentor or experienced business owner, met monthly'],
  ], [1800, 3100, 1300, 2826]),
  H2('7.3 Who to hire or outsource first'),
  ...N([
    '**Accountant** (now): tax risk and deadlines.',
    '**Help with delivery** (freelancers): frees your time for sales and management. Only if margins allow it (check Service Pricing).',
    '**Bookkeeper or admin assistant** (part-time): once your routines and categories work, hand over the daily 10 minutes.',
    '**Marketing help**: once you know your positioning and channel.',
    '**Full-time staff**: when work is steady. Budget EPF 12% + ETF 3% on top of salary, plus gratuity after 5 years of service.',
  ]),
  ...Box('key', 'The delegation rule', ['Before you hand over a task: (1) write the SOP, (2) do it together once, (3) let them do it while you check, (4) let go and review weekly. Most delegation fails because step 1 is skipped.']),
  H2('7.4 The management rhythm'),
  ...T(['Meeting', 'When', 'Agenda'], [
    ['Daily check (alone or with team)', '10–15 min', 'Today’s priorities; any blockers; bookkeeping done?'],
    ['Weekly review', '30–60 min, same day each week', 'Numbers (Weekly Review sheet) → pipeline → overdue invoices → 90-Day Plan tasks → top 3 priorities for next week'],
    ['Monthly close & review', '1–2 hours', 'P&L, cash, dashboard warnings, forecast vs actual, lessons, decisions'],
    ['Quarterly planning', 'Half day', 'Goals review, next quarter’s 3 priorities, budget, people, accountant meeting'],
  ], [2600, 2200, 4226]),
  P('This rhythm is the heart of the “operating system”. Gino Wickman’s _Traction_ (the EOS method) explains a full version of this for small businesses.'),
);

// ---------- 8. The 13-week plan ----------
const learnByWeek = {
  'Week 0': 'Part 0 and Part 1 of this course. Start _Financial Intelligence for Entrepreneurs_ (Berman & Knight), part 1.',
  'Week 1': 'Part 2 (2.1–2.4). Keep reading _Financial Intelligence for Entrepreneurs_.',
  'Week 2': 'Part 2 (2.5–2.6). Free: Wharton’s “Introduction to Financial Accounting” on Coursera, week 1 (audit for free).',
  'Week 3': 'Part 3. IRD website: guides on TIN, income tax and instalments.',
  'Week 4': 'Part 1.1 again with your real numbers. Start _Profit First_ (Michalowicz).',
  'Week 5': 'Part 4. Finish _Profit First_.',
  'Week 6': 'Part 5.2–5.3. Start _The 1-Page Marketing Plan_ (Allan Dib) or _$100M Offers_ (Hormozi).',
  'Week 7': 'Part 5.4–5.5.',
  'Week 8': 'Part 5.6–5.7.',
  'Week 9': 'Part 6.1–6.3. Skim _Building a StoryBrand_ (Donald Miller) for the one-liner.',
  'Week 10': 'Part 6.4–6.5. Free: HubSpot Academy or Google’s free digital marketing courses (pick one module).',
  'Week 11': 'Part 7.1–7.3. Start _The E-Myth Revisited_ (Gerber).',
  'Week 12': 'Part 7.4. Skim _Traction_ (Wickman) chapters on meetings and scorecards.',
  'Week 13': 'Re-read your one-page plan and this whole document. Choose your Q1 2027 book.',
};
add(
  H1('8. The 13-Week Plan, Week by Week'),
  P('Each week has a theme, what to **learn**, what to **do**, and how you know it’s **done**. The same tasks are in the workbook’s **90-Day Plan** sheet so you can tick them off.'),
);
let lastMonth = '';
for (const w of PLAN) {
  if (w.month !== lastMonth) {
    add(new Paragraph({ children: [new TextRun({ text: w.month.toUpperCase(), bold: true, size: 26, color: 'FFFFFF' })], shading: { fill: ACCENT, type: ShadingType.CLEAR, color: 'auto' }, spacing: { before: 300, after: 160 }, indent: { left: 0 } }));
    lastMonth = w.month;
  }
  add(H2(`${w.week} (${w.dates}): ${w.theme}`));
  add(P('**Learn:** ' + learnByWeek[w.week]));
  add(...T(['Area', 'Do this', 'Done when…'], w.tasks.map((t) => [t[0], t[1], t[2]]), [1300, 4600, 3126]));
}
add(
  ...Box('key', 'If you fall behind', ['Don’t skip weeks; shrink them. The non-negotiables are: **separate bank account, bookkeeping up to date, accountant hired, tax deadlines met, a weekly review every week**. Everything else can move by a week without harm.']),
);

// ---------- 9. Resources ----------
add(
  H1('9. Learning Resources'),
  H2('9.1 Books, in reading order'),
  ...T(['When', 'Book', 'Why read it'], [
    ['October', '_Financial Intelligence for Entrepreneurs_ (Karen Berman & Joe Knight)', 'Financial statements explained for non-accountants. The foundation.'],
    ['Oct–Nov', '_Profit First_ (Mike Michalowicz)', 'A simple cash-management system for small businesses; owner pay and tax reserve.'],
    ['November', '_The 1-Page Marketing Plan_ (Allan Dib)', 'A practical marketing plan for small businesses on one page.'],
    ['November', '_$100M Offers_ (Alex Hormozi)', 'How to design and price offers people find hard to refuse.'],
    ['December', '_Building a StoryBrand_ (Donald Miller)', 'Clear messaging: how to describe what you do so people get it.'],
    ['December', '_The E-Myth Revisited_ (Michael Gerber)', 'Why owners get trapped doing all the work, and how systems free them.'],
    ['Q1 2027', '_Traction_ (Gino Wickman)', 'A complete operating system: vision, scorecards, meetings, people.'],
    ['Later', '_Simple Numbers, Straight Talk, Big Profits!_ (Greg Crabtree)', 'Profit benchmarks and owner pay for small firms.'],
    ['Later', '_Scaling Up_ (Verne Harnish)', 'When you are ready to grow a team and a bigger company.'],
  ], [1300, 3700, 4026]),
  H2('9.2 Free courses'),
  ...B([
    '**Coursera: “Introduction to Financial Accounting”** (Wharton, University of Pennsylvania). Free to audit.',
    '**Khan Academy: accounting and financial statements** (in the Finance and Capital Markets section). Short videos.',
    '**HubSpot Academy**: free marketing and sales courses with certificates.',
    '**Google’s free digital marketing and Business Profile training** (Grow with Google / Skillshop).',
  ]),
  H2('9.3 Sri Lankan sources'),
  ...B([
    '**Inland Revenue Department (ird.gov.lk)**: TIN registration (e-Services), tax guides, notices and deadlines.',
    '**Department of the Registrar of Companies (eROC)**: company registration.',
    '**CA Sri Lanka, CMA Sri Lanka, AAT Sri Lanka**: finding qualified accountants; short courses in accounting and tax.',
    '**Tax firms’ alerts** (e.g. KPMG Sri Lanka tax news): plain summaries of new tax laws.',
    '**National Enterprise Development Authority (NEDA)** and the **Industrial Development Board**: SME support and training.',
    '**Chambers of commerce** (e.g. the Ceylon Chamber of Commerce, regional chambers) and industry bodies (e.g. SLASSCOM for IT services): networking, events, referrals.',
  ]),
  H2('9.4 Sources used for the tax facts in this course'),
  ...B([
    'Inland Revenue (Amendment) Act No. 11 of 2026 summaries (KPMG Sri Lanka; Daily Mirror; Daily FT), June 2026.',
    'Personal income tax relief Rs 1.8 million and slab rates from Y/A 2025/26 (KPMG Sri Lanka tax alert on the Inland Revenue (Amendment) Act, March 2025).',
    'TIN compulsory for key transactions from 1 November 2026 (Daily FT, 2026).',
    'VAT (Amendment) Act No. 14 of 2026, threshold kept at Rs 60 million (KPMG Sri Lanka, 2026; taxadvisor.lk).',
    'SSCL thresholds from 1 July 2026 (taxadvisor.lk SSCL timeline).',
    'WHT 5% on service fees above Rs 100,000/month: IRD Circular SEC/2026/E/04 (June 2026).',
    'Instalment and return due dates: Daily FT “All about tax deadlines”; IRD public ruling on instalment due dates.',
  ]),
);

// ---------- 10. Working with Claude ----------
add(
  H1('10. Using Me as Your Coach Through the 90 Days'),
  P('You asked for help following this plan. Here is how to use me (Claude) week by week. Copy a prompt, fill in the blanks, and send it.'),
  ...T(['When', 'Prompt to send'], [
    ['Weekly review', '“Week __ review. Money in Rs __, out Rs __. Tasks done: __. Stuck on: __. What should I focus on next week?”'],
    ['Category doubt', '“I paid Rs __ for __. Which category and type should it go under?”'],
    ['Month-end', '“Here are my Dashboard numbers for __: revenue __, gross margin __%, net profit __, cash __, overdue __. What do you see, and what should I do?”'],
    ['Pricing', '“Here is my Service Pricing sheet: [paste]. Which services should I raise, push or drop?”'],
    ['Plan review', '“Here is my one-page business plan: [paste]. Challenge it like an experienced advisor.”'],
    ['Marketing', '“Here are my client interview notes: [paste]. Write my positioning statement, one-liner and 4 weeks of posts.”'],
    ['Accountant prep', '“I’m meeting my accountant next week. Here’s my situation: __. What should I ask?”'],
    ['SOP writing', '“Here is how I do __ (voice-note transcript): [paste]. Turn it into an SOP checklist.”'],
  ], [2000, 7026]),
  ...Box('key', 'The one thing', ['If you remember only one thing from this course: **every week, sit down for 30 minutes and look at your numbers.** That single habit, kept for 13 weeks, will change how you run the business more than any book.']),
  H2('Glossary'),
  ...T(['Term', 'Meaning'], [
    ['Advance', 'Part of the fee paid before work starts.'],
    ['Chart of accounts', 'Your list of categories for recording money.'],
    ['Concentration risk', 'Depending too much on one client.'],
    ['Drawings', 'Money the owner takes from the business for personal use.'],
    ['EPF / ETF', 'Employees’ Provident Fund / Employees’ Trust Fund: compulsory contributions for employees.'],
    ['Forecast', 'A plan for future revenue and costs, in numbers.'],
    ['KPI', 'Key performance indicator: a number you track regularly.'],
    ['Month-end close', 'Finishing and checking the books for the month.'],
    ['Pipeline', 'All your open sales opportunities.'],
    ['Reconciliation', 'Checking your records against the bank statement.'],
    ['Runway', 'How many months your cash would last at the current spending.'],
    ['SOP', 'Standard operating procedure: a checklist for a repeated task.'],
    ['SSCL', 'Social Security Contribution Levy: 2.5% levy on turnover above the threshold.'],
    ['TIN', 'Taxpayer Identification Number from the IRD.'],
    ['WHT', 'Withholding tax: tax a payer deducts before paying you.'],
    ['Y/A', 'Year of Assessment: the tax year, 1 April – 31 March.'],
  ], [2400, 6626]),
);

// =====================================================================
const numberingConfigs = [
  { reference: 'bullets', levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
  ] },
  ...Array.from({ length: 40 }, (_, i) => ({ reference: 'num' + i, levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 320 } } } },
  ] })),
];
const doc = new Document({
  creator: 'Business Operating System',
  title: 'The 90-Day Business Operating System',
  description: 'Practical crash course for running a Sri Lankan service business, Oct–Dec 2026',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: NAVY, font: FONT },
        paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 27, bold: true, color: '2E5597', font: FONT },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, color: '404040', font: FONT },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: numberingConfigs },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'The 90-Day Business Operating System', size: 18, color: '8C8C8C' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '8C8C8C' })] })] }) },
    children: C,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log('written', process.argv[2]); });
