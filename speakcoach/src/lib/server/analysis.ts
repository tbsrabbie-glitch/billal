import "server-only";
import type { AnswerPayload, EvaluateRequest } from "../api-types";
import { fmtClock, fmtTime, locateQuote, toTimedLines } from "../transcript";
import type { AnswerEvaluation, LlmReport, RubricKey, SessionSetup, SpeechMetrics, TimeRange, VisionMetrics, Word } from "../types";
import type { UserContent } from "./claude";
import { modeLabel, rubricFor } from "./prompts";

/* ---------- Formatting data for the prompts ---------- */

export function transcriptBlock(words: Word[]): string {
  return words.length ? toTimedLines(words).join("\n") : "(no speech detected)";
}

function ranges(rs: TimeRange[], extra?: (r: never) => string): string {
  if (!rs.length) return "none";
  return rs.map((r) => `${fmtClock(r.start)}–${fmtClock(r.end)}${extra ? ` ${extra(r as never)}` : ""}`).join(", ");
}

export function metricsBlock(m: SpeechMetrics): string {
  return [
    `Words: ${m.wordCount}. Pace: ${m.wpmOverall} words/min overall (comfortable range for presenting: 130–160).`,
    `Pace per 30 s: ${m.wpmSegments.map((s) => `${fmtClock(s.start)}–${fmtClock(s.end)}: ${s.wpm}`).join("; ") || "n/a"}`,
    `Filler words: ${m.fillers.count} (${m.fillers.perMinute}/min): ${m.fillers.items.map((f) => `"${f.word}" @${fmtTime(f.t)}`).join(", ") || "none"}`,
    `Hedging phrases: ${m.hedges.count}: ${m.hedges.items.map((h) => `"${h.phrase}" @${fmtTime(h.t)}`).join(", ") || "none"}`,
    `Long pauses (>2 s): ${m.longPauses.map((p) => `${fmtTime(p.start)} (${p.dur}s)`).join(", ") || "none"}`,
    `Rushed sections (>175 wpm): ${m.rushedSections.map((r) => `${fmtClock(r.start)}–${fmtClock(r.end)} (${r.wpm} wpm)`).join(", ") || "none"}`,
    `Low-confidence words (possible mumbling, or just accent — see rules): ${m.unclearWords.slice(0, 15).map((u) => `"${u.word}" @${fmtTime(u.t)}`).join(", ") || "none"}`,
  ].join("\n");
}

function visionBlock(v: VisionMetrics | undefined): string {
  if (!v || !v.analysed) return `Body-language analysis unavailable${v?.unavailableReason ? `: ${v.unavailableReason}` : ""}.`;
  return [
    `Face visible ${v.faceVisiblePct}% of the time. Eye contact with the camera: ${v.eyeContactPct}%.`,
    `Eye contact per 30 s: ${v.eyeContactSegments.map((s) => `${fmtClock(s.start)}–${fmtClock(s.end)}: ${s.pct}%`).join("; ") || "n/a"}`,
    `Looked away (≥1.5 s): ${v.lookAwayRanges.map((r) => `${fmtClock(r.start)}–${fmtClock(r.end)} ${r.direction}`).join(", ") || "none"}`,
    `Head movement: ${v.headMovement} (spread ${v.headMovementDegStd}°).`,
    `Posture flags: ${v.postureFlags.map((r) => `${fmtClock(r.start)}–${fmtClock(r.end)} ${r.issue.replace(/_/g, " ")}`).join(", ") || "none"}`,
    `Hands visible ${v.handsVisiblePct}% of the time; gesture bursts ${v.gestureRatePerMin}/min.`,
    `Touching face/fidgeting near face: ${ranges(v.faceTouchRanges)}`,
    `Smiling ${v.smilePct}% of the time; facial expressiveness: ${v.expressiveness}.`,
  ].join("\n");
}

function setupBlock(s: Omit<SessionSetup, "script">): string {
  return `Speech type: ${rubricFor(s.speechType).label}\nTopic: ${s.topic}\nAudience: ${s.audience}\nGoal: ${s.goal}\nQuestioner mode: ${modeLabel(s.questionerMode)}`;
}

export function questionsContent(setup: Omit<SessionSetup, "script">, words: Word[]): UserContent {
  return [{ type: "text", text: `<setup>\n${setupBlock(setup)}\n</setup>\n\n<transcript>\n${transcriptBlock(words)}\n</transcript>` }];
}

function answerBlock(a: AnswerPayload, i: number): string {
  const head = `Q${i + 1} (${a.question.kind}): ${a.question.question}`;
  if (a.skipped) return `${head}\nAnswer: (skipped by the speaker)`;
  const m = a.metrics;
  return [
    head,
    `Answer transcript (timestamps relative to the start of this answer):\n${transcriptBlock(a.words)}`,
    m ? `Answer length ${fmtClock(m.durationSec)}, ${m.wpmOverall} wpm, ${m.fillers.count} fillers, ${m.hedges.count} hedges, ${m.longPauses.length} long pauses.` : "",
    a.vision?.analysed ? `Eye contact during the answer: ${a.vision.eyeContactPct}%.` : "",
  ].filter(Boolean).join("\n");
}

export function evaluateContent(req: EvaluateRequest): UserContent {
  const v = req.voice;
  const voice = v?.analysed
    ? `Pitch variation: ${v.pitchVariationSt} semitones (under ~2 sounds flat/monotone; 3–6 is lively). Loudness variation: ${v.loudnessVariationDb} dB.\nPer 30 s: ${v.segments.map((s) => `${fmtClock(s.start)}–${fmtClock(s.end)}: pitch spread ${s.pitchVariationSt} st, loudness ${s.relLoudnessDb >= 0 ? "+" : ""}${s.relLoudnessDb} dB`).join("; ")}\nMonotone stretches: ${ranges(v.monotoneRanges)}. Noticeably quieter stretches: ${ranges(v.quietRanges)}.`
    : `Voice analysis unavailable${v?.unavailableReason ? `: ${v.unavailableReason}` : ""}.`;
  const notes = req.setup.script
    ? `The speaker had notes on screen for ${Math.round(req.recording.notesOpenSec)} s of ${Math.round(req.recording.durationSec)} s. Toggles: ${req.recording.notesToggles.map((t) => `${t.open ? "shown" : "hidden"} @${fmtClock(t.t)}`).join(", ") || "never shown"}.`
    : "No notes were prepared.";

  const text = [
    `<setup>\n${setupBlock(req.setup)}\nTime allowed: ${fmtClock(req.metrics.timeAllowedSec)}; used: ${fmtClock(req.recording.durationSec)}${req.recording.stoppedEarly ? " (stopped early)" : " (hit the time limit)"}\n</setup>`,
    `<transcript>\n${transcriptBlock(req.words)}\n</transcript>`,
    `<speech_metrics>\n${metricsBlock(req.metrics)}\n</speech_metrics>`,
    `<voice_metrics>\n${voice}\n</voice_metrics>`,
    `<body_language_metrics>\n${visionBlock(req.vision)}\n</body_language_metrics>`,
    `<notes_usage>\n${notes}\n</notes_usage>`,
    req.setup.script ? `<prepared_script>\n${req.setup.script}\n</prepared_script>` : "",
    req.answers ? `<qa_round>\n${req.answers.map(answerBlock).join("\n\n")}\n</qa_round>` : "<qa_round>The speaker chose not to take questions. Set qa_handling to null.</qa_round>",
    req.frames.length ? `The ${req.frames.length} images that follow are still frames from the video, in time order, for a qualitative read of posture and expression.` : "",
  ].filter(Boolean).join("\n\n");

  const content: UserContent = [{ type: "text", text }];
  for (const f of req.frames) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(f.dataUrl);
    if (!m) continue;
    content.push({ type: "text", text: `Frame at ${fmtClock(f.t)}:` });
    content.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } });
  }
  return content;
}

export function answerContent(setup: Omit<SessionSetup, "script">, a: AnswerPayload): UserContent {
  return [{ type: "text", text: `<setup>\n${setupBlock(setup)}\n</setup>\n\n<answer>\n${answerBlock(a, 0)}\n</answer>` }];
}

/* ---------- Evidence verification ---------- */

/** Measured ranges a quote-less moment may legitimately point at. */
function flaggedRanges(req: EvaluateRequest): TimeRange[] {
  const v = req.vision;
  const out: TimeRange[] = [
    ...req.metrics.longPauses,
    ...req.metrics.rushedSections,
    ...req.metrics.fillers.items.map((f) => ({ start: f.t, end: f.t })),
    ...(req.voice?.monotoneRanges ?? []),
    ...(req.voice?.quietRanges ?? []),
    ...req.frames.map((f) => ({ start: f.t, end: f.t })),
  ];
  if (v?.analysed) out.push(...v.lookAwayRanges, ...v.postureFlags, ...v.faceTouchRanges);
  return out;
}

export interface Verified {
  report: LlmReport;
  dropped: number;
  problems: string[];
}

/**
 * Checks every quote against the transcript, snaps timestamps to where the words were actually
 * said, and drops anything that can't be traced to the recording.
 */
export function verifyReport(raw: LlmReport, req: EvaluateRequest): Verified {
  const words = req.words;
  const dur = req.recording.durationSec;
  const problems: string[] = [];
  let dropped = 0;
  const fix = <T extends { t: number; quote: string }>(item: T, where: string): T | null => {
    const t = locateQuote(words, item.quote);
    if (t === null) {
      dropped++;
      problems.push(`${where}: the quote "${item.quote}" is not in the transcript word for word.`);
      return null;
    }
    return { ...item, t: Math.round(t * 10) / 10 };
  };
  const keep = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

  const rubric = { ...raw.rubric };
  for (const key of ["content_structure", "delivery_voice", "body_language", "qa_handling"] as RubricKey[]) {
    const r = rubric[key];
    if (!r) continue;
    // Q&A evidence quotes come from answer transcripts, so only main-speech areas are checked here.
    rubric[key] = key === "qa_handling" ? r : { ...r, evidence: keep(r.evidence.map((e) => fix(e, `${key}.evidence`))) };
  }
  if (!req.answers) rubric.qa_handling = null;

  const flagged = flaggedRanges(req);
  const moments = keep(
    raw.moments.map((m) => {
      if (m.quote) {
        const t = locateQuote(words, m.quote);
        if (t === null) {
          dropped++;
          problems.push(`moments: the quote "${m.quote}" is not in the transcript word for word.`);
          return null;
        }
        return { ...m, t: Math.round(t * 10) / 10 };
      }
      const ok = m.t >= 0 && m.t <= dur + 1 && flagged.some((r) => m.t >= r.start - 2 && m.t <= r.end + 2);
      if (!ok) {
        dropped++;
        problems.push(`moments: "${m.label}" at ${m.t}s has no quote and doesn't match any measured range — add a quote or use a measured time range.`);
        return null;
      }
      return m;
    }),
  ).sort((a, b) => a.t - b.t);

  const strengths = keep(raw.strengths.map((s) => fix(s, "strengths")));
  const fixes = keep(
    raw.fixes.map((f) => {
      const o = fix(f.original, "fixes.original");
      return o ? { ...f, original: o } : null;
    }),
  );
  const accuracy_flags = keep(raw.accuracy_flags.map((a) => fix(a, "accuracy_flags")));
  const script_coverage = raw.script_coverage && req.setup.script
    ? {
        covered: keep(raw.script_coverage.covered.map((c) => fix(c, "script_coverage.covered"))),
        missed: raw.script_coverage.missed,
        added: keep(raw.script_coverage.added.map((c) => fix(c, "script_coverage.added"))),
      }
    : null;

  if (strengths.length < 3) problems.push(`Only ${strengths.length} strengths had real quotes; 3 are required.`);
  if (fixes.length < 3) problems.push(`Only ${fixes.length} fixes had real quotes; 3 are required.`);
  if (moments.length < 5) problems.push(`Only ${moments.length} valid moments; 5–8 are required.`);

  return {
    report: { ...raw, rubric, moments, strengths, fixes, accuracy_flags, script_coverage, notes_usage_comment: req.setup.script ? raw.notes_usage_comment : null },
    dropped,
    problems,
  };
}

export function verifyAnswer(e: AnswerEvaluation, words: Word[]): AnswerEvaluation {
  if (!e.quote) return e;
  const t = locateQuote(words, e.quote.quote);
  return { ...e, quote: t === null ? null : { quote: e.quote.quote, t: Math.round(t * 10) / 10 } };
}

/** Weighted overall score; Q&A's weight is shared out when there was no Q&A. */
export function overallScore(report: LlmReport, type: SessionSetup["speechType"]): { overall: number; weights: Record<RubricKey, number> } {
  const w = { ...rubricFor(type).weights };
  if (!report.rubric.qa_handling) w.qa_handling = 0;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])) as Record<RubricKey, number>;
  let sum = 0;
  for (const key of Object.keys(w) as RubricKey[]) {
    const r = report.rubric[key];
    if (r && w[key]) sum += r.score * w[key];
  }
  return { overall: Math.round((sum / total) * 10) / 10, weights };
}
