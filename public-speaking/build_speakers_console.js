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
  research: { fill: 'DEEAF6', edge: '2E75B6', label: 'RESEARCH SAYS' },
  try: { fill: 'E2EFD9', edge: '538135', label: 'TRY IT NOW' },
  mistake: { fill: 'FBE4E4', edge: 'C00000', label: 'BEGINNER MISTAKE' },
  link: { fill: 'EDE7F6', edge: '5B3F8F', label: 'HOW THIS CONNECTS' },
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
// CONTENT
// =====================================================================
const C = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? C.push(...x) : C.push(x)));

// ---------- Title page ----------
add(
  new Paragraph({ children: [], spacing: { before: 2400 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'THE SPEAKER’S CONSOLE', bold: true, size: 56, color: NAVY })], spacing: { after: 200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'One connected note on public speaking', size: 32, color: '404040' })], spacing: { after: 120 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'From beginner to the standard of a great talk: idea, structure, language, voice, body, connection, story and explanation, taught as one system', italics: true, size: 24, color: '595959' })], spacing: { after: 600 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 8 } }, children: [], spacing: { after: 200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: runs('Built from the TED lessons on giving a great talk, expanded with communication research, a grammar and phrase foundation, and a 30-day practice plan.', { size: 22, color: '404040' }), spacing: { after: 120 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: runs('For: school and work presentations · everyday conversation · stage talks', { size: 22, bold: true, color: NAVY }) }),
);

// ---------- TOC ----------
add(
  new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Contents', bold: true, size: 36, color: NAVY })], spacing: { after: 200 } }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  P('_If the contents list looks empty, right-click it in Word and choose “Update Field”._', { run: { size: 20, color: '7F7F7F' } }),
);

// ---------- 0. How to use + the map ----------
add(
  H1('0. Start Here: The Whole System on One Page'),
  P('Most speaking advice arrives as a pile of separate tips: make eye contact, tell a story, don’t say “um”. Tips on their own don’t stick, because you can’t see why they matter or how they fit together. This note does the opposite. Every idea from the lessons hangs on **one picture**, and every chapter is one stop on it.'),
  H2('The one picture: a talk is a journey, and you are the tour guide'),
  P('You have something in your head that matters to you: an **idea**. Your job is to walk your listeners, step by step, from where they are now to a new place where they can see that idea too. When they get there, the idea has been **rebuilt in their minds**. That is all speaking is. Everything else in this note is a tool for making that walk easier.'),
  ...T(['Stop', 'Journey metaphor', 'The question it answers', 'Chapter'], [
    ['1', 'The destination (the gift)', 'What do I want them to walk away with?', '1–2'],
    ['2', 'The path (the throughline)', 'What single line connects everything I say?', '3'],
    ['3', 'The route plan (structure)', 'What are the steps, in what order?', '4'],
    ['4', 'The vehicle (language)', 'Which words and sentences carry the idea best?', '5'],
    ['5', 'The travel plan (script or notes)', 'How will I prepare so I don’t get lost?', '6'],
    ['6', 'The guide’s voice and presence', 'How do my voice and body add meaning?', '7–8'],
    ['7', 'Trust in the guide (connection)', 'Why would they follow me?', '9'],
    ['8', 'The two engines: story and explanation', 'How do I move people and make them understand?', '10–11'],
    ['9', 'Practice', 'How do I get good at the walk?', '12–14'],
  ], [700, 2600, 3926, 1800]),
  ...Box('key', 'The whole course in five sentences', [
    '1. Have **something worth saying**: an idea that is a gift to the listener.',
    '2. Connect everything to **one throughline** you can say in 15 words or fewer.',
    '3. Lead people **step by step** from what they already know, using examples, metaphors and stories.',
    '4. Deliver it as **a human**: vary your voice, use your body with purpose, look people in the eye, drop the ego.',
    '5. **Prepare and rehearse** until the words are part of you, then speak them as if for the first time.',
  ]),
  H2('How to use this note'),
  ...B([
    '**Read it in order once.** Each chapter builds on the one before, just as a good talk does.',
    '**Do every “Try it now” box.** Speaking is a physical skill, like swimming. Reading about it is not enough; you have to speak out loud.',
    '**Coloured boxes** mean: yellow = key idea, blue = research, green = exercise, red = common beginner mistake, purple = how this links to the rest of the system.',
    '**Chapter 5 (Language Foundation)** fills in the grammar and phrase basics you asked for. Come back to it often.',
    '**Chapter 13 is a 30-day plan.** Start it the day after you finish reading.',
  ]),
  ...Box('link', 'Three settings, one skill', [
    'You said you want to speak well in **presentations**, **everyday conversation** and **stage talks**. These are the same skill at different sizes. A good conversational answer is a 30-second talk: one point (throughline), a reason, an example, and a clear finish. Each chapter shows how its tool works in all three settings.',
  ]),
);

// ---------- 1. What speaking really is ----------
add(
  H1('1. The Core: Speaking Is Rebuilding an Idea in Someone Else’s Mind'),
  H2('1.1 What an idea is'),
  P('Your number one mission as a speaker is to take something that matters deeply to you and **rebuild it in the minds of your listeners**. That something is an idea. Think of it as a **gift**: something the audience can walk away with, value and be changed by.'),
  P('An idea does not need to be a scientific discovery. It can be:'),
  ...B([
    '**A skill:** instructions for something you know how to do.',
    '**A story and its lesson:** something that happened to you and what it taught you.',
    '**A vision:** how you think the future could or should look.',
    '**A reminder:** of what matters most, told in a fresh way.',
    '**A question:** something you are curious about, and your search for an answer.',
  ]),
  ...Box('key', 'Definition to memorise', ['**An idea is anything that can change how people see the world.** If you can build an exciting idea in someone’s mind, a small piece of you becomes part of them.']),
  H2('1.2 Example: Sophie Scott and laughter'),
  P('In 2015 the neuroscientist Sophie Scott gave a TED Talk on laughter. She played recordings of real people laughing and pointed out how strange the sound is: “much more like an animal call than it is like speech.” The audience cracked up. But she gave them more than a good time. Her core idea was that **laughter exists to help humans bond**; it strengthens relationships. Nobody who heard her ever hears laughter the same way again. That is a gift.'),
  P('Notice what she did: a surprising demonstration (curiosity) → a clear idea (laughter is social glue) → evidence (her research) → a changed view of an everyday thing. Keep this pattern in mind; you will meet it again in Chapter 11.'),
  H2('1.3 Why words are so powerful: the elephant test'),
  P('Imagine an elephant with its trunk painted bright red, waving it in time with the shuffling steps of a giant orange parrot dancing on its head and shrieking, “Let’s do the fandango!”'),
  P('You just built a picture that has never existed anywhere except in the minds of people who read that sentence. **One sentence did that.** Language lets us copy a pattern from one brain into another. That is why speaking skill is worth so much effort.'),
  ...Box('research', 'Speaker and listener brains sync up', [
    'In 2010 Greg Stephens, Lauren Silbert and Uri Hasson (Princeton) scanned the brain of a woman telling a story, then scanned people listening to a recording of it. The listeners’ brain activity **mirrored the speaker’s**, with a short delay. The closer the match, the **better the listener understood** the story. Some listener brain areas even ran slightly ahead, predicting what would come next. _(Proceedings of the National Academy of Sciences, 2010.)_',
    'So “rebuilding an idea in someone’s mind” is close to literally true. Good communication gets brains in step with each other.',
  ]),
  H2('1.4 The guide’s three duties'),
  P('If a talk is a journey and you are the guide, then you must:'),
  ...N([
    '**Start where the audience is.** Begin with something they already know, feel or care about.',
    '**Don’t lose anyone.** No rushing ahead, no sudden changes of direction, no jargon without explanation.',
    '**Arrive somewhere beautiful.** End at a place that is new and worth the trip.',
  ]),
  ...Box('try', 'The one-sentence gift', [
    'Finish this sentence out loud, three times, about three different topics: **“After listening to me, people will see ____ differently, because ____.”**',
    'Example: “After listening to me, people will see _boredom_ differently, because _it is a signal from the brain to go and create something_.”',
  ]),
  ...Box('link', 'Where this leads', ['The gift is your destination. The next chapter shows how to find a gift worth giving, and Chapter 3 turns it into a throughline: the path to that destination.']),
);

// ---------- 2. Finding your idea ----------
add(
  H1('2. Finding Your Idea: You Are the Only You'),
  P('Many beginners freeze at the question “What would I even talk about?” They think, “I’m not creative,” or “I haven’t done anything exciting.” The truth: **everyone has a great talk idea inside them**. It just takes some digging.'),
  P('You are the only you who has existed in all of human history. Your experiences are yours alone, and some of them taught you things worth sharing.'),
  H2('2.1 Why you can’t see your own best ideas'),
  P('You have always been you, so you only see yourself from the inside. The things other people find remarkable about you feel normal to you.'),
  ...Box('research', 'The Johari Window', [
    'Psychologists Joseph Luft and Harrington Ingham (1955) described four “windows” of self-knowledge. One of them is the **blind spot**: things others know about you that you don’t. This is why the lessons suggest asking the people who know you best. They can see what you can’t.',
  ]),
  H2('2.2 Two ways to dig'),
  H3('Method 1: Ask people who know you'),
  ...B([
    '“What do you think I’m unusually good at?”',
    '“What do I talk about that you find interesting?”',
    '“What have you learned from me?”',
    '“What would you come to me for advice about?”',
  ]),
  H3('Method 2: Ask yourself questions'),
  ...T(['Area', 'Questions'], [
    ['Emotion', 'What was the last thing that really excited me? Angered me? What brings me joy? What annoys me?'],
    ['Pride', 'What am I proud of? What difficult thing have I done?'],
    ['Knowledge', 'What could I talk about for hours? What do I know that most people don’t?'],
    ['Community', 'What could my community, job or culture teach others?'],
    ['Change', 'What would I change in the world? If I had a magic wand, which idea would I spread?'],
    ['Curiosity', 'What question do I keep wondering about? What riddle has no good answer yet?'],
  ], [1800, 7226]),
  H2('2.3 Your talk can be a search, not just an answer'),
  P('You don’t need perfect knowledge today. If a topic interests you but you don’t know enough, **use the talk as your reason to find out more**. The research becomes the journey you take the audience on.'),
  ...Box('key', 'What really matters', ['The only thing that truly matters in public speaking is **not confidence, stage presence or smooth talking. It is having something worth saying.** Confidence grows from knowing your idea is worth their time.']),
  H2('2.4 In everyday conversation and at work'),
  P('The same principle scales down. In a meeting, your “idea” is the single point you want people to remember. In a conversation, it is the one thing you actually want to say. Before you speak, ask yourself: **“What is my point?”** If you can’t answer, you’re not ready to talk yet. Wait a moment, find it, then speak.'),
  ...Box('try', 'Build your Idea Bank (15 minutes)', [
    'Take a notebook page. Answer every question in the table above in one line each. Then ask two people who know you well the Method 1 questions. Circle the three answers that give you the most energy. Those are your first three talk topics. Keep adding to this bank all month.',
  ]),
);

// ---------- 3. Throughline ----------
add(
  H1('3. The Throughline: The Path That Connects Everything'),
  P('The number one reason talks fail to say anything meaningful is that the speaker **had no plan for the talk as a whole**. They planned sentence by sentence, but not how it all links up.'),
  ...Box('key', 'Definition', ['The **throughline** is the main idea that ties together everything you say. It does not mean you can only tell one story or cover one topic. It means **everything connects to support the main idea**. If a talk is a journey, the throughline is the path.']),
  H2('3.1 Without a throughline vs. with one'),
  ...T(['Without a throughline', 'With a throughline'], [
    ['“I want to share some experiences from my recent trip to Cape Town, and then make a few observations about life on the road.”',
     '“On my recent trip to Cape Town, I learned something new about strangers: when you can trust them, and when you definitely can’t. Let me share two very different experiences.”'],
  ], [4513, 4513]),
  P('The first is a list. The second is a **promise**: the listener knows where the journey is going, so they pay attention.'),
  H2('3.2 Real throughlines from popular TED Talks'),
  ...B([
    '“More choice actually makes us less happy.”',
    '“Vulnerability is something to be treasured, not hidden from.”',
    '“Let’s bring on a quiet revolution: a world redesigned for introverts.”',
    '“A history of the universe in 18 minutes shows a journey from chaos to order.”',
    '“Terrible city flags can reveal surprising design secrets.”',
    '“A ski trek to the South Pole threatened my life and changed my sense of purpose.”',
  ]),
  P('Notice: each is **one sentence**, each has **tension or surprise**, and each tells you **what you will gain**.'),
  H2('3.3 Overstuffed = under-explained'),
  P('The wrong way to fit a talk into limited time is to include every point but cover each one briefly. The result is a summary with no force. The right way is to **cut topics** and **explore fewer points deeply**.'),
  P('To say something meaningful, you must do two things:'),
  ...N([
    '**Show why it matters.** What question are you answering? What problem are you solving? What experience are you sharing?',
    '**Flesh out each point** with real examples, stories and facts. That is how an idea gets built in someone else’s mind.',
  ]),
  ...Box('research', 'Why less is more: working memory', [
    'Psychologist Nelson Cowan (2001) found that people can hold only about **four chunks** of new information in mind at once. A listener can’t re-read what you said. If you give ten quick points, most will be lost. Two or three well-explained points, each backed by an example, is about the most a listener can carry.',
  ]),
  H2('3.4 Build your throughline: the 15-word rule'),
  P('Say your throughline in **15 words or fewer**. If you can’t, your idea isn’t clear yet, to you or to anyone else.'),
  ...Box('try', 'Throughline templates (fill in the blanks)', [
    ['“Most people think ____, but actually ____.” _(surprise)_',
     '“____ taught me that ____.” _(story and lesson)_',
     '“If we ____, we could ____.” _(vision)_',
     '“Here’s how to ____ in three steps.” _(skill)_',
     '“Why does ____? The answer changes how we ____.” _(explanation)_'],
  ]),
  H2('3.5 The throughline checklist'),
  ...B([
    'Does this topic mean something to me?',
    'Does it spark curiosity? Does it offer a new way of seeing something?',
    'Is it a gift? Does it ask a question?',
    'Is the information fresh or unexpected?',
    'Can I truly explain it, with examples, in the time I have?',
    'Do I know enough, or do I need to research?',
    'Does it connect to my own experience?',
    'What are the 15 words? Would those 15 words make someone want to hear it?',
  ]),
  P('Speaking coach Abigail Tenembaum recommends **testing your throughline on a real person**. Saying it out loud shows you which parts are clear, which need more explanation, and which should be cut.'),
  H2('3.6 Throughlines everywhere'),
  ...T(['Setting', 'What the throughline looks like'], [
    ['Stage talk', 'The 15-word core idea of the whole talk.'],
    ['Work presentation', 'Your recommendation or key finding, stated in the first 30 seconds (“We should move the launch to March because testing isn’t finished.”).'],
    ['Meeting / email', 'The **bottom line up front** (BLUF): say the conclusion first, then the reasons.'],
    ['Conversation / interview answer', 'Your one-sentence answer before the explanation (“Yes, I’ve led a team: last year I managed four people on…”).'],
  ], [2400, 6626]),
  ...Box('mistake', 'Starting with the backstory', ['Beginners often start at the beginning (“So, in 2019, I was working at…”) and reach the point three minutes later, after the listener has drifted away. Put the point, or at least the promise of the point, **first**.']),
);

// ---------- 4. Structure ----------
add(
  H1('4. Structure: Planning the Route Step by Step'),
  P('Once you have the throughline, you decide what to attach to it. A good structure is simply the **order of steps** that takes the listener from where they are to your destination without any impossible leaps.'),
  H2('4.1 The three-part skeleton'),
  ...T(['Part', 'Job', 'Roughly'], [
    ['Opening', 'Grab attention; show why it matters; hint at the throughline. Start where the audience is.', '10–15%'],
    ['Body', '2–3 main points (steps on the path), each with an example, story or fact.', '70–80%'],
    ['Close', 'Bring it home: restate the idea in a fresh way; show what changes now; leave one image or action.', '10%'],
  ], [1600, 5826, 1600]),
  H2('4.2 Ways to open'),
  ...B([
    '**A surprising fact or demonstration** (Sophie Scott played laughter recordings).',
    '**A short personal story** (George Monbiot: “When I was a young man, I spent six years of wild adventure in the tropics…”).',
    '**A question that creates curiosity** (Dan Gilbert: “What is it about a big brain that nature was so eager for every one of us to have one?”).',
    '**A vivid image** (“Imagine…”).',
    '**A clear promise** (“In the next ten minutes I’ll show you why…”).',
  ]),
  ...Box('mistake', 'Weak openings to avoid', ['“Hi, my name is… and today I’m going to talk about…” followed by thanks and apologies. Use your first 20 seconds to **earn attention**, not to spend it. (A simple greeting is fine; just follow it immediately with your hook.)']),
  H2('4.3 Five route plans (pick one)'),
  ...T(['Pattern', 'Steps', 'Best for'], [
    ['Story → Lesson', 'Situation → problem → what I did → what happened → what I learned → what it means for you', 'Personal talks, inspiration'],
    ['Problem → Solution', 'Problem → why it matters → cause → solution → evidence → call to action', 'Work presentations, pitches'],
    ['Explanation ladder', 'Curious question → building block 1 → block 2 → block 3 → the big idea → what it means', 'Teaching complex ideas (Ch. 11)'],
    ['Myth → Truth', 'What people believe → why it seems true → the surprising evidence → the real picture', 'Changing minds'],
    ['Past → Present → Future', 'How it was → how it is → how it could be', 'Updates, vision talks'],
  ], [2000, 4826, 2200]),
  H2('4.4 Small structures for everyday speaking'),
  P('These are mini-throughlines for moments when you must speak without preparation.'),
  ...T(['Formula', 'Steps', 'Example'], [
    ['PREP (opinions, answers)', '**P**oint → **R**eason → **E**xample → **P**oint again',
      'P: “I think we should hire a designer.” R: “Our customers judge us by our website.” E: “Last month 60% of visitors left the home page within ten seconds.” P: “So a designer would pay for themselves.”'],
    ['STAR (interviews, reports)', '**S**ituation → **T**ask → **A**ction → **R**esult',
      '“Our sales dropped (S). I had to find out why (T). I called 20 customers (A). We fixed the checkout problem and sales recovered in a month (R).”'],
    ['What? So what? Now what?', 'What happened → why it matters → what we do next', 'Updates in meetings, feedback.'],
    ['BLUF', 'Bottom line first, then details', 'Emails, reporting to a boss.'],
  ], [2000, 2826, 4200]),
  ...Box('try', 'The 60-second PREP drill', [
    'Pick any question: “Is social media good for people?”, “What’s the best city you’ve visited?”, “Should school start later?” Set a timer for 60 seconds and answer using PREP, out loud. Record it. Did you state your point in the first sentence? Did you give a real example? Did you end with the point again?',
  ]),
  H2('4.5 Signposts: showing the route as you walk it'),
  P('Listeners can’t see paragraphs or headings. **Signposts** are spoken headings. They tell people where they are on the journey: “There are two reasons. The first…”, “So that’s the problem. Now let’s look at the solution.”, “Here’s the surprising part.” Chapter 5 has a full phrase bank.'),
  ...Box('link', 'Where this leads', ['You now have the destination (idea), the path (throughline) and the route (structure). Next: the vehicle, meaning the words and sentences that carry the idea.']),
);

// ---------- 5. Language foundation ----------
add(
  H1('5. The Language Foundation: Grammar, Words and Phrases for Speaking'),
  P('You said English is your first language but the fundamentals of grammar and phrases feel shaky. Good news: **spoken English needs far less grammar than written English**, and the grammar it does need is simple. This chapter gives you the base you need to “play with the language”.'),
  ...Box('key', 'Spoken rule number one', ['**Clarity beats correctness.** Audiences forgive a small grammar slip. They do not forgive confusion. Short sentences, clear verbs, and good linking words will do more for you than any grammar rule.']),
  H2('5.1 The sentence engine'),
  P('Almost every clear sentence follows this order:'),
  ...T(['Who / What (subject)', 'Does (verb)', 'What (object)', 'Detail (where / when / how / why)'], [
    ['I', 'moved', 'to London', 'in 2019.'],
    ['Our team', 'missed', 'the deadline', 'because the data arrived late.'],
    ['Laughter', 'builds', 'trust', 'between people.'],
  ], [2300, 1800, 2000, 2926]),
  ...B([
    '**One idea per sentence.** If a sentence has three “and”s in it, split it.',
    '**Put the important word near the end.** The end of a sentence is where the stress naturally falls. “What changed everything was **one phone call**.”',
    '**Use active voice.** Active: “We made a mistake.” Passive: “Mistakes were made.” Active is clearer, stronger and more honest.',
  ]),
  H2('5.2 The six tenses you actually need'),
  ...T(['Tense', 'Form', 'Use it for', 'Example'], [
    ['Present simple', 'I work / she works', 'Facts, habits, your throughline', '“Choice makes us less happy.”'],
    ['Past simple', 'I walked / I went', 'The main events of a story', '“I opened the door and saw…”'],
    ['Past continuous', 'I was walking', 'Setting the scene, background action', '“I was walking home when my phone rang.”'],
    ['Present perfect', 'I have learned', 'Experience, and past that matters now', '“I’ve given this talk to 200 students.”'],
    ['Future', 'will / going to', 'Promises, predictions, plans', '“I’m going to show you three things.”'],
    ['Conditional', 'If… would / could', 'Vision, imagination, advice', '“If we slept more, we would learn faster.”'],
  ], [1700, 1800, 2400, 3126]),
  ...Box('mistake', 'Jumping between tenses in a story', ['“So I **walk** into the room and she **looked** at me and I **say**…” Pick one: past (“I walked… she looked… I said”) or the dramatic present (“I walk in, she looks at me, I say…”). The dramatic present makes a story feel live, but stay in it once you start.']),
  H2('5.3 The grammar slips people notice most'),
  ...T(['Instead of…', 'Say…', 'Why'], [
    ['Me and him went', 'He and I went', 'Subject position needs I / he / she. Quick test: remove the other person. “Me went” is wrong, “I went” is right.'],
    ['Between you and I', 'Between you and me', 'After words like between, for, with, to, use me / him / her.'],
    ['Should of / could of', 'Should have / could’ve', '“Could’ve” sounds like “could of”, but “of” is never right here.'],
    ['Less people', 'Fewer people', 'Fewer for things you can count; less for amounts (less time, fewer minutes).'],
    ['The list of items are', 'The list of items is', 'The verb agrees with the real subject (the list), not the nearest noun.'],
    ['There’s lots of reasons', 'There are lots of reasons', 'Plural things take “there are”.'],
    ['I could care less', 'I couldn’t care less', 'You mean you care the least possible.'],
    ['Irregardless', 'Regardless', 'Not standard English.'],
    ['Me and my team would like', 'My team and I would like', 'Put yourself last; it is also more polite.'],
    ['Who / whom panic', 'Just use “who” when speaking', 'In speech, “who” is almost always fine.'],
  ], [2300, 2300, 4426]),
  H2('5.4 Word power: from vague to vivid'),
  P('Great speakers use **concrete, specific words** that make pictures, like the red-trunked elephant. Replace vague words with precise ones.'),
  ...T(['Vague', 'Stronger', 'Vague', 'Stronger'], [
    ['very good', 'excellent, outstanding', 'very bad', 'terrible, awful'],
    ['very big', 'huge, enormous, massive', 'very small', 'tiny'],
    ['very important', 'essential, crucial', 'very tired', 'exhausted'],
    ['a lot of people', '3,000 people / half the class', 'got better', 'doubled / improved by 20%'],
    ['said', 'whispered, shouted, admitted', 'went', 'rushed, wandered, drove'],
    ['things', 'name them: tools, habits, reasons', 'stuff', 'be specific'],
  ], [1900, 2613, 1900, 2613]),
  H3('Hedging vs. confident language'),
  P('Small “softener” words make you sound unsure. Use them only when you really are unsure.'),
  ...T(['Weak / unsure', 'Confident'], [
    ['“I just kind of think maybe we could…”', '“I recommend we…”'],
    ['“Sorry, this is probably a stupid question, but…”', '“I have a question.”'],
    ['“I’m not an expert, but…”', '“From my experience…”'],
    ['“Does that make sense?” (after every point)', '“Let me give you an example.”'],
  ], [4513, 4513]),
  H2('5.5 Linking words: the glue of spoken English'),
  P('Linking words show **how** ideas connect. They are the easiest way to sound organised and fluent.'),
  ...T(['Job', 'Linking words'], [
    ['Add', 'and, also, on top of that, what’s more, not only… but also'],
    ['Contrast', 'but, however, yet, on the other hand, even so, although, whereas'],
    ['Cause', 'because, since, as, that’s why, due to'],
    ['Result', 'so, therefore, as a result, which means, that’s why'],
    ['Sequence', 'first, next, then, after that, finally, meanwhile'],
    ['Example', 'for example, for instance, like, such as, take…, imagine…'],
    ['Emphasis', 'in fact, actually, especially, above all, here’s the thing'],
    ['Summary', 'so, in short, overall, to sum up, the bottom line is'],
  ], [1800, 7226]),
  H2('5.6 Phrase banks'),
  H3('Openings'),
  ...B([
    '“Imagine for a moment that…”', '“Have you ever wondered why…?”', '“Here’s something most people don’t know…”',
    '“A year ago, I was…”', '“Let me start with a question.”', '“In the next ten minutes, I want to show you…”',
  ]),
  H3('Signposting (moving along the path)'),
  ...B([
    '“There are three things I want to share.”', '“Let’s start with…”', '“That brings me to my second point.”',
    '“So that’s the problem. Now, what can we do about it?”', '“Here’s where it gets interesting.”', '“Let me pause here, because this matters.”',
  ]),
  H3('Giving examples and explaining'),
  ...B(['“Let me give you an example.”', '“Think of it like…” (metaphor)', '“In other words…”', '“To put it simply…”', '“What this means is…”', '“Picture this…”']),
  H3('Emphasis'),
  ...B(['“Here’s the key point.”', '“If you remember one thing, remember this.”', '“This is the part that surprised me.”', '“I want to be really clear about this.”']),
  H3('Closing'),
  ...B(['“So, where does this leave us?”', '“Let me bring it back to where we started.”', '“The next time you ___, I hope you’ll ___.”', '“Here’s my challenge to you…”', '“Thank you.” (Say it once, clearly, then stop.)']),
  H3('Buying time without “um”'),
  ...B(['“That’s a great question. Let me think for a second.” (then actually pause)', '“Let me put it another way.”', '“The short answer is ___; the longer answer is ___.”']),
  H3('Handling questions'),
  ...B(['“Good question. The short answer is…”', '“If I understand you correctly, you’re asking… Is that right?”', '“I don’t know, but I’ll find out and get back to you.” (Honest beats bluffing.)', '“That’s a bit outside today’s topic, but happy to talk after.”']),
  H3('Meetings and work'),
  ...B(['“Can I add something here?”', '“I see it slightly differently.”', '“I agree with ___, and I’d add that…”', '“Just to make sure we’re aligned: ___.”', '“What I’m proposing is…”', '“The main risk is ___, and here’s how we handle it.”']),
  H3('Everyday conversation'),
  ...B([
    '**Openers:** “How’s your week been?”, “What have you been working on lately?”, “How do you know ___?”',
    '**Follow-ups (the secret of good conversation):** “What was that like?”, “How did you get into that?”, “What happened next?”, “Why do you think that is?”',
    '**Active listening:** “So what you’re saying is…”, “That makes sense.”, “Wait, really? Tell me more.”',
    '**Polite disagreement:** “I get that. I see it a bit differently, though.”, “That’s fair. Have you considered…?”',
    '**Exits:** “It’s been great talking to you. I’ll let you get back to it.”',
  ]),
  H2('5.7 Five rhetorical tools that make speech memorable'),
  ...T(['Tool', 'How it works', 'Example'], [
    ['Rule of three', 'Lists of three feel complete and are easy to remember.', '“Connection, curiosity, courage.”'],
    ['Contrast', '“Not X, but Y” sharpens a point.', '“Ask not what your country can do for you; ask what you can do for your country.”'],
    ['Repetition', 'Repeat a key phrase at the start of sentences.', '“I have a dream…” (repeated by Martin Luther King Jr.)'],
    ['Rhetorical question', 'Ask a question you then answer; it makes listeners think.', '“So why does this matter? Because…”'],
    ['Callback', 'Return at the end to an image from the opening.', 'Open with the elephant; close with the elephant.'],
  ], [1900, 3500, 3626]),
  H2('5.8 Write for the ear, not the eye'),
  P('Harvard psychologist Dan Gilbert tells his students to **speak their talk into a recorder first**, then use the transcript as a first draft. Spoken language is different from written language:'),
  ...T(['Written style', 'Spoken style'], [
    ['Long sentences with clauses', 'Short sentences. One idea each.'],
    ['“It is noteworthy that…”', '“Here’s the interesting part.”'],
    ['Formal words (utilise, commence)', 'Everyday words (use, start)'],
    ['No contractions (do not, it is)', 'Contractions (don’t, it’s)'],
    ['Say it once', 'Repeat key points; the listener can’t re-read'],
    ['Headings show structure', 'Signposts show structure'],
  ], [4513, 4513]),
  P('There is an exception: some talks, like Amanda Gorman’s poetic TED-Ed talk, use crafted, literary language on purpose. That works when the writing itself is the performance. For most talks, use spoken style.'),
  ...Box('try', 'Daily language drills (10 minutes)', [
    ['**Read aloud** 5 minutes a day from a good speech or article. Your mouth learns good sentence rhythms.',
     '**Upgrade a sentence:** take one vague sentence you said today and rewrite it with a precise verb and a number or image.',
     '**Linking-word challenge:** tell someone about your day using at least five different linking words from 5.5.',
     '**Phrase of the day:** choose one phrase from 5.6 and use it in real conversation.'],
  ]),
);

// ---------- 6. Presentation plan ----------
add(
  H1('6. The Presentation Plan: Script, Notes, or Neither'),
  P('Before rehearsing, decide **how** you will carry the talk in your head. There is no single right way. The key is to pick a plan you feel confident about, commit to it, and put in the time.'),
  H2('6.1 Your options'),
  ...T(['Option', 'What it is', 'Strength', 'Risk'], [
    ['Memorised script', 'Write every word, learn it by heart', 'Most precise and powerful; most TED speakers do this', 'Sounds robotic if not learned deeply enough'],
    ['Read from script', 'Bring the script on stage', 'Safe, precise', 'Loss of eye contact and energy'],
    ['Notes / bullet points', 'Plan the steps, find the words live', 'Fresh and natural', 'Rambling, forgetting steps'],
    ['No notes (unscripted)', 'Know the journey; speak freely', 'Most alive, like thinking out loud', 'Needs deep knowledge and practice'],
  ], [1800, 2400, 2426, 2400]),
  H2('6.2 The memorisation curve (the “robot stage”)'),
  P('Imagine watching a friend memorise a talk over a week:'),
  ...T(['Days', 'What you see', 'Why'], [
    ['1–2', 'Disorganised but **passionate**', 'They don’t know the words yet, so they think about the meaning.'],
    ['3–5', '**Robotic and stressed**: “Let’s see…”, “Let me start again”', 'Brain power is spent on recalling words, not on meaning. The talk is being **recited**.'],
    ['6–7', 'Passion is back, plus precision', 'The words are automatic, so attention returns to meaning.'],
  ], [1000, 3500, 4526]),
  ...Box('key', 'Push past the robot stage', ['TED’s Chris Anderson calls the middle stage the **“uncanny valley”** of memorisation. If you choose to memorise, keep going until the words are part of you. Stopping in the valley is worse than not memorising at all.']),
  ...Box('research', 'How to memorise faster', [
    ['**Spaced repetition:** since Hermann Ebbinghaus’s experiments (1885), research has shown we forget fast unless we review at growing intervals. Rehearse a little every day rather than all at once the night before.',
     '**Sleep:** memory consolidates during sleep. Rehearse, sleep, rehearse again.',
     '**Learn the structure first, then the words:** memorise the step labels (6.4) before the sentences.',
     '**Rehearse out loud and standing**, the way you will perform it. Silent reading is not rehearsal.'],
  ]),
  H2('6.3 If you read from a script'),
  ...B([
    '**Know it well** enough to look up for most of each sentence.',
    '**Mean every sentence** as you read it.',
    'Make **eye contact** often, especially at the end of sentences.',
    'Use **large font**, double-spaced, and mark it up for voice (see 7.3).',
    'Consider **putting the script down for the ending** and speaking the conclusion from the heart.',
  ]),
  H2('6.4 If you go unscripted'),
  P('**Unscripted is not unprepared.** There is no excuse for not preparing an important talk. Think of the journey and give each step a short **label**, a mental signpost:'),
  ...T(['Step label', 'What I say there'], [
    ['1. “The dishwasher”', 'Opening story: how boring life felt after adventure'],
    ['2. “Ecological boredom”', 'Name the problem'],
    ['3. “Wolves in Yellowstone”', 'Main example of rewilding'],
    ['4. “What we could have”', 'Vision + call to action'],
  ], [3000, 6026]),
  P('_(Example labels inspired by George Monbiot’s rewilding talk.)_ Memorise the labels and the first and last sentences word for word. Rehearse the middle freely until each step feels natural.'),
  ...Box('try', 'Pick your plan', ['For your first practice talk (Chapter 13), use **notes with step labels** plus a **memorised opening and closing**. This is the best beginner balance between safety and freshness.']),
);

// ---------- 7. Voice ----------
add(
  H1('7. Your Voice: Turning Information into Inspiration'),
  P('Why give a talk at all? Why not just email the script? Because a live human adds a layer that text can’t: **humanity**. And humanity turns information into inspiration.'),
  ...T(['The human layer adds…', 'What the listener feels'], [
    ['Connection', '“I trust this person.”'],
    ['Engagement', '“Every sentence sounds interesting!”'],
    ['Curiosity', '“I hear it in your voice and see it in your face.”'],
    ['Understanding', '“That stress on that word, with that gesture: now I get it.”'],
    ['Empathy', '“I can tell how much that hurt you.”'],
    ['Excitement', '“That passion is infectious!”'],
    ['Conviction', '“Such determination in those eyes.”'],
    ['Action', '“I want to be on your team. Sign me up!”'],
  ], [3000, 6026]),
  P('Inspiration is what tells the brain **“this idea matters, keep it”**. Without it, new ideas get filed away and forgotten.'),
  H2('7.1 The enemy: sameness'),
  P('Many speakers make every sentence sound the same: a small rise at the start, a drop at the end, no pauses, no change of speed. That tells the audience **nothing is more important than anything else**, and it puts them to sleep.'),
  P('The key to exciting speaking is **variety based on meaning**. Listen to George Monbiot open his talk: “I was as reckless and foolish as only young men can be… but I also felt more alive than I’ve ever done since… I was, I believe, **ecologically bored**.” His voice slows, lifts, pauses, lands. The words are good; the delivery makes them astonishing.'),
  H2('7.2 The five controls of your voice'),
  ...T(['Control', 'What it is', 'Use it to…', 'Beginner target'], [
    ['Pace', 'Speed', 'Slow down for key ideas; speed up for lighter or exciting parts', 'Average about 130–160 words per minute; slower for the key line'],
    ['Pause', 'Silence', 'Let a point land; build suspense; replace “um”', 'Pause 1–2 seconds before and after your most important sentence'],
    ['Pitch', 'High / low', 'Show emotion, questions, contrast', 'Avoid a flat line; let pitch follow feeling'],
    ['Power', 'Volume', 'Loud for energy, soft to draw people in', 'Speak to the back row; drop softer for intimate moments'],
    ['Punch', 'Stress on words', 'Show which word matters', 'Stress 1–2 words per sentence'],
  ], [1300, 1500, 3526, 2700]),
  ...Box('try', 'Stress changes meaning', [
    'Say this sentence seven times, stressing a different word each time: **“I never said she stole my money.”** Notice how the meaning changes completely each time. That is why stress (“punch”) matters.',
  ]),
  H2('7.3 The script-marking system'),
  P('If your talk is scripted, mark it up like a music score:'),
  ...T(['Mark', 'Where', 'What your voice does'], [
    ['Single underline', '2–3 most important words per sentence', 'Stress them'],
    ['Double underline', 'The one word per paragraph that really matters', 'Stress strongly, maybe slow down'],
    ['Wavy line', 'Light-hearted or playful bits', 'Speed up a little, or soften'],
    ['Yellow highlight', 'Every question mark', 'Real question tone; pause for them to think'],
    ['Big black blob', 'Just before the biggest “Aha” moment', 'Full pause, then deliver'],
    ['Pink dots', 'Jokes or funny stories', 'Let yourself smile and laugh a little'],
  ], [2000, 3700, 3326]),
  P('Then go deeper: remember the **emotion** of each section. What makes you passionate? Angry? What makes you laugh? What confuses you? Read it again and let those emotions show a little.'),
  H2('7.4 Filler words: um, uh, like, you know'),
  P('Everyone uses some fillers, and a few are fine. Lots of them make you sound unsure. The fix is not to “try harder”, but to **replace the filler with a pause**. Silence feels long to you but sounds confident to the audience.'),
  ...Box('try', 'The filler-word audit', [
    ['Record a 2-minute talk on any topic. Play it back and count every “um”, “uh”, “like”, “so”, “you know”. Write the number down.',
     'Repeat daily. Each time you feel a filler coming, close your mouth and pause instead.',
     'Toastmasters clubs have a member called the “Ah-Counter” who does exactly this at every meeting. Awareness alone cuts fillers a lot.'],
  ]),
  H2('7.5 Your natural voice is the goal'),
  P('Don’t force variety that feels fake. Think of the voice you use when you catch up with a friend you haven’t seen for a while: **real, natural, and unafraid to let it rip** when the moment needs it. Let variety come from your passion for the idea.'),
  ...Box('research', 'The “55% body language” myth', ['You may hear that only 7% of meaning comes from words, 38% from voice and 55% from body. This comes from Albert Mehrabian’s 1967 studies, which only tested **single words spoken with emotion that didn’t match the word**. Mehrabian himself says it doesn’t apply to normal speech. Words matter enormously. Voice and body work by **supporting** the words, not replacing them.']),
);

// ---------- 8. Body & nerves ----------
add(
  H1('8. Your Body and Your Nerves'),
  P('Some speakers act as if their body is only there to carry their head onto the stage. Then the body doesn’t know what to do: hands glued to the sides, swaying from leg to leg. Your body can support your message instead.'),
  H2('8.1 The home position'),
  ...B([
    '**Stand tall**, weight equal on both feet, feet a few inches (hip-width) apart.',
    '**Shoulders back and relaxed**, not slouched forward.',
    '**Hands free** at waist height, ready to gesture naturally.',
    'This open stance may feel vulnerable. That vulnerability is actually attractive to an audience.',
  ]),
  P('This is what most TED speakers do. It signals: calm, and knows what they’re talking about.'),
  H2('8.2 Gestures'),
  ...B([
    'Let your hands **show** what you say: size, direction, numbers, contrast (“on one hand… on the other”).',
    'Keep gestures in the “box” between shoulders and waist; make them bigger for bigger rooms.',
    'Avoid: hands in pockets, arms crossed, fiddling with a pen or clicker, touching your face.',
  ]),
  H2('8.3 Movement with purpose'),
  P('Walking the stage is fine if it helps you think and emphasise. What makes walking work is **a change in rhythm**: move, then **stop** to deliver an important point from stillness. Constant pacing is tiring to watch.'),
  ...Box('mistake', 'The rock-and-shift', ['Shifting from leg to leg or stepping forward and back is a nervous habit most speakers don’t know they have. It eases your discomfort but **shows** it to the audience. Fix: plant your feet. Move only when you mean to, then stop.']),
  H2('8.4 There are no rules, only a test'),
  P('Dame Stephanie Shirley sat on a stool with notes on her lap. Oliver Sacks sat for his talk. Clifford Stoll leapt around the stage with wild energy. All worked. The only test is: **does my body help my message or distract from it?** Check by rehearsing in front of a small audience, or recording yourself and watching it back.'),
  H2('8.5 Handling nerves'),
  P('Fear of public speaking is one of the most common fears there is. Nerves are not a sign you’re bad at this; they are your body getting ready. The goal is not zero nerves but **nerves that work for you**.'),
  ...Box('research', 'What actually helps', [
    ['**Call it excitement.** Alison Wood Brooks (Harvard, 2014) had people say “I am excited” instead of trying to calm down before a speech. Their speeches were rated more persuasive, competent and confident. Anxiety and excitement feel physically similar, so relabelling is easier than calming down.',
     '**Breathe out slowly.** A study by Balban and colleagues (Stanford, 2023) found that five minutes a day of **cyclic sighing** (two inhales through the nose, then a long slow exhale through the mouth) reduced anxiety and improved mood.',
     '**Power posing: be careful.** A famous 2010 study said “power poses” change hormones, but later, larger studies did not find the hormone effect. Standing tall may help you _feel_ a little more confident, but it is not magic. Preparation is what really builds confidence.',
     '**Prepare more.** The strongest cure for nerves is knowing your material deeply (Chapter 6).'],
  ]),
  ...Box('try', 'The 2-minute pre-talk routine', [
    ['Three cyclic sighs (double inhale through the nose, long exhale).',
     'Stand in the home position; roll your shoulders back.',
     'Say quietly: “I’m excited. I have a gift for these people.”',
     'Say your first sentence in your head once.',
     'Walk out, find one friendly face, pause, smile, begin.'],
  ]),
);

// ---------- 9. Connection ----------
add(
  H1('9. Connection: Earning the Right to Guide'),
  P('People are not computers. They are social creatures. Before anyone will follow a guide, they need to **trust** them. Your first job is to build a trusting human bond. Here are five ways.'),
  H2('9.1 Make eye contact'),
  P('Start from your first sentence and continue throughout. Our brains read tiny muscle movements around the eyes to judge how someone feels and whether to trust them, and they are doing the same to us.'),
  ...Box('research', 'How long to look', ['A 2016 study by Nicola Binetti and colleagues found people’s preferred length of direct eye contact averaged about **3.3 seconds**. A good rule: **one thought, one person**. Deliver a sentence or phrase to one person, then move to someone in another part of the room.']),
  H2('9.2 Show vulnerability'),
  P('Revealing a weakness is like a cowboy opening his coat to show he isn’t carrying a weapon: everyone relaxes. Ethan Lisi, speaking about autism, said: “I actually have lots of empathy. I’m just not really good at showing it… I am bursting inside with every single emotion one feels at all times.” His honesty lets the audience see him, and the world, differently.'),
  ...Box('research', 'The pratfall effect', ['In a 1966 experiment, Elliot Aronson found that a **competent** person who makes a small blunder (spilling coffee) becomes **more likable** than one who seems perfect. Small, honest imperfections make you human. (Note: this only works when you are also clearly competent.)']),
  P('Handle with care. **Vulnerability related to your message is powerful. Sharing something personal just for the sake of it is not.** If unsure, test it on an honest friend.'),
  H2('9.3 Make them laugh, but not squirm'),
  P('Humour keeps people with you and builds bonds. Remember Sophie Scott: laughter is social glue.'),
  ...Box('research', 'Laughter is social', ['Robert Provine’s research found people are about **30 times more likely to laugh when they are with others** than when alone. Most laughter isn’t about jokes at all; it signals “we’re on the same side”.']),
  ...B([
    'You don’t need to be a comedian. **One short, true, funny moment** can unlock the rest of your talk.',
    'Humour at your own expense is safest. Never mock the audience or a group.',
    'Don’t make the whole talk jokes unless you are very skilled; the message gets lost.',
  ]),
  H2('9.4 Park your ego'),
  P('Nothing hurts a talk more than the feeling that the speaker is showing off. Salman Khan: “Be yourself… If you are goofy, be goofy. If you are emotional, be emotional. The one exception: if you are arrogant and self-centred, definitely pretend to be someone else.”'),
  P('Ego hides in: name-dropping, stories told only to impress, listing achievements, making it all about you. Remember: **the purpose is to give an idea, not to show how great you are.** Read your talk to a trusted, honest person and let them tell you if you come across as full of yourself.'),
  H2('9.5 Tell a story'),
  P('We are born to love stories. The best ones for connection are about **you or people close to you**, especially tales of failure, awkwardness, bad luck or danger, told honestly. Test: would you tell this story to a group of friends? How? Tell it that way. (Chapter 10 goes deeper.)'),
  ...Box('link', 'Connection in conversation and meetings', [
    ['**Eye contact** while listening, not just while talking.',
     '**Vulnerability:** “I got this wrong at first” builds more trust at work than pretending to be perfect.',
     '**Ego:** ask more questions than you answer. Use people’s names.',
     '**Stories:** “That reminds me of a time when…” (then bring it back to their point).'],
  ]),
);

// ---------- 10. Storytelling ----------
add(
  H1('10. The First Engine: Storytelling'),
  H2('10.1 Why stories work: around the fire'),
  P('Evidence from our ancestors suggests the human mind developed alongside storytelling. Fire created a place for people to gather after dark, and around it, storytelling became one of the most important things humans did. Stories carried knowledge, sparked laughter and amazement, and helped people imagine and understand other minds.'),
  ...Box('research', 'Day talk vs. fire talk', ['Anthropologist Polly Wiessner (2014) recorded conversations among the Ju/’hoan people of southern Africa. During the day, only about **6%** of talk was stories; much of it was practical matters, complaints and gossip. Around the fire at night, **81%** of conversation was **stories**. Fireside storytelling helped bond groups and spread culture.']),
  H2('10.2 The basic shape of a story'),
  P('**A character with a goal meets an unexpected obstacle, tries to overcome it, the action builds to a peak, and there is a resolution.**'),
  ...T(['Stage', 'Question it answers', 'Example'], [
    ['Character + goal', 'Who wants what?', '“I wanted to give my first speech without shaking.”'],
    ['Obstacle', 'What got in the way?', '“Two minutes in, my mind went completely blank.”'],
    ['Struggle', 'What did they try?', '“I looked at my notes. Nothing. I felt my face burning.”'],
    ['Peak', 'What was the moment of highest tension?', '“Then someone in the front row nodded at me and smiled.”'],
    ['Resolution + lesson', 'How did it end, and what does it mean?', '“I told them honestly that I’d lost my place. They laughed kindly, and I found it again. I learned the audience wants you to succeed.”'],
  ], [2000, 2700, 4326]),
  ...Box('key', 'The ABT shortcut: And, But, Therefore', ['Scientist and filmmaker Randy Olson, borrowing an idea from the _South Park_ creators, reduces a story to: “**[Setup] AND [more setup], BUT [problem], THEREFORE [what happened / what I learned].**” If your events are only joined by “and then… and then…”, you have a list, not a story. Stories run on **but** and **therefore**.']),
  H2('10.3 Four keys to telling a story from the stage'),
  ...N([
    '**A character your audience can empathise with**, often you.',
    '**Build tension**: through curiosity, relationships with other characters, or real danger.',
    '**The right level of detail.** Too little and it won’t come alive; too much and it gets bogged down. Use one or two sensory details (a sound, a smell, a colour) at the key moment.',
    '**A satisfying ending**: funny, moving or surprising.',
  ]),
  H2('10.4 The trap: a story that gives nothing'),
  P('A personal story can entertain and make the speaker feel good, yet give the audience nothing to take away. Always link the story to **a gift**: a new way of seeing things, useful information, context or hope. If each step is told with humility, honesty and vulnerability, **and** it reveals something you learned, the audience will gladly take the journey with you.'),
  H2('10.5 Non-negotiable: it must be true'),
  P('Stories are powerful enough that speakers are tempted to exaggerate. Don’t. Even small exaggerations, once discovered, can destroy your reputation. **A true story plus a desire to help others is an extraordinary gift.**'),
  ...Box('try', 'Build your Story Bank', [
    'Write one line each for: a time you failed; a time you were embarrassed; a time you were scared; a time someone surprised you with kindness; a time you changed your mind; your proudest moment (told humbly). For each, finish: **“…and that taught me ____.”** Pick the best one and tell it in 90 seconds using ABT. Record it.',
  ]),
  ...Box('link', 'Stories in everyday life', ['A short story is the strongest “E” in PREP (Chapter 4) and the heart of STAR interview answers. At work, “Let me tell you about one customer…” beats any statistic on its own. The best combination: **a story for the heart, then a number for the head.**']),
);

// ---------- 11. Explanation ----------
add(
  H1('11. The Second Engine: Explaining Difficult Ideas'),
  P('Explaining a complicated idea so someone else understands it is one of the ways society moves forward. It is also where most presentations fail. Let’s learn from a master.'),
  H2('11.1 Case study: Dan Gilbert and “synthesised happiness”'),
  P('Harvard psychologist Dan Gilbert had one short talk to explain a hard concept: **synthesised happiness**, and why it makes us wrong about our own futures. Watch how he builds it block by block.'),
  ...T(['Step', 'What Gilbert does', 'The technique'], [
    ['1', 'Asks: in 2 million years the human brain nearly tripled in size. “What is it about a big brain that nature was so eager for every one of us to have one?”', '**Spark curiosity** with a question the audience wants answered'],
    ['2', 'Introduces the **prefrontal cortex**, a new part of the big brain', '**Building block 1**'],
    ['3', 'Says it works as an **experience simulator**, like a pilot’s flight simulator', '**Building block 2 + metaphor**'],
    ['4', 'Ben & Jerry’s has no liver-and-onion ice cream, and nobody had to taste it to know it would be disgusting', '**One strong, everyday example**'],
    ['5', 'Asks: would you rather win the lottery or become paraplegic? Then reveals that a year later, both groups are about **equally happy**', '**Surprise**: opens a knowledge gap'],
    ['6', 'Names it: **impact bias**, our simulator exaggerates how different outcomes will feel', '**Building block 3**: name the mystery'],
    ['7', 'Reveals: we have a “**psychological immune system**” that synthesises happiness', '**The big idea + metaphor**'],
    ['8', 'Shows how to live wiser and happier knowing this', '**The gift**: why it matters to you'],
  ], [700, 4926, 3400]),
  ...Box('research', 'Being a careful listener', ['The lottery-and-paraplegic comparison comes from a 1978 study by Philip Brickman and colleagues. The real finding is a little more nuanced than “equally happy”: lottery winners were **not happier** than ordinary people, and accident victims were somewhat less happy, but **far less unhappy than anyone predicted**. Gilbert’s point still holds. A good speaker simplifies; a good researcher checks the source.']),
  H2('11.2 The explanation ladder'),
  P('Gilbert didn’t leap to the big idea. He built a **tower**: each new block rested on the one before, and each block was strengthened by a **metaphor** (shows the shape of the idea) and an **example** (proves it’s real).'),
  ...N([
    '**Hook:** a question or surprise that makes them curious.',
    '**Start where they are:** something they already know.',
    '**Add one new concept at a time.** Name it. Give a metaphor. Give an example.',
    '**Check the step:** does each concept rest on the one before?',
    '**Reveal the big idea**, now easy to grasp because the pieces are in place.',
    '**Show why it matters** to them: the gift.',
  ]),
  ...Box('research', 'Curiosity is a gap', ['Economist George Loewenstein’s **information-gap theory** (1994) says curiosity arises when we notice a gap between what we know and what we want to know. That’s exactly what Gilbert did with the lottery data. Open a gap, then fill it.']),
  H2('11.3 The curse of knowledge'),
  P('Economist Robin Hogarth named it: the **curse of knowledge**. Once you know something, it is very hard to remember what it was like not to know it. So experts skip steps, use jargon and lose everyone.'),
  ...Box('research', 'The tapping experiment', ['In 1990, Stanford student Elizabeth Newton asked people to tap out the rhythm of a well-known song (like “Happy Birthday”) on a table while a listener guessed the song. Tappers predicted listeners would guess right about **50%** of the time. Actual success: about **2.5%** (3 out of 120 songs). The tappers could “hear” the tune in their heads; the listeners heard only knocking. When you explain, **you are the tapper**.']),
  H2('11.4 Beating the curse'),
  ...B([
    'Ask: **What does my audience already know?** Start there.',
    'List the **building blocks** they need. Explain each before you use it.',
    'Replace jargon with plain words, or define it the first time you use it.',
    'Use a **metaphor** for each abstract idea (“like a flight simulator”, “like an immune system”).',
    'Give a **concrete example** for every concept.',
    'Test on a **smart 12-year-old** or a friend outside your field. Where do they get lost?',
  ]),
  ...Box('try', 'The explain-it-simply challenge (Feynman-style)', [
    'Pick something from your work or studies. Explain it out loud in 2 minutes to an imaginary 12-year-old. Rules: no jargon, at least one metaphor (“it’s like…”), at least one real example. Record it. Wherever you stumble or reach for a technical word, that is a gap in the ladder. Fix it and try again.',
  ]),
  ...Box('link', 'Story vs. explanation', ['These are your two engines. **Stories** move the heart: they create empathy and make people care. **Explanations** move the head: they build understanding. The strongest talks use a story to make people care about a question, then an explanation ladder to answer it.']),
);

// ---------- 12. Putting it all together ----------
add(
  H1('12. Putting It All Together: From Blank Page to Standing Ovation'),
  P('Here is the whole system as one workflow. Use it every time you prepare a talk or presentation.'),
  ...T(['Step', 'Do this', 'Chapter'], [
    ['1. Find the gift', 'Choose an idea that can change how people see something. Write the “After listening, people will see ___ differently” sentence.', '1–2'],
    ['2. Know your audience', 'Who are they? What do they already know? What do they care about? Where must the journey start?', '1, 11'],
    ['3. Write the throughline', '15 words or fewer. Test it on a person.', '3'],
    ['4. Cut ruthlessly', 'Keep 2–3 main points that directly serve the throughline. Remove the rest.', '3'],
    ['5. Choose the route', 'Pick a structure (Story → Lesson, Problem → Solution, Explanation ladder…).', '4'],
    ['6. Add the fuel', 'For each point: an example, story, fact, or metaphor.', '10–11'],
    ['7. Craft opening and closing', 'Hook in the first 20 seconds. Close with a callback, challenge or image.', '4–5'],
    ['8. Write for the ear', 'Short sentences, spoken words, signposts, linking words.', '5'],
    ['9. Choose your plan', 'Memorise, read, notes, or unscripted. Commit.', '6'],
    ['10. Mark the voice', 'Underlines, pauses, emotions.', '7'],
    ['11. Rehearse', 'Out loud, standing, recorded. Past the robot stage.', '6–8'],
    ['12. Get feedback', 'Honest friend: clarity, ego, body language, boring bits.', '3, 9'],
    ['13. Pre-talk routine', 'Breathe, stand tall, “I’m excited”, first line, friendly face.', '8'],
  ], [2200, 5626, 1200]),
  H2('12.1 Timing guide'),
  ...T(['Talk length', 'Spoken words (approx.)', 'Main points', 'Rehearsals (minimum)'], [
    ['1 minute (conversation, intro)', '130–150', '1', '3'],
    ['3–5 minutes (class, meeting)', '400–750', '1–2', '5'],
    ['10 minutes', '1,300–1,500', '2–3', '8–10'],
    ['18 minutes (TED length)', '2,300–2,700', '3', '10+ over 1–2 weeks'],
  ], [2800, 2200, 1700, 2326]),
  P('_Word counts assume a comfortable pace of about 130–150 words per minute, leaving room for pauses._'),
  H2('12.2 The day-of checklist'),
  ...B([
    'Water nearby; a light meal; arrive early to see the room.',
    'Test slides, microphone and clicker.',
    'Know your first sentence and last sentence cold.',
    'Do the 2-minute pre-talk routine.',
    'On stage: pause, find a friendly face, smile, begin.',
    'If you lose your place: pause, breathe, check notes or say “Let me come back to that.” The audience rarely notices.',
    'End cleanly: final line → pause → “Thank you.” Don’t trail off with “So, yeah… that’s it.”',
  ]),
  ...Box('mistake', 'Top ten beginner errors (quick reference)', [
    ['No clear point (no throughline)', 'Too many points, too little depth', 'Starting with backstory instead of the hook', 'Jargon without explanation (curse of knowledge)', 'Monotone voice; no pauses', 'Rocking, pacing, fidgeting', 'No eye contact (reading or looking at slides)', 'Showing off (ego)', 'Stopping memorisation in the robot stage', 'Weak ending that trails off'],
  ]),
);

// ---------- 13. 30-day plan ----------
const plan = [
  ['1', 'Foundations', 'Read Ch. 0–1. Record a 1-minute video: “Who I am and one thing I care about.” Keep it; this is your baseline.'],
  ['2', 'Foundations', 'Ch. 2: build your Idea Bank. Ask two people the Method 1 questions.'],
  ['3', 'Foundations', 'Ch. 5.1–5.3: sentence engine and tenses. Read aloud for 5 minutes. Fix 3 grammar slips you personally make.'],
  ['4', 'Foundations', 'Ch. 5.5: linking words. Tell someone about your day using 5 different linking words.'],
  ['5', 'Foundations', 'Filler-word audit: record 2 minutes, count fillers, write the number down.'],
  ['6', 'Foundations', 'Ch. 5.6: choose 3 phrases and use them in real conversations today.'],
  ['7', 'Review', 'Re-record the Day 1 video. Compare. Write 3 things that improved and 1 to work on.'],
  ['8', 'Structure', 'Ch. 3: write throughlines (15 words) for your top 3 Idea Bank topics. Say them to a friend.'],
  ['9', 'Structure', 'Ch. 4: PREP drill, 3 random questions, 60 seconds each, recorded.'],
  ['10', 'Structure', 'STAR drill: answer “Tell me about a challenge you overcame” in 90 seconds.'],
  ['11', 'Structure', 'Write 3 different openings for one topic (question, story, surprising fact). Pick the best.'],
  ['12', 'Story', 'Ch. 10: build your Story Bank (6 stories, one line each + lesson).'],
  ['13', 'Story', 'Tell your best story in 90 seconds using ABT. Record. Cut unnecessary details.'],
  ['14', 'Review', 'Give a 3-minute talk: throughline + story + PREP close. Record and self-score with Ch. 14.'],
  ['15', 'Voice', 'Ch. 7: “I never said she stole my money” drill. Read a speech aloud, exaggerating pauses and stress.'],
  ['16', 'Voice', 'Mark up a 1-page script with the marking system (7.3). Read it three ways: flat, marked, and with emotion.'],
  ['17', 'Voice', 'Pause practice: tell a story with a deliberate 2-second pause before the key moment. Filler audit again.'],
  ['18', 'Body', 'Ch. 8: record yourself standing and talking for 2 minutes. Watch with sound off. Note habits.'],
  ['19', 'Body', 'Practise home position + purposeful gestures. Move, stop, deliver the point. Do the pre-talk routine.'],
  ['20', 'Connection', 'Ch. 9: in 3 conversations, practise “one thought, one person” eye contact and 3 follow-up questions.'],
  ['21', 'Review', 'Re-record your Day 14 talk with voice and body improvements. Self-score. Compare.'],
  ['22', 'Explanation', 'Ch. 11: Feynman challenge, explaining something from your work to a 12-year-old in 2 minutes.'],
  ['23', 'Explanation', 'Build an explanation ladder (hook → 3 blocks → big idea → gift) for one concept. Add a metaphor per block.'],
  ['24', 'Final talk', 'Choose your final 5-minute talk topic. Write the throughline and route (Ch. 12, steps 1–7).'],
  ['25', 'Final talk', 'Write it for the ear (or make step labels). Memorise the opening and closing.'],
  ['26', 'Final talk', 'Rehearse 3 times out loud, standing. Mark voice. Record the last run.'],
  ['27', 'Final talk', 'Deliver to one honest friend. Ask: clearest part? confusing part? ego? distracting habits?'],
  ['28', 'Final talk', 'Revise based on feedback. Rehearse 3 more times. Push past the robot stage.'],
  ['29', 'Final talk', 'Deliver to a small group (family, friends, colleagues, or a local Toastmasters club).'],
  ['30', 'Celebrate', 'Watch your Day 1 video, then your Day 29 talk. Score both. Write your next 30-day goal.'],
];
add(
  H1('13. The 30-Day Practice Plan'),
  P('About **20–30 minutes a day**. Every day includes speaking **out loud**. Recording yourself is essential: it is the fastest feedback loop you have. Use your phone.'),
  ...T(['Day', 'Focus', 'Task'], plan, [700, 1500, 6826]),
  ...Box('key', 'Keep going after day 30', [
    ['**Join a Toastmasters club** (or any local speaking group). Regular, low-stakes practice with feedback is the most reliable way to improve.',
     '**Volunteer to speak**: in meetings, at events, give a toast. Every chance counts.',
     '**Watch great talks actively**: pick one TED Talk a week and note the throughline, opening, stories, pauses and ending.',
     '**Keep your recordings.** Seeing your own progress is the best motivation there is.'],
  ]),
);

// ---------- 14. Self-score ----------
add(
  H1('14. Self-Scoring Rubric'),
  P('Score each recorded practice from 1 (not yet) to 5 (excellent). Track your totals over time. Maximum: 60.'),
  ...T(['Area', '1 = Not yet', '5 = Excellent', 'Score'], [
    ['Idea / gift', 'No clear takeaway', 'Clear, fresh idea the listener values', ''],
    ['Throughline', 'Wanders; a list of topics', 'Every part links to one 15-word idea', ''],
    ['Opening', 'Slow start, apologies', 'Hooks attention in 20 seconds', ''],
    ['Structure', 'Hard to follow', 'Clear steps with signposts', ''],
    ['Examples / stories', 'Abstract claims only', 'Every point has a vivid example or story', ''],
    ['Language', 'Long, vague or jargon-heavy sentences', 'Short, precise, spoken-style sentences', ''],
    ['Voice', 'Monotone, rushed, many fillers', 'Varied pace, pitch, pauses; few fillers', ''],
    ['Body', 'Rocking, fidgeting, frozen', 'Grounded, open, purposeful gestures', ''],
    ['Eye contact', 'Looks at notes, floor or slides', 'Connects with people across the room', ''],
    ['Authenticity', 'Showing off or performing', 'Humble, honest, sounds like me', ''],
    ['Clarity of explanation', 'Listener would get lost', 'Step by step, metaphors, no gaps', ''],
    ['Ending', 'Trails off', 'Clear, memorable final line, then “Thank you”', ''],
  ], [2000, 2700, 3526, 800]),
);

// ---------- 15. Glossary + card ----------
add(
  H1('15. Glossary and Quick-Reference Card'),
  H2('15.1 Glossary'),
  ...T(['Term', 'Meaning'], [
    ['Idea (the gift)', 'Anything that can change how people see the world; what the audience takes away.'],
    ['Throughline', 'The main idea that connects everything in a talk; the path of the journey.'],
    ['Signpost', 'A spoken phrase that tells listeners where they are in the talk.'],
    ['PREP / STAR / BLUF', 'Mini-structures for answers, interview stories and reports.'],
    ['Robot stage / uncanny valley', 'The middle stage of memorising, when a talk sounds recited.'],
    ['Vocal variety', 'Changing pace, pause, pitch, power and stress to match meaning.'],
    ['Filler words', '“Um”, “uh”, “like”, “you know”; replace them with pauses.'],
    ['Vulnerability', 'Honestly revealing a weakness or struggle that serves your message.'],
    ['Pratfall effect', 'A competent person who makes a small mistake becomes more likable.'],
    ['ABT', 'And, But, Therefore: a quick story structure.'],
    ['Knowledge gap', 'The space between what we know and want to know; it drives curiosity.'],
    ['Metaphor', 'Describing a new idea as something familiar (“an immune system for the mind”).'],
    ['Curse of knowledge', 'Difficulty imagining what it is like not to know what you know.'],
    ['Impact bias', 'Overestimating how strongly and how long future events will affect our feelings.'],
    ['Synthesised happiness', 'Happiness our minds create when things don’t go as planned (Gilbert).'],
  ], [2700, 6326]),
  H2('15.2 The quick-reference card'),
  ...Box('key', 'Before any talk, answer these seven questions', [
    '1. **Gift:** What will they see differently afterwards?',
    '2. **Throughline:** What are my 15 words?',
    '3. **Audience:** Where does the journey start for them?',
    '4. **Route:** What are my 2–3 steps, in order?',
    '5. **Fuel:** What story, example, fact or metaphor supports each step?',
    '6. **Delivery:** Where do I pause? What do I stress? Am I being myself?',
    '7. **Ending:** What is my final line?',
  ]),
  ...Box('key', 'Remember', ['You are the only you in all of history. You have ideas worth sharing. Your job is simply to be a good guide: start where they are, walk them step by step, and give them something to keep. **Have something worth saying, then say it like a human.**']),
  H2('15.3 Sources and further reading'),
  ...B([
    'Chris Anderson, _TED Talks: The Official TED Guide to Public Speaking_ (2016). The book behind these lessons.',
    'TED-Ed / TED Masterclass lessons on giving a great talk (the source transcripts).',
    'Talks mentioned: Sophie Scott (laughter, 2015), Dan Gilbert (_The Surprising Science of Happiness_, 2004), George Monbiot (rewilding, 2013), Amanda Gorman (TED-Ed Student Talks, 2018), Ethan Lisi (TED-Ed Student Talks, 2020).',
    'Stephens, Silbert & Hasson (2010), speaker–listener neural coupling, _PNAS_.',
    'Cowan (2001), working memory capacity of about four chunks, _Behavioral and Brain Sciences_.',
    'Wiessner (2014), firelight talk among the Ju/’hoan, _PNAS_.',
    'Brooks (2014), reappraising anxiety as excitement, _Journal of Experimental Psychology: General_.',
    'Balban et al. (2023), cyclic sighing and mood, _Cell Reports Medicine_.',
    'Aronson, Willerman & Floyd (1966), the pratfall effect.',
    'Provine, _Laughter: A Scientific Investigation_ (2000).',
    'Binetti et al. (2016), preferred eye-contact duration, _Royal Society Open Science_.',
    'Loewenstein (1994), the information-gap theory of curiosity, _Psychological Bulletin_.',
    'Newton (1990), the tapper/listener study; popularised in Chip & Dan Heath, _Made to Stick_ (2007).',
    'Brickman, Coates & Janoff-Bulman (1978), lottery winners and accident victims.',
    'Randy Olson, _Houston, We Have a Narrative_ (2015), the ABT structure.',
    'Luft & Ingham (1955), the Johari Window.',
  ]),
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
  creator: 'Speaker’s Console',
  title: 'The Speaker’s Console',
  description: 'One connected note on public speaking',
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
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'The Speaker’s Console', size: 18, color: '8C8C8C' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '8C8C8C' })] })] }) },
    children: C,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2], buf);
  console.log('written', process.argv[2]);
});
