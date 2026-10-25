"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import rubrics from "../../../../../prompts/rubrics.json";
import { HardMetrics, ReportBody, RubricCards, Section } from "@/components/report/ReportView";
import { DeleteSessionButton } from "@/components/session/DeleteSessionButton";
import { TranscriptLegend, TranscriptView } from "@/components/session/TranscriptView";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/session/VideoPlayer";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { getMedia, getSession, updateSession } from "@/lib/db";
import { generateReport } from "@/lib/pipeline";
import { speechTypeLabel, type SessionRecord, type SpeechType } from "@/lib/types";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  const [video, setVideo] = useState<Blob | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    try {
      setSession(await generateReport(id, setStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.clearInterval(timer);
      setStep(null);
      running.current = false;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getSession(id).catch(() => undefined);
      if (cancelled) return;
      setSession(s ?? null);
      if (!s) return;
      const v = await getMedia(id, "main-video").catch(() => undefined);
      if (cancelled) return;
      setVideo(v?.blob ?? null);
      if (s.recording && !s.report) void run();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, run]);

  async function regenerate() {
    if (!window.confirm("Generate a fresh report? This replaces the current one (and uses API credit).")) return;
    await updateSession(id, { report: undefined });
    setSession((s) => (s ? { ...s, report: undefined } : s));
    void run();
  }

  const seek = (t: number) => playerRef.current?.seek(t);

  if (session === undefined) return <p className="opacity-70">Loading…</p>;
  if (session === null)
    return (
      <p>
        Session not found. <Link href="/" className="underline">Back to sessions</Link>.
      </p>
    );

  const { setup, report } = session;
  const specificLabel = (rubrics as unknown as Record<SpeechType, { type_specific: string }>)[setup.speechType].type_specific;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-60">
          {speechTypeLabel(setup.speechType)} · {setup.audience} · {new Date(session.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
        </p>
        <h1 className="text-xl font-semibold">{setup.topic}</h1>
        <p className="text-sm opacity-70">Goal: {setup.goal}</p>
      </div>

      {video && (
        <div className="sticky top-0 z-30 -mx-4 bg-background px-4 pb-2 pt-1 sm:static sm:mx-0 sm:px-0">
          <VideoPlayer ref={playerRef} blob={video} className="max-h-[30vh] sm:max-h-[60vh]" />
        </div>
      )}

      {error && (
        <ErrorBanner title="Couldn't create the report" action={<Button onClick={run}>Retry</Button>}>
          {error} Your recording and transcript are saved.
        </ErrorBanner>
      )}

      {step && (
        <div className="flex items-center gap-3 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/10">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="flex-1">{step}</span>
          <span className="tabular-nums opacity-60">{elapsed}s</span>
        </div>
      )}

      {report && session.metrics && (
        <>
          <section className="flex items-center gap-5 rounded-2xl bg-foreground p-5 text-background">
            <div className="text-center">
              <div className="text-5xl font-bold tabular-nums">{report.overallScore.toFixed(1)}</div>
              <div className="text-xs opacity-70">overall / 10</div>
            </div>
            <p className="text-sm opacity-90">{report.rubric.content_structure.reason}</p>
          </section>

          <Section title="Scores">
            <RubricCards report={report} specificLabel={specificLabel} onSeek={seek} />
          </Section>

          <Section title="Measured">
            <HardMetrics session={session} onSeek={seek} />
          </Section>

          <ReportBody session={session} onSeek={seek} specificLabel={specificLabel} />

          {session.transcript && (
            <Section title="Transcript">
              <TranscriptView words={session.transcript.words} onSeek={seek} />
              <TranscriptLegend />
            </Section>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-black/10 pt-4 dark:border-white/10">
        <Button onClick={() => router.push(`/session/new?retry=${id}`)}>Retry this speech</Button>
        {session.retryOf && (
          <Button variant="secondary" onClick={() => router.push(`/compare?a=${session.retryOf}&b=${id}`)}>
            Compare with previous attempt
          </Button>
        )}
        {report && (
          <Button variant="secondary" onClick={regenerate}>
            Regenerate report
          </Button>
        )}
        <DeleteSessionButton id={id} onDeleted={() => router.push("/")} />
      </div>
    </div>
  );
}
