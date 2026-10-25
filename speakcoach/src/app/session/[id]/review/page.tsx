"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/session/VideoPlayer";
import { DeleteSessionButton } from "@/components/session/DeleteSessionButton";
import { TranscriptLegend, TranscriptView } from "@/components/session/TranscriptView";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Stat } from "@/components/ui/Stat";
import { getMedia, getSession, updateSession } from "@/lib/db";
import { downloadBlob, safeFileName } from "@/lib/download";
import { paceLabel } from "@/lib/metrics/speech";
import { processMainSpeech } from "@/lib/pipeline";
import { fmtClock } from "@/lib/transcript";
import { speechTypeLabel, type SessionRecord } from "@/lib/types";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  const [video, setVideo] = useState<Blob | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const process = useCallback(async () => {
    setError(null);
    try {
      setSession(await processMainSpeech(id, setStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStep(null);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession(id);
        if (cancelled) return;
        setSession(s ?? null);
        if (!s) return;
        const v = await getMedia(id, "main-video");
        if (cancelled) return;
        setVideo(v?.blob ?? null);
        if (s.recording && (!s.transcript || !s.voice)) await process();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, process]);

  async function noQuestions() {
    await updateSession(id, { qa: null });
    router.push(`/session/${id}/report`);
  }

  if (session === undefined) return <p className="opacity-70">Loading…</p>;
  if (session === null)
    return (
      <p>
        Session not found. <Link href="/" className="underline">Back to sessions</Link>.
      </p>
    );

  const { setup, recording, transcript, metrics } = session;
  if (!recording || !video) {
    return (
      <div className="space-y-3">
        <p>No recording yet for this session.</p>
        <Link href={`/session/${id}/record`} className="underline">
          Record now
        </Link>
      </div>
    );
  }

  const lowAudio = transcript && transcript.avgConfidence < 0.6;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-60">
          {speechTypeLabel(setup.speechType)} · {setup.audience} · {setup.questionerMode === "tough" ? "Tough panel" : "Friendly"}
        </p>
        <h1 className="text-xl font-semibold">{setup.topic}</h1>
      </div>

      <VideoPlayer ref={playerRef} blob={video} />

      {error && (
        <ErrorBanner title="Couldn't finish processing" action={<Button onClick={process}>Retry</Button>}>
          {error}
        </ErrorBanner>
      )}

      {step && (
        <div className="flex items-center gap-3 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/10">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {step}
        </div>
      )}

      {transcript && metrics && (
        <>
          {lowAudio && (
            <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              The audio sounds unclear in places (background noise, or the mic is far away). Feedback may be less accurate —
              you can re-record, or carry on.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Time used" value={`${fmtClock(recording.durationSec)} / ${fmtClock(setup.durationSec)}`} />
            <Stat label="Pace" value={`${metrics.wpmOverall} wpm`} hint={paceLabel(metrics.wpmOverall)} />
            <Stat label="Filler words" value={String(metrics.fillers.count)} hint={`${metrics.fillers.perMinute}/min`} />
            <Stat label="Long pauses" value={String(metrics.longPauses.length)} hint="over 2 seconds" />
          </dl>

          <section className="space-y-2">
            <h2 className="font-semibold">Transcript</h2>
            <TranscriptView words={transcript.words} onSeek={(t) => playerRef.current?.seek(t)} />
            <TranscriptLegend />
          </section>

          <section className="rounded-2xl border-2 border-foreground p-5 text-center">
            <h2 className="text-lg font-semibold">Would you like to take questions on your speech?</h2>
            <p className="mt-1 text-sm opacity-70">
              {setup.questionerMode === "tough" ? "A tough panel" : "A friendly audience"} will ask 3–5 questions out loud. You answer on
              camera (up to 90 seconds each).
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => router.push(`/session/${id}/qa`)} className="px-6">
                Yes, ask me questions
              </Button>
              <Button variant="secondary" onClick={noQuestions} className="px-6">
                No, show my feedback
              </Button>
            </div>
            {session.report && (
              <Link href={`/session/${id}/report`} className="mt-3 inline-block text-sm underline">
                View the existing report
              </Link>
            )}
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => router.push(`/session/${id}/record`)}>
          Record again
        </Button>
        <Button variant="secondary" onClick={() => downloadBlob(video, safeFileName(setup.topic))}>
          Download video
        </Button>
        <DeleteSessionButton id={id} onDeleted={() => router.push("/")} />
      </div>
    </div>
  );
}
