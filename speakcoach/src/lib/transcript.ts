import type { Word } from "./types";

export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'%-]+/gu, "")
    .replace(/^'+|'+$/g, "");
}

export function tokenize(s: string): string[] {
  return s.split(/\s+/).map(normalizeToken).filter(Boolean);
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Splits words into sentence-ish lines: "[0:12.4] So today I want to…". */
export function toTimedLines(words: Word[], maxWords = 28): string[] {
  const lines: string[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) lines.push(`[${fmtTime(cur[0].start)}] ${cur.map((w) => w.w).join(" ")}`);
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const gap = i > 0 ? w.start - words[i - 1].end : 0;
    if (cur.length && gap > 1.2) flush();
    cur.push(w);
    if (/[.?!]$/.test(w.w) || cur.length >= maxWords) flush();
  }
  flush();
  return lines;
}

function lcsLength(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Finds where a quoted phrase was said. Tolerates small transcription/punctuation differences
 * (≥80% of the quote's words in order). Returns the start time of the match, or null if the
 * quote isn't really in the transcript.
 */
export function locateQuote(words: Word[], quote: string): number | null {
  const q = tokenize(quote);
  if (q.length === 0 || words.length === 0) return null;
  const toks = words.map((w) => w.raw);
  // Exact match first.
  outer: for (let i = 0; i + q.length <= toks.length; i++) {
    for (let k = 0; k < q.length; k++) if (toks[i + k] !== q[k]) continue outer;
    return words[i].start;
  }
  if (q.length < 3) return null;
  let best = { score: 0, i: -1 };
  const win = Math.ceil(q.length * 1.25);
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== q[0] && toks[i] !== q[1]) continue; // anchor near the start of the quote
    const score = lcsLength(q, toks.slice(i, i + win)) / q.length;
    if (score > best.score) best = { score, i };
  }
  return best.score >= 0.8 ? words[best.i].start : null;
}
