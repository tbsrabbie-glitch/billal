import fillerConfig from "../../../prompts/filler-words.json";
import type { SpeechMetrics, Transcript, Word } from "../types";

const ALWAYS = new Set(fillerConfig.always);
const PHRASES = fillerConfig.phrases.map((p) => p.split(" "));
const HEDGES = fillerConfig.hedges.map((p) => p.split(" "));
const CONTEXTUAL = new Set(fillerConfig.contextual);

const LONG_PAUSE_SEC = 2;
const RUSHED_WPM = 175;
const RUSH_WINDOW_SEC = 15;
const UNCLEAR_CONF = 0.55;

/** Words before "like" that make it a verb/preposition rather than a filler. */
const LIKE_OK_BEFORE = new Set([
  "would", "i", "you", "we", "they", "he", "she", "it", "looks", "look", "looked", "feel", "feels", "felt",
  "seem", "seems", "sounds", "sound", "something", "anything", "nothing", "just", "much", "more", "less",
  "exactly", "things", "people", "companies", "clients", "most", "don't", "didn't", "doesn't", "really",
]);

function endsSentence(w: Word | undefined): boolean {
  return !w || /[.?!]$/.test(w.w);
}

function hasComma(w: Word | undefined): boolean {
  return !!w && /,$/.test(w.w);
}

function gapBefore(words: Word[], i: number): number {
  return i === 0 ? Infinity : words[i].start - words[i - 1].end;
}

function gapAfter(words: Word[], i: number): number {
  return i === words.length - 1 ? Infinity : words[i + 1].start - words[i].end;
}

/** Whether a context-dependent word is being used as a filler here. */
function isContextualFiller(words: Word[], i: number): boolean {
  const word = words[i].raw;
  const prev = words[i - 1];
  const pausedBefore = gapBefore(words, i) > 0.35 || hasComma(prev) || endsSentence(prev);
  const pausedAfter = gapAfter(words, i) > 0.35 || hasComma(words[i]);
  switch (word) {
    case "like":
      if (prev && LIKE_OK_BEFORE.has(prev.raw)) return false;
      return pausedBefore || pausedAfter;
    case "so":
      // "So, ..." or "so um" at the start of a sentence; not "so that" / "so much".
      return (endsSentence(prev) || gapBefore(words, i) > 0.6) && (hasComma(words[i]) || ALWAYS.has(words[i + 1]?.raw ?? ""));
    case "right":
    case "okay":
    case "ok":
      // Tag questions ("..., right?") and standalone "Okay." used to fill.
      return /\?$/.test(words[i].w) || (endsSentence(prev) && endsSentence(words[i]) && i > 0);
    default:
      return false;
  }
}

function matchPhrase(words: Word[], i: number, phrase: string[]): boolean {
  for (let k = 0; k < phrase.length; k++) {
    if (words[i + k]?.raw !== phrase[k]) return false;
  }
  return true;
}

export function findFillers(words: Word[]): { word: string; t: number }[] {
  const out: { word: string; t: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].raw;
    const phrase = PHRASES.find((p) => matchPhrase(words, i, p));
    if (phrase) {
      out.push({ word: phrase.join(" "), t: words[i].start });
      i += phrase.length - 1;
    } else if (ALWAYS.has(raw) || (CONTEXTUAL.has(raw) && isContextualFiller(words, i))) {
      out.push({ word: raw, t: words[i].start });
    }
  }
  return out;
}

export function findHedges(words: Word[]): { phrase: string; t: number }[] {
  const out: { phrase: string; t: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    // Longest match first so "i think" doesn't also count "think".
    const hit = HEDGES.filter((h) => matchPhrase(words, i, h)).sort((a, b) => b.length - a.length)[0];
    if (hit) {
      out.push({ phrase: hit.join(" "), t: words[i].start });
      i += hit.length - 1;
    }
  }
  return out;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function computeSpeechMetrics(transcript: Transcript, durationSec: number, timeAllowedSec: number): SpeechMetrics {
  const words = transcript.words;
  const fillers = findFillers(words);
  const hedges = findHedges(words);
  const minutes = Math.max(durationSec, 1) / 60;

  // Pace counts every spoken word over the time actually speaking.
  const first = words[0]?.start ?? 0;
  const last = words[words.length - 1]?.end ?? 0;
  const speakingMin = Math.max(last - first, 1) / 60;
  const wpmOverall = words.length ? round(words.length / speakingMin) : 0;

  const wpmSegments: SpeechMetrics["wpmSegments"] = [];
  for (let start = 0; start < durationSec; start += 30) {
    const end = Math.min(start + 30, durationSec);
    if (end - start < 8 && wpmSegments.length > 0) break; // too short to be meaningful
    const n = words.filter((w) => w.start >= start && w.start < end).length;
    wpmSegments.push({ start, end: round(end, 1), wpm: round(n / ((end - start) / 60)) });
  }

  const longPauses: SpeechMetrics["longPauses"] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > LONG_PAUSE_SEC) longPauses.push({ start: round(words[i - 1].end, 1), end: round(words[i].start, 1), dur: round(gap, 1) });
  }

  // Sliding window; merge overlapping fast windows into sections.
  const rushed: SpeechMetrics["rushedSections"] = [];
  for (let s = 0; s + RUSH_WINDOW_SEC <= Math.max(durationSec, RUSH_WINDOW_SEC); s += 5) {
    const inWin = words.filter((w) => w.start >= s && w.start < s + RUSH_WINDOW_SEC);
    if (inWin.length < 5) continue;
    const span = Math.max(inWin[inWin.length - 1].end - inWin[0].start, 5);
    const wpm = inWin.length / (span / 60);
    if (wpm < RUSHED_WPM) continue;
    const prev = rushed[rushed.length - 1];
    if (prev && s <= prev.end) {
      prev.end = round(inWin[inWin.length - 1].end, 1);
      prev.wpm = Math.max(prev.wpm, round(wpm));
    } else {
      rushed.push({ start: round(inWin[0].start, 1), end: round(inWin[inWin.length - 1].end, 1), wpm: round(wpm) });
    }
  }

  const unclearWords = words
    .filter((w) => w.conf < UNCLEAR_CONF && w.raw.length > 2 && !ALWAYS.has(w.raw))
    .map((w) => ({ word: w.w, t: round(w.start, 1), conf: round(w.conf, 2) }));

  return {
    durationSec: round(durationSec, 1),
    timeAllowedSec,
    wordCount: words.length,
    wpmOverall,
    wpmSegments,
    fillers: { count: fillers.length, perMinute: round(fillers.length / minutes, 1), items: fillers.map((f) => ({ ...f, t: round(f.t, 1) })) },
    hedges: { count: hedges.length, items: hedges.map((h) => ({ ...h, t: round(h.t, 1) })) },
    longPauses,
    rushedSections: rushed,
    unclearWords,
  };
}

export function paceLabel(wpm: number): string {
  if (wpm === 0) return "—";
  if (wpm < 110) return "slow";
  if (wpm < 130) return "a little slow";
  if (wpm <= 165) return "good";
  if (wpm <= 180) return "a little fast";
  return "fast";
}
