"use client";

import { evaluateAnswer, evaluateSpeech, transcribe } from "./api";
import type { AnswerPayload } from "./api-types";
import { getMedia, getSession, updateSession } from "./db";
import { computeSpeechMetrics } from "./metrics/speech";
import { analyseVoice } from "./metrics/voice";
import type { Frame, QAAnswer, Report, SessionRecord, SessionSetup } from "./types";

/** Topic words help the transcriber with names and jargon. */
function topicTerms(setup: SessionSetup): string[] {
  const text = `${setup.topic} ${setup.audience} ${setup.goal}`;
  return [...new Set(text.match(/\b[A-Z][A-Za-z]{2,}(?:\s[A-Z][A-Za-z]{2,})*\b|\b[A-Z]{2,6}\b/g) ?? [])];
}

async function mustGet(id: string): Promise<SessionRecord> {
  const s = await getSession(id);
  if (!s) throw new Error("This session no longer exists.");
  return s;
}

export function stripScript(setup: SessionSetup): Omit<SessionSetup, "script"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { script, ...rest } = setup;
  return rest;
}

/** Step 2 → 3: transcribe the main speech and compute speech + voice metrics. Idempotent. */
export async function processMainSpeech(id: string, onStep?: (s: string) => void): Promise<SessionRecord> {
  let s = await mustGet(id);
  if (!s.recording) throw new Error("There's no recording for this session yet.");
  if (!s.transcript) {
    onStep?.("Transcribing your speech…");
    const media = (await getMedia(id, "main-audio")) ?? (await getMedia(id, "main-video"));
    if (!media) throw new Error("The recording is missing from this device.");
    const transcript = await transcribe(media.blob, { kind: "speech", durationSec: s.recording.durationSec, terms: topicTerms(s.setup) });
    const metrics = computeSpeechMetrics(transcript, s.recording.durationSec, s.setup.durationSec);
    await updateSession(id, { transcript, metrics, status: s.status === "recorded" ? "transcribed" : s.status });
    s = await mustGet(id);
  }
  if (!s.voice) {
    onStep?.("Analysing your voice…");
    const media = (await getMedia(id, "main-audio")) ?? (await getMedia(id, "main-video"));
    if (media) {
      await updateSession(id, { voice: await analyseVoice(media.blob) });
      s = await mustGet(id);
    }
  }
  return s;
}

/** Transcribes any recorded answers that haven't been transcribed yet. */
export async function processAnswers(id: string): Promise<SessionRecord> {
  const s = await mustGet(id);
  if (!s.qa) return s;
  const answers = await Promise.all(
    s.qa.answers.map(async (a): Promise<QAAnswer> => {
      if (a.skipped || a.transcript) return a;
      const media = (await getMedia(id, `answer-audio-${a.questionId}`)) ?? (await getMedia(id, `answer-video-${a.questionId}`));
      if (!media) return { ...a, skipped: true };
      try {
        const transcript = await transcribe(media.blob, { kind: "answer", durationSec: a.durationSec ?? 30, terms: topicTerms(s.setup) });
        return { ...a, transcript, metrics: computeSpeechMetrics(transcript, a.durationSec ?? 30, 90) };
      } catch (err) {
        // "No speech" answers count as skipped; anything else should surface for a retry.
        if (err instanceof Error && /couldn't hear any speech/.test(err.message)) return { ...a, skipped: true };
        throw err;
      }
    }),
  );
  await updateSession(id, { qa: { ...s.qa, answers } });
  return mustGet(id);
}

export async function loadFrames(id: string): Promise<Frame[]> {
  const rec = await getMedia(id, "frames");
  if (!rec) return [];
  try {
    return JSON.parse(await rec.blob.text()) as Frame[];
  } catch {
    return [];
  }
}

/** Step 5: run the evaluator and the per-answer evaluations in parallel, then save the report. */
export async function generateReport(id: string, onStep?: (s: string) => void): Promise<SessionRecord> {
  let s = await processMainSpeech(id, onStep);
  if (s.qa?.answers.some((a) => !a.skipped && !a.transcript)) {
    onStep?.("Transcribing your answers…");
    s = await processAnswers(id);
  }
  if (!s.transcript || !s.metrics || !s.recording) throw new Error("The speech hasn't been transcribed yet.");
  onStep?.("Writing your feedback…");

  const qa = s.qa ?? null;
  const payloads: AnswerPayload[] | null = qa
    ? qa.answers.map((a) => ({
        question: qa.questions.find((q) => q.id === a.questionId)!,
        skipped: a.skipped,
        words: a.transcript?.words ?? [],
        metrics: a.metrics,
        vision: a.vision,
      })).filter((p) => p.question)
    : null;
  const setup = stripScript(s.setup);

  const [main, ...answerEvals] = await Promise.all([
    evaluateSpeech({
      setup: s.setup,
      recording: s.recording,
      words: s.transcript.words,
      metrics: s.metrics,
      voice: s.voice,
      vision: s.vision,
      frames: await loadFrames(id),
      answers: payloads,
    }),
    ...(payloads ?? []).map((p) => (p.skipped ? Promise.resolve(null) : evaluateAnswer({ setup, answer: p }).catch(() => null))),
  ]);

  const report: Report = main.report;
  const update: Partial<SessionRecord> = { report, status: "reported" };
  if (qa && payloads) {
    update.qa = {
      ...qa,
      answers: qa.answers.map((a) => {
        const i = payloads.findIndex((p) => p.question.id === a.questionId);
        const ev = i >= 0 ? answerEvals[i] : null;
        return ev ? { ...a, evaluation: ev.evaluation } : a;
      }),
    };
  }
  await updateSession(id, update);
  return mustGet(id);
}
