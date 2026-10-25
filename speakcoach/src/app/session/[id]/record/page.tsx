"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RecordStudio, type StudioResult } from "@/components/record/RecordStudio";
import { getSession, requestPersistentStorage, saveMedia, updateSession } from "@/lib/db";
import { formatClock } from "@/lib/recorder";
import { computeVisionMetrics, emptyVision } from "@/lib/vision/body-metrics";
import { speechTypeLabel, type SessionRecord } from "@/lib/types";

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);

  useEffect(() => {
    getSession(id)
      .then((s) => setSession(s ?? null))
      .catch(() => setSession(null));
  }, [id]);

  const finished = useCallback(
    async ({ recording, info, vision }: StudioResult) => {
      void requestPersistentStorage();
      await saveMedia(id, "main-video", recording.video);
      if (recording.audio) await saveMedia(id, "main-audio", recording.audio);
      await saveMedia(id, "frames", new Blob([JSON.stringify(vision?.frames ?? [])], { type: "application/json" }));
      const visionMetrics = vision ? computeVisionMetrics(vision, info.durationSec) : emptyVision("Body-language tracking didn't start.");
      // A new take invalidates everything derived from the previous one.
      await updateSession(id, {
        status: "recorded",
        recording: info,
        vision: visionMetrics,
        transcript: undefined,
        metrics: undefined,
        voice: undefined,
        qa: undefined,
        report: undefined,
      });
      router.push(`/session/${id}/review`);
    },
    [id, router],
  );

  if (session === undefined) return <p className="opacity-70">Loading…</p>;
  if (session === null)
    return (
      <p>
        Session not found. <Link href="/session/new" className="underline">Start a new one</Link>.
      </p>
    );

  const { setup } = session;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-60">
          {speechTypeLabel(setup.speechType)} · {formatClock(setup.durationSec)} · {setup.audience}
        </p>
        <h1 className="text-xl font-semibold">{setup.topic}</h1>
        <p className="text-sm opacity-70">Goal: {setup.goal}</p>
      </div>
      <RecordStudio
        durationSec={setup.durationSec}
        notes={setup.script}
        hasPreviousTake={session.status !== "setup"}
        onFinished={finished}
      />
    </div>
  );
}
