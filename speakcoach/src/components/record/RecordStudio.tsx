"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { NotesPanel } from "./NotesPanel";
import {
  MediaError,
  SessionRecorder,
  checkRecordingSupport,
  explainMediaError,
  formatClock,
  keepScreenAwake,
  openCamera,
  stopStream,
  watchMicLevel,
  type RecordingResult,
} from "@/lib/recorder";
import type { NotesToggle, RecordingInfo } from "@/lib/types";

type Phase = "idle" | "starting" | "preview" | "countdown" | "recording" | "saving" | "save-failed";

const WARN_AT_SEC = 30;

export interface StudioResult {
  recording: RecordingResult;
  info: RecordingInfo;
}

export function RecordStudio({
  durationSec,
  notes,
  hasPreviousTake,
  onFinished,
}: {
  durationSec: number;
  notes?: string;
  hasPreviousTake: boolean;
  /** Must persist the recording. Throwing keeps the take on screen so it isn't lost. */
  onFinished: (result: StudioResult) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const startedAtRef = useRef(0);
  const notesOpenRef = useRef(false);
  const togglesRef = useRef<NotesToggle[]>([]);
  const releaseWakeRef = useRef<() => void>(() => {});
  const stoppingRef = useRef(false);
  const pendingRef = useRef<StudioResult | null>(null);
  const onFinishedRef = useRef(onFinished);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<MediaError | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);

  const remaining = Math.max(0, durationSec - elapsed);
  const warning = phase === "recording" && remaining <= WARN_AT_SEC;

  // Attach the stream whenever the video element is (re)rendered.
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      releaseWakeRef.current();
    };
  }, []);

  // Mic level meter while previewing, so a dead or muted mic is caught before recording.
  useEffect(() => {
    if (phase !== "preview" || !streamRef.current) return;
    let peak = 0;
    const stop = watchMicLevel(streamRef.current, (level) => {
      setMicLevel(level);
      if (level > peak) {
        peak = level;
        setMicPeak(level);
      }
    });
    return stop;
  }, [phase]);

  // Warn before leaving mid-recording.
  useEffect(() => {
    if (phase !== "recording" && phase !== "save-failed") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  async function startCamera() {
    setError(null);
    const unsupported = checkRecordingSupport();
    if (unsupported) {
      setError(unsupported);
      return;
    }
    setPhase("starting");
    try {
      stopStream(streamRef.current);
      streamRef.current = await openCamera();
      setMicPeak(0);
      setPhase("preview");
    } catch (err) {
      setError(explainMediaError(err));
      setPhase("idle");
    }
  }

  const toggleNotes = useCallback(() => {
    const next = !notesOpenRef.current;
    notesOpenRef.current = next;
    setNotesOpen(next);
    if (recorderRef.current && startedAtRef.current) {
      togglesRef.current.push({ t: (performance.now() - startedAtRef.current) / 1000, open: next });
    }
  }, []);

  function beginCountdown() {
    setPhase("countdown");
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
      } else {
        window.clearInterval(id);
        void startRecording();
      }
    }, 1000);
  }

  async function startRecording() {
    const stream = streamRef.current;
    if (!stream || stream.getTracks().some((t) => t.readyState === "ended")) {
      setError(new MediaError("The camera stopped unexpectedly.", "Press Try again to restart the camera."));
      setPhase("idle");
      return;
    }
    try {
      const rec = new SessionRecorder(stream);
      recorderRef.current = rec;
      togglesRef.current = notesOpenRef.current ? [{ t: 0, open: true }] : [];
      stoppingRef.current = false;
      rec.start();
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase("recording");
      releaseWakeRef.current = await keepScreenAwake();
    } catch (err) {
      setError(explainMediaError(err));
      setPhase("preview");
    }
  }

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    const durationActual = (performance.now() - startedAtRef.current) / 1000;
    setPhase("saving");
    releaseWakeRef.current();

    let recording: RecordingResult;
    try {
      recording = await rec.stop();
    } catch (err) {
      setError(explainMediaError(err));
      setPhase("preview");
      return;
    }
    stopStream(streamRef.current);
    streamRef.current = null;

    const toggles = togglesRef.current;
    let openSec = 0;
    for (let i = 0; i < toggles.length; i++) {
      if (toggles[i].open) openSec += (toggles[i + 1]?.t ?? durationActual) - toggles[i].t;
    }

    const result: StudioResult = {
      recording,
      info: {
        durationSec: Math.min(durationActual, durationSec),
        videoMimeType: recording.video.type,
        audioMimeType: recording.audio?.type,
        stoppedEarly: durationActual < durationSec - 0.5,
        notesOpenSec: Math.round(openSec * 10) / 10,
        notesToggles: toggles,
        recordedAt: Date.now(),
      },
    };
    pendingRef.current = result;
    await save(result);
  }, [durationSec]);

  async function save(result: StudioResult) {
    setSaveError(null);
    setPhase("saving");
    try {
      await onFinishedRef.current(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown storage error.");
      setPhase("save-failed");
    }
  }

  function downloadPending() {
    const v = pendingRef.current?.recording.video;
    if (!v) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(v);
    a.download = `speech-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${v.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  // Clock: soft warning, then auto-stop at the limit.
  useEffect(() => {
    if (phase !== "recording") return;
    let warned = false;
    const id = window.setInterval(() => {
      const e = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(e);
      if (!warned && durationSec - e <= WARN_AT_SEC) {
        warned = true;
        navigator.vibrate?.(150);
      }
      if (e >= durationSec) void stopRecording();
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, durationSec, stopRecording]);

  const showVideo = phase === "preview" || phase === "countdown" || phase === "recording";
  const micQuiet = phase === "preview" && micPeak < 0.04;

  return (
    <div className="space-y-4">
      {error && (
        <ErrorBanner
          title={error.message}
          action={
            <Button variant="secondary" onClick={startCamera}>
              Try again
            </Button>
          }
        >
          {error.help}
        </ErrorBanner>
      )}

      {phase === "save-failed" && (
        <ErrorBanner
          title="Your recording is safe on this screen, but it couldn't be saved to the device."
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => pendingRef.current && save(pendingRef.current)}>Try saving again</Button>
              <Button variant="secondary" onClick={downloadPending}>
                Download the video
              </Button>
            </div>
          }
        >
          {saveError} — this is usually because the device storage is full. Free some space, or delete old
          sessions in another tab, then press “Try saving again”.
        </ErrorBanner>
      )}

      <div className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl bg-black sm:aspect-video">
        {showVideo && (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        )}

        {!showVideo && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {phase === "saving" && <p>Saving your recording…</p>}
            {phase === "save-failed" && <p>Recording finished — not yet saved.</p>}
            {(phase === "idle" || phase === "starting") && (
              <>
                <p className="text-sm opacity-80">
                  {hasPreviousTake
                    ? "Recording again will replace your previous take for this session."
                    : "Your video stays on this device."}
                </p>
                <Button onClick={startCamera} disabled={phase === "starting"} className="bg-white text-black">
                  {phase === "starting" ? "Starting camera…" : "Turn on camera & mic"}
                </Button>
              </>
            )}
          </div>
        )}

        {showVideo && notesOpen && notes && <NotesPanel text={notes} scrolling={phase === "recording"} />}

        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span key={count} className="animate-ping text-8xl font-bold text-white [animation-iteration-count:1]">
              {count}
            </span>
          </div>
        )}

        {phase === "recording" && (
          <div
            className={`absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full px-3 py-1.5 text-lg font-semibold tabular-nums text-white ${
              warning ? "bg-amber-500" : "bg-black/60"
            }`}
          >
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {formatClock(remaining)}
          </div>
        )}
        {warning && (
          <div className="absolute bottom-3 right-3 z-20 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-black">
            30 seconds left — start closing
          </div>
        )}

        {phase === "preview" && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-black/60 p-2 text-xs text-white">
            <div className="mb-1 flex justify-between">
              <span>Mic level — say a few words</span>
              {micQuiet && <span className="text-amber-300">Can&apos;t hear you yet</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-green-400 transition-[width] duration-75" style={{ width: `${micLevel * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="safe-bottom mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2">
        {notes && showVideo && (
          <Button variant="secondary" onClick={toggleNotes}>
            {notesOpen ? "Hide notes" : "Show notes"}
          </Button>
        )}
        {phase === "preview" && (
          <Button onClick={beginCountdown} className="px-8 py-3 text-base">
            Start ({formatClock(durationSec)})
          </Button>
        )}
        {phase === "recording" && (
          <Button variant="danger" onClick={() => void stopRecording()} className="px-8 py-3 text-base">
            Stop
          </Button>
        )}
      </div>

      {phase === "preview" && (
        <p className="text-center text-xs opacity-60">
          Tip: look at the camera lens, not the screen. Notes appear at the top, near the lens.
        </p>
      )}
    </div>
  );
}
