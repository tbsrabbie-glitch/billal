"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SetupForm } from "@/components/setup/SetupForm";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { createSession, getSession } from "@/lib/db";
import type { SessionRecord, SessionSetup } from "@/lib/types";

function NewSession() {
  const router = useRouter();
  const retryId = useSearchParams().get("retry");
  const [retryOf, setRetryOf] = useState<SessionRecord | null | undefined>(retryId ? undefined : null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!retryId) return;
    getSession(retryId)
      .then((s) => setRetryOf(s ?? null))
      .catch(() => setRetryOf(null));
  }, [retryId]);

  async function submit(setup: SessionSetup) {
    setSubmitting(true);
    setError(null);
    try {
      const session = await createSession(setup, retryOf?.id);
      router.push(`/session/${session.id}/record`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the session.");
      setSubmitting(false);
    }
  }

  if (retryOf === undefined) return <p className="opacity-70">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{retryOf ? "Retry this speech" : "New practice session"}</h1>
        <p className="mt-1 text-sm opacity-70">
          {retryOf ? "Same setup as before — change anything you like." : "Tell the coach what you're practising."}
        </p>
      </div>
      {error && <ErrorBanner title="Something went wrong">{error}</ErrorBanner>}
      <SetupForm initial={retryOf?.setup} submitting={submitting} onSubmit={submit} />
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<p className="opacity-70">Loading…</p>}>
      <NewSession />
    </Suspense>
  );
}
