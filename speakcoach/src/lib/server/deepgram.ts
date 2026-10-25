import "server-only";
import vocabulary from "../../../prompts/vocabulary.json";
import { normalizeToken } from "../transcript";
import type { Transcript, Word } from "../types";
import { UserFacingError } from "./errors";

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  confidence: number;
}

/**
 * Pre-recorded transcription with word timestamps. `filler_words=true` keeps "um"/"uh" in the
 * output (most speech-to-text engines silently delete them), and keyterm prompting helps with
 * tax vocabulary spoken with a Sri Lankan accent.
 */
export async function transcribeWithDeepgram(audio: Blob, extraTerms: string[] = []): Promise<Transcript> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new UserFacingError("DEEPGRAM_API_KEY isn't set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.", 503);

  const params = new URLSearchParams({
    model: "nova-3",
    language: "en",
    smart_format: "true",
    punctuate: "true",
    filler_words: "true",
  });
  const terms = [...new Set([...vocabulary.keyterms, ...extraTerms])].slice(0, 90);
  for (const t of terms) params.append("keyterm", t);

  let res: Response;
  try {
    res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": audio.type || "audio/webm" },
      body: audio,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new UserFacingError("Couldn't reach the transcription service. Check your connection and press Retry.", 502);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Deepgram error", res.status, detail.slice(0, 500));
    if (res.status === 401 || res.status === 403) throw new UserFacingError("The Deepgram API key was rejected. Check DEEPGRAM_API_KEY.", 502);
    if (res.status === 402) throw new UserFacingError("Your Deepgram account is out of credit.", 502);
    if (res.status === 429) throw new UserFacingError("Transcription is rate-limited right now. Wait a few seconds and press Retry.", 503);
    if (res.status === 400) throw new UserFacingError("The audio couldn't be decoded. Try recording again.", 422);
    throw new UserFacingError(`Transcription failed (Deepgram ${res.status}). Press Retry.`, 502);
  }

  const data = (await res.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string; words?: DeepgramWord[] }[] }[] };
  };
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const words: Word[] = (alt?.words ?? []).map((w) => ({
    w: w.punctuated_word ?? w.word,
    raw: normalizeToken(w.word),
    start: w.start,
    end: w.end,
    conf: w.confidence,
  }));
  const avgConfidence = words.length ? words.reduce((a, w) => a + w.conf, 0) / words.length : 0;
  return { text: alt?.transcript ?? words.map((w) => w.w).join(" "), words, avgConfidence, provider: "deepgram-nova-3" };
}
