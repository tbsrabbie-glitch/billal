"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProgressCharts } from "@/components/history/ProgressCharts";
import { DeleteSessionButton } from "@/components/session/DeleteSessionButton";
import { exportData, importData, listSessions, storageEstimate } from "@/lib/db";
import { getConfig } from "@/lib/api";
import type { ConfigResponse } from "@/lib/api-types";
import { formatClock } from "@/lib/recorder";
import { SPEECH_TYPES, speechTypeLabel, type SessionRecord, type SpeechType } from "@/lib/types";

function sessionHref(s: SessionRecord): string {
  switch (s.status) {
    case "setup":
      return `/session/${s.id}/record`;
    case "recorded":
    case "transcribed":
      return `/session/${s.id}/review`;
    case "qa":
      return `/session/${s.id}/qa`;
    default:
      return `/session/${s.id}/report`;
  }
}

const STATUS_LABEL: Record<SessionRecord["status"], string> = {
  setup: "not recorded",
  recorded: "recorded",
  transcribed: "awaiting feedback",
  qa: "Q&A in progress",
  reported: "report ready",
};

function ScoreBadge({ score }: { score: number }) {
  const c = score >= 7 ? "bg-green-600" : score >= 5 ? "bg-amber-500" : "bg-red-600";
  return <span className={`rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums text-white ${c}`}>{score.toFixed(1)}</span>;
}

export default function Home() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [filter, setFilter] = useState<SpeechType | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usedMB: number; quotaMB: number } | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, est] = await Promise.all([listSessions(), storageEstimate()]);
      setSessions(list);
      setStorage(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSessions(), storageEstimate()])
      .then(([list, est]) => {
        if (cancelled) return;
        setSessions(list);
        setStorage(est);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSessions([]);
      });
    getConfig().then((c) => !cancelled && setConfig(c)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function doExport() {
    const blob = await exportData();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `speakcoach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importData(file);
      setNotice(`Imported ${n} session${n === 1 ? "" : "s"}.`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  const visible = (sessions ?? []).filter((s) => filter === "all" || s.setup.speechType === filter);
  const ids = new Set((sessions ?? []).map((s) => s.id));

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-foreground p-6 text-background">
        <h1 className="text-2xl font-semibold tracking-tight">Practise. Get questioned. Improve.</h1>
        <p className="mt-2 text-sm opacity-80">
          Record a 2.5–3 minute speech on camera, take questions like a real audience, and get specific feedback on content, voice and
          body language.
        </p>
        <Link href="/session/new" className="mt-4 inline-block rounded-xl bg-background px-5 py-2.5 text-sm font-medium text-foreground">
          Start a session
        </Link>
      </section>

      {config && (!config.transcription || !config.analysis) && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Setup needed: {!config.transcription && "DEEPGRAM_API_KEY "}
          {!config.analysis && "ANTHROPIC_API_KEY "}
          {!config.transcription && !config.analysis ? "are" : "is"} not set on the server. You can record, but transcripts and feedback
          won&apos;t work until it&apos;s added (see README).
        </p>
      )}
      {config?.mock && <p className="text-xs opacity-60">Demo mode: transcripts and feedback are sample data (MOCK_AI=1).</p>}

      {error && (
        <p className="text-sm text-red-600">Couldn&apos;t open local storage: {error}. Private/incognito windows may block it.</p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Progress</h2>
          {(["all", ...SPEECH_TYPES.map((t) => t.value)] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === t ? "border-foreground bg-foreground text-background" : "border-black/15 dark:border-white/20"
              }`}
            >
              {t === "all" ? "All types" : speechTypeLabel(t)}
            </button>
          ))}
        </div>
        {sessions && <ProgressCharts sessions={visible} />}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Sessions</h2>
        {sessions === null && <p className="opacity-70">Loading…</p>}
        {sessions && visible.length === 0 && <p className="text-sm opacity-70">No sessions yet.</p>}
        <ul className="space-y-2">
          {visible.map((s) => (
            <li key={s.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <Link href={sessionHref(s)} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.setup.topic}</p>
                  <p className="text-xs opacity-60">
                    {speechTypeLabel(s.setup.speechType)} ·{" "}
                    {new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    {s.recording ? ` · ${formatClock(s.recording.durationSec)}` : ""} · {STATUS_LABEL[s.status]}
                  </p>
                </Link>
                {s.report && <ScoreBadge score={s.report.overallScore} />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <Link href={`/session/new?retry=${s.id}`} className="underline">
                  Retry this speech
                </Link>
                {s.retryOf && ids.has(s.retryOf) && (
                  <Link href={`/compare?a=${s.retryOf}&b=${s.id}`} className="underline">
                    Compare with previous attempt
                  </Link>
                )}
                <span className="flex-1" />
                <DeleteSessionButton id={s.id} onDeleted={refresh} compact />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 border-t border-black/10 pt-4 text-xs opacity-70 dark:border-white/10">
        {storage && (
          <p>
            Stored on this device: {storage.usedMB} MB of about {storage.quotaMB} MB available. Videos never leave this device.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="underline" onClick={doExport}>
            Export backup (reports &amp; transcripts, no videos)
          </button>
          <button type="button" className="underline" onClick={() => importRef.current?.click()}>
            Import backup
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
        {notice && <p>{notice}</p>}
      </section>
    </div>
  );
}
