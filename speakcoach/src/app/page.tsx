"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSessions, storageEstimate } from "@/lib/db";
import { formatClock } from "@/lib/recorder";
import { speechTypeLabel, type SessionRecord } from "@/lib/types";
import { DeleteSessionButton } from "@/components/session/DeleteSessionButton";

export default function Home() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usedMB: number; quotaMB: number } | null>(null);

  async function refresh() {
    try {
      setSessions(await listSessions());
      setStorage(await storageEstimate());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSessions([]);
    }
  }

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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-foreground p-6 text-background">
        <h1 className="text-2xl font-semibold tracking-tight">Practise. Get questioned. Improve.</h1>
        <p className="mt-2 text-sm opacity-80">
          Record a 2.5–3 minute speech on camera, take questions like a real audience, and get specific feedback on content,
          voice and body language.
        </p>
        <Link href="/session/new" className="mt-4 inline-block rounded-xl bg-background px-5 py-2.5 text-sm font-medium text-foreground">
          Start a session
        </Link>
      </section>

      {error && (
        <p className="text-sm text-red-600">
          Couldn&apos;t open local storage: {error}. Private/incognito windows may block it.
        </p>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Your sessions</h2>
        {sessions === null && <p className="opacity-70">Loading…</p>}
        {sessions?.length === 0 && <p className="text-sm opacity-70">No sessions yet.</p>}
        <ul className="space-y-2">
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
              <Link href={s.recording ? `/session/${s.id}/review` : `/session/${s.id}/record`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.setup.topic}</p>
                <p className="text-xs opacity-60">
                  {speechTypeLabel(s.setup.speechType)} · {new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  {s.recording ? ` · ${formatClock(s.recording.durationSec)}` : " · not recorded"}
                </p>
              </Link>
              <DeleteSessionButton id={s.id} onDeleted={refresh} />
            </li>
          ))}
        </ul>
        {storage && (
          <p className="mt-3 text-xs opacity-50">
            Stored on this device: {storage.usedMB} MB of about {storage.quotaMB} MB available.
          </p>
        )}
      </section>
    </div>
  );
}
