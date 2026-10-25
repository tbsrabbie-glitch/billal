"use client";

import { useEffect, useRef, useState } from "react";

const SPEEDS = [
  { label: "Off", pxPerSec: 0 },
  { label: "Slow", pxPerSec: 14 },
  { label: "Med", pxPerSec: 24 },
  { label: "Fast", pxPerSec: 36 },
];

/**
 * Teleprompter-style notes shown over the top of the camera preview, close to the lens,
 * so reading them costs less eye contact.
 */
export function NotesPanel({ text, scrolling }: { text: string; scrolling: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState(0);
  const [fontPx, setFontPx] = useState(20);

  useEffect(() => {
    const pxPerSec = SPEEDS[speed].pxPerSec;
    if (!scrolling || pxPerSec === 0) return;
    let last = performance.now();
    let carry = 0;
    let raf = 0;
    const step = (now: number) => {
      const box = boxRef.current;
      if (box) {
        carry += ((now - last) / 1000) * pxPerSec;
        const whole = Math.floor(carry);
        if (whole > 0) {
          box.scrollTop += whole;
          carry -= whole;
        }
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, scrolling]);

  return (
    <div className="absolute inset-x-2 top-2 z-10 rounded-xl bg-black/70 text-white backdrop-blur-sm">
      <div
        ref={boxRef}
        className="max-h-[38vh] overflow-y-auto whitespace-pre-wrap px-4 py-3 leading-snug"
        style={{ fontSize: fontPx }}
      >
        {text}
      </div>
      <div className="flex items-center gap-1 border-t border-white/15 px-2 py-1.5 text-xs">
        <span className="mr-1 opacity-70">Scroll</span>
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSpeed(i)}
            className={`rounded px-2 py-1 ${speed === i ? "bg-white text-black" : "hover:bg-white/15"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" aria-label="Smaller text" onClick={() => setFontPx((f) => Math.max(14, f - 2))} className="rounded px-2 py-1 hover:bg-white/15">
          A−
        </button>
        <button type="button" aria-label="Larger text" onClick={() => setFontPx((f) => Math.min(36, f + 2))} className="rounded px-2 py-1 hover:bg-white/15">
          A+
        </button>
      </div>
    </div>
  );
}
