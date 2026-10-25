import "server-only";
// Canned responses used when MOCK_AI=1 so the whole flow can be tried (and tested) without API keys.
import type { AnswerPayload, EvaluateRequest } from "../api-types";
import { normalizeToken } from "../transcript";
import type { AnswerEvaluation, LlmReport, Question, Transcript, Word } from "../types";

const SPEECH =
  "Good morning. So, um, today I want to talk about why restructuring before the year end could save your company a significant amount of tax. " +
  "Right now your group pays corporate income tax at thirty percent on manufacturing profits. " +
  "I think, uh, if we move the export division into a separate entity, maybe we could qualify for the concessionary rate. " +
  "Basically the numbers are quite strong. Last year a similar client saved around forty million rupees. " +
  "You know, the deadline matters because the new rules apply from the next year of assessment. " +
  "My recommendation is simple. Approve the restructure by the end of this month so we can file the documents on time. Thank you.";

const ANSWER =
  "That's a fair question. The saving comes mainly from the lower rate on export profits. " +
  "Um, based on last year's accounts it would be roughly thirty five million rupees, and the one-off costs are about four million.";

export function mockTranscript(seconds: number, kind: "speech" | "answer" = "speech"): Transcript {
  const tokens = (kind === "speech" ? SPEECH : ANSWER).split(" ");
  const span = Math.max(seconds - 1, 2);
  const step = span / tokens.length;
  const words: Word[] = tokens.map((w, i) => ({
    w,
    raw: normalizeToken(w),
    start: Math.round((0.5 + i * step) * 100) / 100,
    end: Math.round((0.5 + i * step + step * 0.8) * 100) / 100,
    conf: 0.93,
  }));
  return { text: tokens.join(" "), words, avgConfidence: 0.93, provider: "mock" };
}

function slice(words: Word[], from: number, n: number): { t: number; quote: string } {
  const i = Math.min(Math.max(0, from), Math.max(0, words.length - n));
  return { t: words[i]?.start ?? 0, quote: words.slice(i, i + n).map((w) => w.w).join(" ") };
}

export function mockQuestions(words: Word[]): Question[] {
  return [
    { id: "q1", question: "Can you walk me through where the forty million saving actually comes from?", reason: "You quoted a saving without showing how it was calculated.", targets_t: slice(words, 40, 1).t, kind: "evidence" },
    { id: "q2", question: "What are the one-off costs of setting up the new entity?", reason: "The speech covered benefits but not costs.", targets_t: null, kind: "gap" },
    { id: "q3", question: "What happens if the Inland Revenue challenges the restructure?", reason: "A sceptical CFO would worry about audit risk.", targets_t: null, kind: "objection" },
  ];
}

export function mockReport(req: EvaluateRequest): LlmReport {
  const w = req.words;
  const n = w.length;
  const q = (frac: number, len = 8) => slice(w, Math.floor(n * frac), len);
  const rub = (score: number, reason: string, sub: Record<string, number>, ev: { t: number; quote: string }[]) => ({ score, reason, sub, evidence: ev });
  return {
    rubric: {
      content_structure: rub(7, "Clear recommendation and a concrete figure, but the opening hook is weak.", { opening_hook: 5, logical_flow: 7, key_message: 8, evidence_examples: 7, close: 8, audience_fit: 7, type_specific: 7 }, [q(0.02)]),
      delivery_voice: rub(6, `Pace of ${req.metrics.wpmOverall} wpm with ${req.metrics.fillers.count} fillers; hedges weaken the key claim.`, { pace: 7, fillers: 5, pauses: 7, clarity: 7, vocal_variety: 6, confident_phrasing: 5 }, [q(0.3)]),
      body_language: rub(req.vision?.analysed ? 6 : 5, req.vision?.analysed ? `Eye contact ${req.vision.eyeContactPct}%.` : "Body-language analysis was unavailable, so this is a neutral score.", { eye_contact: 5, posture: 6, head_movement: 6, gestures: 5, expression: 6, fidgeting: 6 }, []),
      qa_handling: req.answers ? rub(6, "Answers were direct but light on numbers.", { directness: 7, structure: 6, composure: 6, answered_the_question: 6 }, []) : null,
    },
    accuracy_flags: [{ ...q(0.2, 10), concern: "Check the current corporate rate for this sector — possibly outdated, verify.", confidence: "low" }],
    script_coverage: req.setup.script ? { covered: [{ point: "Recommendation", ...q(0.85, 6) }], missed: [{ point: "Risks of the restructure" }], added: [] } : null,
    moments: [
      { ...q(0.0, 4), polarity: "positive", category: "content", label: "Clear, polite opening", quote: q(0.0, 4).quote },
      { ...q(0.05, 6), polarity: "negative", category: "voice", label: "Fillers at the start dilute the hook", quote: q(0.05, 6).quote },
      { ...q(0.3, 8), polarity: "negative", category: "content", label: "Hedging on the key claim", quote: q(0.3, 8).quote },
      { ...q(0.55, 8), polarity: "positive", category: "content", label: "Strong concrete example", quote: q(0.55, 8).quote },
      { ...q(0.85, 8), polarity: "positive", category: "content", label: "Clear call to action", quote: q(0.85, 8).quote },
    ],
    strengths: [
      { title: "Concrete number", detail: "Gives the client something to anchor on.", ...q(0.55, 10) },
      { title: "Specific next step", detail: "Ends with a clear decision and deadline.", ...q(0.85, 10) },
      { title: "Relevant to the client", detail: "Links the saving to their manufacturing profits.", ...q(0.2, 10) },
    ],
    fixes: [
      { title: "Drop the hedges on your main claim", why: "'I think' and 'maybe' make the CFO doubt the saving.", original: q(0.3, 12), say_instead: "Moving the export division into a separate entity qualifies it for the concessionary rate." },
      { title: "Open with the number", why: "The CFO cares about the saving first.", original: q(0.02, 10), say_instead: "Good morning. You could save around forty million rupees this year — here's how." },
      { title: "Show how the saving is calculated", why: "Unsupported figures invite challenge.", original: q(0.55, 10), say_instead: "On last year's export profit of 400 million, a ten-point lower rate saves about 40 million." },
    ],
    drills: [
      { name: "Hedge-free restatement", targets: "delivery_voice.confident_phrasing", instructions: "Say your recommendation five times without 'I think' or 'maybe'. Record and check.", minutes: 5 },
      { name: "Number-first opening", targets: "content_structure.opening_hook", instructions: "Write three openings that start with the client's saving; deliver each to camera.", minutes: 10 },
    ],
    rewrite: {
      opening: "Good morning. Restructuring before the year end could save the group around forty million rupees in tax. Let me show you where that comes from and what we need from you.",
      closing: "So my recommendation is to approve the restructure by the end of this month. That keeps us inside the deadline and secures the saving for this year of assessment.",
    },
    notes_usage_comment: req.setup.script ? "You kept the notes visible for much of the speech; glance down only at section changes." : null,
  };
}

export function mockAnswerEval(a: AnswerPayload): AnswerEvaluation {
  const quote = a.words.length >= 6 ? { t: a.words[0].start, quote: a.words.slice(0, 8).map((w) => w.w).join(" ") } : null;
  return {
    score: 6,
    sub: { directness: 6, structure: 6, composure: 7, answered_the_question: 6 },
    feedback: "You acknowledged the question and gave a figure, but buried the number after a filler. Lead with the figure.",
    quote,
    better_answer_outline: ["State the saving figure first", "Explain the rate difference in one sentence", "Mention one-off costs and payback"],
  };
}
