"use client";

import type {
  ConfigResponse,
  EvaluateAnswerRequest,
  EvaluateAnswerResponse,
  EvaluateRequest,
  EvaluateResponse,
  QuestionsRequest,
  QuestionsResponse,
} from "./api-types";
import type { Transcript } from "./types";

/** Vercel rejects request bodies over ~4.5 MB. */
export const MAX_UPLOAD_BYTES = 4_300_000;

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Network error — check your internet connection and press Retry. Your recording is saved.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) {
    if (res.status === 401) throw new Error("Your sign-in expired. Reload the page and enter the passcode.");
    if (res.status === 413) throw new Error("The upload was too large for the server.");
    throw new Error(body?.error ?? `Server error (${res.status}). Press Retry.`);
  }
  return body;
}

export async function transcribe(media: Blob, opts: { kind: "speech" | "answer"; durationSec: number; terms?: string[] }): Promise<Transcript> {
  if (media.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      "This browser couldn't record the small audio-only track, and the video is too large to upload for transcription. Try Chrome or Safari, or a shorter recording.",
    );
  }
  const form = new FormData();
  const ext = media.type.includes("mp4") ? "mp4" : media.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", media, `audio.${ext}`);
  form.append("kind", opts.kind);
  form.append("durationSec", String(opts.durationSec));
  if (opts.terms?.length) form.append("terms", opts.terms.join("|"));
  const { transcript } = await call<{ transcript: Transcript }>("/api/transcribe", { method: "POST", body: form });
  return transcript;
}

function postJSON<T>(url: string, body: unknown): Promise<T> {
  return call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const getQuestions = (req: QuestionsRequest) => postJSON<QuestionsResponse>("/api/questions", req);
export const evaluateSpeech = (req: EvaluateRequest) => postJSON<EvaluateResponse>("/api/evaluate", req);
export const evaluateAnswer = (req: EvaluateAnswerRequest) => postJSON<EvaluateAnswerResponse>("/api/evaluate-answer", req);
export const getConfig = () => call<ConfigResponse>("/api/config", { method: "GET" });
