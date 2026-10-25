"use client";

import { useMemo } from "react";
import { findFillers, findHedges } from "@/lib/metrics/speech";
import { fmtClock } from "@/lib/transcript";
import type { Word } from "@/lib/types";

/** Transcript with fillers and hedges highlighted; tap a line to jump the video there. */
export function TranscriptView({ words, onSeek, maxHeight = "24rem" }: { words: Word[]; onSeek?: (t: number) => void; maxHeight?: string }) {
  const { marks, lines } = useMemo(() => {
    const marks = new Map<number, "filler" | "hedge">();
    const startIdx = new Map(words.map((w, i) => [w.start, i]));
    for (const f of findFillers(words)) {
      const i = startIdx.get(f.t);
      if (i !== undefined) for (let k = 0; k < f.word.split(" ").length; k++) marks.set(i + k, "filler");
    }
    for (const h of findHedges(words)) {
      const i = startIdx.get(h.t);
      if (i !== undefined) for (let k = 0; k < h.phrase.split(" ").length; k++) if (!marks.has(i + k)) marks.set(i + k, "hedge");
    }
    // Break into lines at sentence ends or long gaps.
    const lines: number[][] = [];
    let cur: number[] = [];
    words.forEach((w, i) => {
      if (cur.length && w.start - words[i - 1].end > 1.2) {
        lines.push(cur);
        cur = [];
      }
      cur.push(i);
      if (/[.?!]$/.test(w.w) && cur.length > 3) {
        lines.push(cur);
        cur = [];
      }
    });
    if (cur.length) lines.push(cur);
    return { marks, lines };
  }, [words]);

  if (!words.length) return <p className="text-sm opacity-60">No speech detected.</p>;

  return (
    <div className="space-y-1.5 overflow-y-auto rounded-xl border border-black/10 p-3 text-sm leading-relaxed dark:border-white/10" style={{ maxHeight }}>
      {lines.map((line) => (
        <p key={line[0]} className="flex gap-2">
          <button
            type="button"
            onClick={() => onSeek?.(words[line[0]].start)}
            className="shrink-0 font-mono text-xs tabular-nums text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            title="Play from here"
          >
            {fmtClock(words[line[0]].start)}
          </button>
          <span>
            {line.map((i) => {
              const m = marks.get(i);
              return (
                <span
                  key={i}
                  className={
                    m === "filler"
                      ? "rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-700 dark:text-amber-50"
                      : m === "hedge"
                        ? "underline decoration-purple-500 decoration-2 underline-offset-2"
                        : words[i].conf < 0.55
                          ? "opacity-60"
                          : undefined
                  }
                >
                  {words[i].w}{" "}
                </span>
              );
            })}
          </span>
        </p>
      ))}
    </div>
  );
}

export function TranscriptLegend() {
  return (
    <p className="text-xs opacity-60">
      <span className="rounded bg-amber-200 px-1 text-amber-950">filler</span>{" "}
      <span className="underline decoration-purple-500 decoration-2">hedge</span> · faded = transcriber unsure · tap a time to play
    </p>
  );
}
