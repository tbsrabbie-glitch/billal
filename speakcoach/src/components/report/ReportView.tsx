"use client";

import { useEffect, useState, type ReactNode } from "react";
import { VideoPlayer } from "@/components/session/VideoPlayer";
import { Stat } from "@/components/ui/Stat";
import { getMedia } from "@/lib/db";
import { paceLabel } from "@/lib/metrics/speech";
import { fmtClock } from "@/lib/transcript";
import type { QARound, Report, RubricKey, SessionRecord } from "@/lib/types";
import { EyeContactChart, WpmChart } from "./Charts";

const RUBRIC_LABELS: Record<RubricKey, string> = {
  content_structure: "Content & structure",
  delivery_voice: "Delivery & voice",
  body_language: "Body language",
  qa_handling: "Q&A handling",
};

const SUB_LABELS: Record<string, string> = {
  opening_hook: "Opening hook",
  logical_flow: "Logical flow",
  key_message: "Key message",
  evidence_examples: "Evidence & examples",
  close: "Close",
  audience_fit: "Audience & goal fit",
  pace: "Pace",
  fillers: "Filler words",
  pauses: "Pauses",
  clarity: "Clarity",
  vocal_variety: "Vocal variety & energy",
  confident_phrasing: "Confident phrasing",
  eye_contact: "Eye contact",
  posture: "Posture",
  head_movement: "Head movement",
  gestures: "Gestures",
  expression: "Facial expression",
  fidgeting: "Fidgeting",
  directness: "Directness",
  structure: "Structure",
  composure: "Composure",
  answered_the_question: "Answered the question",
};

function scoreTone(s: number): "good" | "warn" | "bad" {
  return s >= 7 ? "good" : s >= 5 ? "warn" : "bad";
}

function scoreColor(s: number): string {
  return s >= 7 ? "bg-green-600" : s >= 5 ? "bg-amber-500" : "bg-red-600";
}

export function TimeChip({ t, onSeek }: { t: number; onSeek?: (t: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeek?.(t)}
      className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-xs tabular-nums text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200"
    >
      {fmtClock(t)}
    </button>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Quote({ text }: { text: string }) {
  return <q className="italic opacity-80">{text}</q>;
}

export function RubricCards({ report, specificLabel, onSeek }: { report: Report; specificLabel: string; onSeek: (t: number) => void }) {
  const [open, setOpen] = useState<RubricKey | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(RUBRIC_LABELS) as RubricKey[]).map((key) => {
        const r = report.rubric[key];
        if (!r) return null;
        return (
          <div key={key} className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <button type="button" className="w-full text-left" onClick={() => setOpen(open === key ? null : key)}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{RUBRIC_LABELS[key]}</span>
                <span className="text-xl font-semibold tabular-nums">
                  {r.score}
                  <span className="text-sm opacity-50">/10</span>
                </span>
              </div>
              <p className="mt-1 text-sm opacity-80">{r.reason}</p>
              <p className="mt-1 text-xs opacity-50">
                weight {report.weights[key]}% · {open === key ? "hide" : "show"} details
              </p>
            </button>
            {open === key && (
              <div className="mt-3 space-y-2">
                {Object.entries(r.sub).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 opacity-80">{k === "type_specific" ? specificLabel : (SUB_LABELS[k] ?? k)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <span className={`block h-full ${scoreColor(v)}`} style={{ width: `${v * 10}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{v}</span>
                  </div>
                ))}
                {r.evidence.map((e, i) => (
                  <p key={i} className="text-sm">
                    <TimeChip t={e.t} onSeek={onSeek} /> <Quote text={e.quote} />
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HardMetrics({ session, onSeek }: { session: SessionRecord; onSeek: (t: number) => void }) {
  const m = session.metrics!;
  const v = session.vision;
  const voice = session.voice;
  const used = session.recording!.durationSec;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Time used" value={`${fmtClock(used)} / ${fmtClock(m.timeAllowedSec)}`} hint={used < m.timeAllowedSec * 0.75 ? "well under time" : "good use of time"} tone={used < m.timeAllowedSec * 0.75 ? "warn" : "good"} />
        <Stat label="Pace" value={`${m.wpmOverall} wpm`} hint={paceLabel(m.wpmOverall)} tone={paceLabel(m.wpmOverall) === "good" ? "good" : "warn"} />
        <Stat label="Filler words" value={String(m.fillers.count)} hint={`${m.fillers.perMinute} per minute`} tone={m.fillers.perMinute <= 2 ? "good" : m.fillers.perMinute <= 5 ? "warn" : "bad"} />
        <Stat
          label="Eye contact"
          value={v?.analysed ? `${v.eyeContactPct}%` : "—"}
          hint={v?.analysed ? "looking at the camera" : (v?.unavailableReason ?? "not measured")}
          tone={v?.analysed ? (v.eyeContactPct >= 70 ? "good" : v.eyeContactPct >= 50 ? "warn" : "bad") : undefined}
        />
        <Stat label="Long pauses" value={String(m.longPauses.length)} hint="over 2 seconds" />
        <Stat
          label="Vocal variety"
          value={voice?.analysed ? `${voice.pitchVariationSt} st` : "—"}
          hint={voice?.analysed ? (voice.pitchVariationSt < 2 ? "fairly flat" : voice.pitchVariationSt < 3 ? "some variation" : "lively") : "not measured"}
          tone={voice?.analysed ? (voice.pitchVariationSt >= 3 ? "good" : voice.pitchVariationSt >= 2 ? "warn" : "bad") : undefined}
        />
      </dl>

      <WpmChart metrics={m} onSeek={onSeek} />
      {v?.analysed && <EyeContactChart vision={v} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-medium">Filler words</h3>
          {m.fillers.items.length === 0 ? (
            <p className="text-sm opacity-60">None detected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {m.fillers.items.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-black/10 py-0.5 pl-2 pr-0.5 text-xs dark:border-white/10">
                  {f.word} <TimeChip t={f.t} onSeek={onSeek} />
                </span>
              ))}
            </div>
          )}
          {m.hedges.count > 0 && (
            <p className="mt-2 text-xs opacity-70">
              Hedges ({m.hedges.count}): {m.hedges.items.map((h) => `“${h.phrase}”`).join(", ")}
            </p>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <h3 className="mb-1 font-medium">Long pauses (&gt;2 s)</h3>
            {m.longPauses.length === 0 ? <p className="opacity-60">None.</p> : m.longPauses.map((p, i) => (
              <p key={i}><TimeChip t={p.start} onSeek={onSeek} /> {p.dur}s silence</p>
            ))}
          </div>
          <div>
            <h3 className="mb-1 font-medium">Rushed sections</h3>
            {m.rushedSections.length === 0 ? <p className="opacity-60">None.</p> : m.rushedSections.map((r, i) => (
              <p key={i}><TimeChip t={r.start} onSeek={onSeek} />–{fmtClock(r.end)} at {r.wpm} wpm</p>
            ))}
          </div>
          {v?.analysed && v.lookAwayRanges.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium">Looked away from the camera</h3>
              <div className="flex flex-wrap gap-1.5">
                {v.lookAwayRanges.map((r, i) => (
                  <span key={i} className="text-xs"><TimeChip t={r.start} onSeek={onSeek} /> {r.direction} {Math.round(r.end - r.start)}s</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportBody({ session, onSeek, specificLabel }: { session: SessionRecord; onSeek: (t: number) => void; specificLabel: string }) {
  const r = session.report!;
  return (
    <div className="space-y-8">
      <Section title="Timestamped moments">
        <ul className="space-y-2">
          {r.moments.map((m, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <TimeChip t={m.t} onSeek={onSeek} />
              <span className={m.polarity === "positive" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                {m.polarity === "positive" ? "▲" : "▼"}
              </span>
              <span>
                {m.label}
                {m.quote && (
                  <>
                    {" "}— <Quote text={m.quote} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Strengths">
        <ol className="space-y-3">
          {r.strengths.map((s, i) => (
            <li key={i} className="rounded-xl bg-green-50 p-3 text-sm dark:bg-green-950/40">
              <p className="font-medium">{s.title}</p>
              <p className="opacity-80">{s.detail}</p>
              <p className="mt-1"><TimeChip t={s.t} onSeek={onSeek} /> <Quote text={s.quote} /></p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Top 3 fixes">
        <ol className="space-y-3">
          {r.fixes.map((f, i) => (
            <li key={i} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
              <p className="font-medium">{i + 1}. {f.title}</p>
              <p className="opacity-80">{f.why}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-red-50 p-2 dark:bg-red-950/40">
                  <p className="text-xs font-medium uppercase opacity-60">You said <TimeChip t={f.original.t} onSeek={onSeek} /></p>
                  <p className="mt-1"><Quote text={f.original.quote} /></p>
                </div>
                <div className="rounded-lg bg-green-50 p-2 dark:bg-green-950/40">
                  <p className="text-xs font-medium uppercase opacity-60">Say it like this instead</p>
                  <p className="mt-1">{f.say_instead}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Drills for next time">
        <ul className="space-y-2">
          {r.drills.map((d, i) => (
            <li key={i} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
              <p className="font-medium">
                {d.name} <span className="font-normal opacity-60">· {d.minutes} min · targets {d.targets.replace(/_/g, " ").replace(".", " → ")}</span>
              </p>
              <p className="opacity-80">{d.instructions}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Rewritten opening and closing">
        <div className="grid gap-3 sm:grid-cols-2">
          <blockquote className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10"><p className="mb-1 text-xs font-medium uppercase opacity-60">Opening</p>{r.rewrite.opening}</blockquote>
          <blockquote className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10"><p className="mb-1 text-xs font-medium uppercase opacity-60">Closing</p>{r.rewrite.closing}</blockquote>
        </div>
      </Section>

      {r.script_coverage && (
        <Section title="Script coverage">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <h3 className="font-medium text-green-700 dark:text-green-400">Covered ({r.script_coverage.covered.length})</h3>
              {r.script_coverage.covered.map((c, i) => <p key={i}><TimeChip t={c.t} onSeek={onSeek} /> {c.point}</p>)}
            </div>
            <div>
              <h3 className="font-medium text-red-700 dark:text-red-400">Missed ({r.script_coverage.missed.length})</h3>
              {r.script_coverage.missed.map((c, i) => <p key={i}>• {c.point}</p>)}
            </div>
            <div>
              <h3 className="font-medium">Added ({r.script_coverage.added.length})</h3>
              {r.script_coverage.added.map((c, i) => <p key={i}><TimeChip t={c.t} onSeek={onSeek} /> {c.point}</p>)}
            </div>
          </div>
          {r.notes_usage_comment && <p className="text-sm opacity-80">On-screen notes: {r.notes_usage_comment}</p>}
        </Section>
      )}

      {r.accuracy_flags.length > 0 && (
        <Section title="Possible accuracy issues — please verify">
          <ul className="space-y-2 text-sm">
            {r.accuracy_flags.map((a, i) => (
              <li key={i}>
                <TimeChip t={a.t} onSeek={onSeek} /> <Quote text={a.quote} /> — {a.concern} <span className="opacity-50">({a.confidence} confidence)</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {session.qa && session.qa.questions.length > 0 && <QASection qa={session.qa} sessionId={session.id} />}

      <p className="text-xs opacity-50">
        Generated by {r.model} in {(r.generationMs / 1000).toFixed(0)} s. Every quote above was checked against your transcript
        {r.droppedUnverified > 0 ? `; ${r.droppedUnverified} item(s) that couldn't be verified were removed` : ""}. Rubric for “{specificLabel}”.
      </p>
    </div>
  );
}

function AnswerVideo({ sessionId, qid }: { sessionId: string; qid: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    getMedia(sessionId, `answer-video-${qid}`).then((m) => setBlob(m?.blob ?? null)).catch(() => {});
  }, [sessionId, qid]);
  return blob ? <VideoPlayer blob={blob} /> : null;
}

function QASection({ qa, sessionId }: { qa: QARound; sessionId: string }) {
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  return (
    <Section title="Your answers">
      <ol className="space-y-4">
        {qa.questions.map((q, i) => {
          const a = qa.answers.find((x) => x.questionId === q.id);
          const e = a?.evaluation;
          return (
            <li key={q.id} className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">Q{i + 1}. {q.question}</p>
                {e && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white ${scoreColor(e.score)}`}>{e.score}/10</span>}
              </div>
              <p className="text-xs opacity-60">Why this was asked: {q.reason}</p>
              {!a || a.skipped ? (
                <p className="mt-2 opacity-60">Skipped.</p>
              ) : (
                <>
                  {a.transcript && <p className="mt-2 opacity-80">“{a.transcript.text}”</p>}
                  {a.metrics && (
                    <p className="mt-1 text-xs opacity-60">
                      {fmtClock(a.durationSec ?? 0)} · {a.metrics.wpmOverall} wpm · {a.metrics.fillers.count} fillers
                      {a.vision?.analysed ? ` · eye contact ${a.vision.eyeContactPct}%` : ""}
                    </p>
                  )}
                  {e ? (
                    <div className="mt-2 space-y-1">
                      <p>{e.feedback}</p>
                      <p className="text-xs opacity-70">
                        Directness {e.sub.directness} · Structure {e.sub.structure} · Composure {e.sub.composure} · Answered the question {e.sub.answered_the_question}
                      </p>
                      <p className="mt-1 font-medium">A stronger answer:</p>
                      <ul className="list-disc pl-5">{e.better_answer_outline.map((b, k) => <li key={k}>{b}</li>)}</ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs opacity-60">No evaluation for this answer.</p>
                  )}
                  <button type="button" className="mt-2 text-xs underline" onClick={() => setOpenVideo(openVideo === q.id ? null : q.id)}>
                    {openVideo === q.id ? "Hide answer video" : "Watch answer"}
                  </button>
                  {openVideo === q.id && <div className="mt-2"><AnswerVideo sessionId={sessionId} qid={q.id} /></div>}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export { scoreTone, scoreColor, Section };
