"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoPlayer } from "@/components/session/VideoPlayer";
import { getMedia, getSession, listSessions } from "@/lib/db";
import { fmtClock } from "@/lib/transcript";
import { speechTypeLabel, type RubricKey, type SessionRecord } from "@/lib/types";

interface Row {
  label: string;
  better: "higher" | "lower" | "none";
  value: (s: SessionRecord) => number | null;
  fmt?: (n: number) => string;
  deltaFmt?: (n: number) => string;
}

const RUBRIC_ROWS: [RubricKey, string][] = [
  ["content_structure", "Content & structure"],
  ["delivery_voice", "Delivery & voice"],
  ["body_language", "Body language"],
  ["qa_handling", "Q&A handling"],
];

const ROWS: Row[] = [
  { label: "Overall score", better: "higher", value: (s) => s.report?.overallScore ?? null, fmt: (n) => n.toFixed(1) },
  ...RUBRIC_ROWS.map(([k, label]): Row => ({ label, better: "higher", value: (s) => s.report?.rubric[k]?.score ?? null })),
  { label: "Time used", better: "none", value: (s) => s.recording?.durationSec ?? null, fmt: fmtClock, deltaFmt: (n) => `${Math.round(n)}s` },
  { label: "Pace (wpm)", better: "none", value: (s) => s.metrics?.wpmOverall ?? null },
  { label: "Filler words", better: "lower", value: (s) => s.metrics?.fillers.count ?? null },
  { label: "Hedges", better: "lower", value: (s) => s.metrics?.hedges.count ?? null },
  { label: "Long pauses", better: "lower", value: (s) => s.metrics?.longPauses.length ?? null },
  { label: "Eye contact %", better: "higher", value: (s) => (s.vision?.analysed ? s.vision.eyeContactPct : null) },
  { label: "Pitch variation (st)", better: "higher", value: (s) => (s.voice?.analysed ? s.voice.pitchVariationSt : null) },
];

function Delta({ a, b, better, fmt }: { a: number | null; b: number | null; better: Row["better"]; fmt?: (n: number) => string }) {
  if (a === null || b === null) return <span className="opacity-40">—</span>;
  const d = Math.round((b - a) * 10) / 10;
  if (d === 0) return <span className="opacity-50">=</span>;
  const good = better === "none" ? null : better === "higher" ? d > 0 : d < 0;
  const cls = good === null ? "opacity-70" : good ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400";
  return <span className={`font-medium ${cls}`}>{d > 0 ? "+" : "−"}{fmt ? fmt(Math.abs(d)) : Math.abs(d)}</span>;
}

function Column({ s }: { s: SessionRecord }) {
  const [video, setVideo] = useState<Blob | null>(null);
  useEffect(() => {
    getMedia(s.id, "main-video").then((m) => setVideo(m?.blob ?? null)).catch(() => {});
  }, [s.id]);
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs opacity-60">{new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
      {video ? <VideoPlayer blob={video} /> : <div className="aspect-video rounded-2xl bg-black/10" />}
      <Link href={`/session/${s.id}/report`} className="text-xs underline">
        Open full report
      </Link>
      {s.report && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Top fixes</p>
          <ul className="list-disc pl-5 opacity-80">
            {s.report.fixes.map((f, i) => <li key={i}>{f.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Compare() {
  const params = useSearchParams();
  const router = useRouter();
  const [a, setA] = useState<SessionRecord | null>(null);
  const [b, setB] = useState<SessionRecord | null>(null);
  const [all, setAll] = useState<SessionRecord[]>([]);
  const aId = params.get("a");
  const bId = params.get("b");

  useEffect(() => {
    listSessions().then(setAll).catch(() => {});
  }, []);
  useEffect(() => {
    if (aId) getSession(aId).then((s) => setA(s ?? null)).catch(() => {});
    if (bId) getSession(bId).then((s) => setB(s ?? null)).catch(() => {});
  }, [aId, bId]);

  const choose = (which: "a" | "b", id: string) => {
    const q = new URLSearchParams(params.toString());
    q.set(which, id);
    router.replace(`/compare?${q}`);
  };

  const picker = (which: "a" | "b", value: string | null) => (
    <select
      value={value ?? ""}
      onChange={(e) => choose(which, e.target.value)}
      className="w-full rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
    >
      <option value="">Choose a session…</option>
      {all.filter((s) => s.report).map((s) => (
        <option key={s.id} value={s.id}>
          {new Date(s.createdAt).toLocaleDateString("en-GB")} — {s.setup.topic} ({s.report!.overallScore.toFixed(1)})
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Compare attempts</h1>
        {a && <p className="text-sm opacity-70">{speechTypeLabel(a.setup.speechType)} · {a.setup.topic}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase opacity-60">Attempt A</p>
          {picker("a", aId)}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase opacity-60">Attempt B</p>
          {picker("b", bId)}
        </div>
      </div>

      {a && b && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Column s={a} />
            <Column s={b} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs opacity-60 dark:border-white/10">
                <th className="py-1.5 font-medium">Measure</th>
                <th className="font-medium">A</th>
                <th className="font-medium">B</th>
                <th className="font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const va = r.value(a);
                const vb = r.value(b);
                const f = (n: number | null) => (n === null ? "—" : r.fmt ? r.fmt(n) : String(n));
                return (
                  <tr key={r.label} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-1.5">{r.label}</td>
                    <td className="tabular-nums">{f(va)}</td>
                    <td className="tabular-nums">{f(vb)}</td>
                    <td className="tabular-nums"><Delta a={va} b={vb} better={r.better} fmt={r.deltaFmt ?? r.fmt} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="opacity-70">Loading…</p>}>
      <Compare />
    </Suspense>
  );
}
