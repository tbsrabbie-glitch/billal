"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { VideoPlayer } from "@/components/session/VideoPlayer";
import { DeleteSessionButton } from "@/components/session/DeleteSessionButton";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { getMedia, getSession } from "@/lib/db";
import { downloadBlob, safeFileName } from "@/lib/download";
import { formatClock } from "@/lib/recorder";
import { speechTypeLabel, type SessionRecord } from "@/lib/types";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  const [video, setVideo] = useState<Blob | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSession(id);
        setSession(s ?? null);
        if (!s) return;
        const [v, a] = await Promise.all([getMedia(id, "main-video"), getMedia(id, "main-audio")]);
        setVideo(v?.blob ?? null);
        setHasAudio(!!a);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        setSession(null);
      }
    })();
  }, [id]);

  if (loadError) return <ErrorBanner title="Couldn't load this session">{loadError}</ErrorBanner>;
  if (session === undefined) return <p className="opacity-70">Loading…</p>;
  if (session === null)
    return (
      <p>
        Session not found. <Link href="/" className="underline">Back to sessions</Link>.
      </p>
    );

  const { setup, recording } = session;

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

  const notesPct = recording.durationSec > 0 ? Math.round((recording.notesOpenSec / recording.durationSec) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-60">
          {speechTypeLabel(setup.speechType)} · {setup.audience} · {setup.questionerMode === "tough" ? "Tough panel" : "Friendly"}
        </p>
        <h1 className="text-xl font-semibold">{setup.topic}</h1>
      </div>

      <VideoPlayer blob={video} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Time used" value={`${formatClock(recording.durationSec)} / ${formatClock(setup.durationSec)}`} />
        <Stat label="Ended" value={recording.stoppedEarly ? "Stopped early" : "Hit time limit"} />
        <Stat label="Notes shown" value={setup.script ? `${notesPct}% of the time` : "No notes"} />
        <Stat label="File size" value={`${(video.size / 1e6).toFixed(1)} MB`} />
      </dl>

      {!hasAudio && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          This browser couldn&apos;t record the separate audio track used for transcription. Transcription (Phase 2) will
          fall back to the video file, which is slower.
        </p>
      )}

      <div className="rounded-xl border border-dashed border-black/20 p-4 text-sm opacity-80 dark:border-white/20">
        Transcript, questions and the feedback report arrive in the next phases.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => router.push(`/session/${id}/record`)}>
          Record again
        </Button>
        <Button variant="secondary" onClick={() => downloadBlob(video, safeFileName(setup.topic))}>
          Download video
        </Button>
        <Link href={`/session/new?retry=${id}`} className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">
          New attempt (same setup)
        </Link>
        <DeleteSessionButton id={id} onDeleted={() => router.push("/")} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <dt className="text-xs opacity-60">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
