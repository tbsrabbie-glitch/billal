"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { getQuestions, transcribe } from "@/lib/api";
import { getSession, saveMedia, updateSession } from "@/lib/db";
import { computeSpeechMetrics } from "@/lib/metrics/speech";
import { processMainSpeech, stripScript } from "@/lib/pipeline";
import {
  MediaError,
  SessionRecorder,
  checkRecordingSupport,
  explainMediaError,
  formatClock,
  keepScreenAwake,
  openCamera,
  stopStream,
} from "@/lib/recorder";
import { browserSpeaker, warmUpVoices } from "@/lib/tts";
import type { QAAnswer, Question, SessionRecord } from "@/lib/types";
import { computeVisionMetrics } from "@/lib/vision/body-metrics";
import { VisionTracker } from "@/lib/vision/tracker";

const ANSWER_LIMIT_SEC = 90;
const WARN_AT_SEC = 15;

type Phase = "loading" | "intro" | "starting" | "asking" | "ready" | "answering" | "saving" | "done";

const KIND_LABEL: Record<Question["kind"], string> = {
  clarify: "Clarifying",
  extend: "Tell me more",
  evidence: "Evidence",
  objection: "Objection",
  gap: "Gap",
};

export default function QAPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const speaker = useRef(browserSpeaker());
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const trackerRef = useRef<VisionTracker | null>(null);
  const startedRef = useRef(0);
  const stoppingRef = useRef(false);
  const releaseWakeRef = useRef<() => void>(() => {});
  // Serialises read-modify-write updates of the Q&A record (background transcriptions finish in any order).
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [camError, setCamError] = useState<MediaError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const question = questions[index];

  const updateAnswer = useCallback(
    (answer: QAAnswer) => {
      const job = writeQueue.current.then(async () => {
        const s = await getSession(id);
        if (!s?.qa) return;
        const answers = [...s.qa.answers.filter((a) => a.questionId !== answer.questionId), answer];
        await updateSession(id, { qa: { ...s.qa, answers } });
      });
      writeQueue.current = job.catch(() => {});
      return job;
    },
    [id],
  );

  const loadQuestions = useCallback(async () => {
    try {
      const s = await processMainSpeech(id);
      setSession(s);
      let qs = s.qa?.questions;
      if (!qs?.length) {
        if (!s.transcript) throw new Error("The speech hasn't been transcribed yet.");
        qs = (await getQuestions({ setup: stripScript(s.setup), words: s.transcript.words })).questions;
        await updateSession(id, { qa: { questions: qs, answers: [] }, status: "qa", report: undefined });
      }
      const done = new Set((s.qa?.answers ?? []).map((a) => a.questionId));
      const next = qs.findIndex((q) => !done.has(q.id));
      setQuestions(qs);
      setIndex(next === -1 ? qs.length : next);
      setPhase(next === -1 ? "done" : "intro");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    warmUpVoices();
    void Promise.resolve().then(loadQuestions);
    const sp = speaker.current;
    return () => {
      sp.cancel();
      trackerRef.current?.stop();
      stopStream(streamRef.current);
      releaseWakeRef.current();
    };
  }, [loadQuestions]);

  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  async function ask(q: Question) {
    setPhase("asking");
    setSpeaking(true);
    await speaker.current.speak(q.question);
    setSpeaking(false);
    setPhase((p) => (p === "asking" ? "ready" : p));
  }

  async function startQA() {
    setCamError(null);
    const unsupported = checkRecordingSupport();
    if (unsupported) return setCamError(unsupported);
    setPhase("starting");
    try {
      streamRef.current = await openCamera();
    } catch (err) {
      setCamError(explainMediaError(err));
      setPhase("intro");
      return;
    }
    releaseWakeRef.current = await keepScreenAwake();
    // Must run inside the tap handler so iPhone allows speech.
    void ask(questions[index]);
  }

  function startAnswer() {
    speaker.current.cancel();
    setSpeaking(false);
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const rec = new SessionRecorder(stream);
      recorderRef.current = rec;
      stoppingRef.current = false;
      if (videoRef.current) {
        const tracker = new VisionTracker(videoRef.current);
        trackerRef.current = tracker;
        void tracker.start();
        tracker.markRecordingStart();
      }
      rec.start();
      startedRef.current = performance.now();
      setElapsed(0);
      setPhase("answering");
    } catch (err) {
      setCamError(explainMediaError(err));
    }
  }

  function advance() {
    const next = index + 1;
    setIndex(next);
    if (next >= questions.length) {
      setPhase("done");
      stopStream(streamRef.current);
      streamRef.current = null;
      releaseWakeRef.current();
    } else {
      void ask(questions[next]);
    }
  }

  const stopAnswer = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || stoppingRef.current || !question) return;
    stoppingRef.current = true;
    const durationSec = Math.min((performance.now() - startedRef.current) / 1000, ANSWER_LIMIT_SEC);
    setPhase("saving");
    const capture = trackerRef.current?.stop();
    trackerRef.current = null;
    try {
      const { video, audio } = await rec.stop();
      await saveMedia(id, `answer-video-${question.id}`, video);
      if (audio) await saveMedia(id, `answer-audio-${question.id}`, audio);
      const answer: QAAnswer = {
        questionId: question.id,
        skipped: false,
        durationSec: Math.round(durationSec * 10) / 10,
        vision: capture ? computeVisionMetrics(capture, durationSec) : undefined,
      };
      await updateAnswer(answer);
      // Transcribe in the background so the report is ready sooner; the report step retries if this fails.
      const media = audio ?? video;
      void transcribe(media, { kind: "answer", durationSec })
        .then((transcript) => updateAnswer({ ...answer, transcript, metrics: computeSpeechMetrics(transcript, durationSec, ANSWER_LIMIT_SEC) }))
        .catch(() => {});
      advance();
    } catch (err) {
      setError(`Couldn't save your answer: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("ready");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, question, updateAnswer]);

  async function skip() {
    if (!question) return;
    speaker.current.cancel();
    await updateAnswer({ questionId: question.id, skipped: true });
    advance();
  }

  async function finishEarly() {
    speaker.current.cancel();
    for (const q of questions.slice(index)) await updateAnswer({ questionId: q.id, skipped: true });
    stopStream(streamRef.current);
    router.push(`/session/${id}/report`);
  }

  useEffect(() => {
    if (phase !== "answering") return;
    const t = window.setInterval(() => {
      const e = (performance.now() - startedRef.current) / 1000;
      setElapsed(e);
      if (e >= ANSWER_LIMIT_SEC) void stopAnswer();
    }, 200);
    return () => window.clearInterval(t);
  }, [phase, stopAnswer]);

  const remaining = Math.max(0, ANSWER_LIMIT_SEC - elapsed);
  const cameraOn = phase === "asking" || phase === "ready" || phase === "answering" || phase === "saving";

  if (error && phase === "loading") {
    return (
      <ErrorBanner
        title="Couldn't prepare your questions"
        action={
          <Button
            onClick={() => {
              setError(null);
              void loadQuestions();
            }}
          >
            Retry
          </Button>
        }
      >
        {error}
      </ErrorBanner>
    );
  }
  if (phase === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/10">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Preparing questions from your speech…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Q&amp;A round</h1>
        <span className="text-sm opacity-60">
          {Math.min(index + 1, questions.length)} / {questions.length}
        </span>
      </div>

      {error && <ErrorBanner title="Something went wrong">{error}</ErrorBanner>}
      {camError && (
        <ErrorBanner title={camError.message} action={<Button variant="secondary" onClick={startQA}>Try again</Button>}>
          {camError.help}
        </ErrorBanner>
      )}

      {phase === "intro" && (
        <div className="space-y-3 rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <p>
            You&apos;ll hear {questions.length - index} question{questions.length - index === 1 ? "" : "s"} from{" "}
            <strong>{session?.setup.audience}</strong>. After each one, press <em>Start answer</em> and reply to the camera (up to
            90 seconds). You can skip any question.
          </p>
          {!browserSpeaker().available && <p className="text-sm text-amber-700">This browser can&apos;t read aloud — questions will be shown on screen only.</p>}
          <Button onClick={startQA} className="w-full py-3 text-base">
            Start Q&amp;A
          </Button>
        </div>
      )}

      {cameraOn && (
        <>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-xl overflow-hidden rounded-2xl bg-black sm:aspect-video">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            {question && (
              <div className="absolute inset-x-2 top-2 rounded-xl bg-black/70 p-3 text-white backdrop-blur-sm">
                <p className="text-xs uppercase tracking-wide opacity-70">
                  {KIND_LABEL[question.kind]} {speaking && "· speaking…"}
                </p>
                <p className="mt-1 text-lg leading-snug">{question.question}</p>
              </div>
            )}
            {phase === "answering" && (
              <div
                className={`absolute bottom-3 left-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-lg font-semibold tabular-nums text-white ${
                  remaining <= WARN_AT_SEC ? "bg-amber-500" : "bg-black/60"
                }`}
              >
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                {formatClock(remaining)}
              </div>
            )}
            {phase === "saving" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">Saving answer…</div>
            )}
          </div>

          <div className="safe-bottom flex flex-wrap justify-center gap-2">
            {(phase === "asking" || phase === "ready") && (
              <>
                <Button onClick={startAnswer} className="px-8 py-3 text-base">
                  Start answer
                </Button>
                <Button variant="secondary" onClick={() => question && ask(question)} disabled={speaking}>
                  Replay question
                </Button>
                <Button variant="ghost" onClick={skip}>
                  Skip
                </Button>
              </>
            )}
            {phase === "answering" && (
              <Button variant="danger" onClick={() => void stopAnswer()} className="px-8 py-3 text-base">
                Done answering
              </Button>
            )}
          </div>
          {(phase === "asking" || phase === "ready") && (
            <p className="text-center">
              <button type="button" onClick={finishEarly} className="text-xs underline opacity-60">
                End Q&amp;A now and see my feedback
              </button>
            </p>
          )}
        </>
      )}

      {phase === "done" && (
        <div className="space-y-3 rounded-2xl border-2 border-foreground p-5 text-center">
          <p className="text-lg font-semibold">That&apos;s all the questions.</p>
          <Button onClick={() => router.push(`/session/${id}/report`)} className="px-8 py-3 text-base">
            See my feedback report
          </Button>
          <p>
            <Link href={`/session/${id}/review`} className="text-xs underline opacity-60">
              Back to the speech
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
