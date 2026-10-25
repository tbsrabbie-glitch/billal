"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtClock } from "@/lib/transcript";
import type { SpeechMetrics, VisionMetrics } from "@/lib/types";

const AXIS = { fontSize: 11, fill: "currentColor", opacity: 0.6 };

export function WpmChart({ metrics, onSeek }: { metrics: SpeechMetrics; onSeek?: (t: number) => void }) {
  const data = metrics.wpmSegments.map((s) => ({ label: `${fmtClock(s.start)}–${fmtClock(s.end)}`, start: s.start, wpm: s.wpm }));
  return (
    <div className="w-full">
      <div className="h-48">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
          <ReferenceArea y1={130} y2={160} fill="#16a34a" fillOpacity={0.08} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} />
          <YAxis tick={AXIS} tickLine={false} domain={[0, (max: number) => Math.max(200, Math.ceil(max / 20) * 20)]} />
          <Tooltip formatter={(v) => [`${v} wpm`, "Pace"]} contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="wpm" radius={[4, 4, 0, 0]} onClick={(d) => onSeek?.((d as unknown as { start: number }).start)} cursor="pointer">
            {data.map((d) => (
              <Cell key={d.start} fill={d.wpm > 175 ? "#d97706" : d.wpm < 110 ? "#2563eb" : "#16a34a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-xs opacity-60">Words per minute per 30 s · green band = 130–160 comfortable range · tap a bar to play</p>
    </div>
  );
}

export function EyeContactChart({ vision }: { vision: VisionMetrics }) {
  const data = vision.eyeContactSegments.map((s) => ({ label: `${fmtClock(s.start)}–${fmtClock(s.end)}`, pct: s.pct }));
  if (data.length < 2) return null;
  return (
    <div className="w-full">
      <div className="h-40">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} />
          <YAxis tick={AXIS} tickLine={false} domain={[0, 100]} unit="%" />
          <Tooltip formatter={(v) => [`${v}%`, "Eye contact"]} contentStyle={{ fontSize: 12 }} />
          <Line dataKey="pct" stroke="#2563eb" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-xs opacity-60">Eye contact with the camera per 30 s</p>
    </div>
  );
}
