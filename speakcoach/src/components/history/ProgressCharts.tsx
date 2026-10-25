"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SessionRecord } from "@/lib/types";

const AXIS = { fontSize: 10, fill: "currentColor", opacity: 0.6 };

interface Series {
  title: string;
  unit: string;
  color: string;
  better: "higher" | "lower" | "range";
  value: (s: SessionRecord) => number | null;
  domain?: [number, number];
}

const SERIES: Series[] = [
  { title: "Overall score", unit: "/10", color: "#111827", better: "higher", value: (s) => s.report?.overallScore ?? null, domain: [0, 10] },
  { title: "Pace (wpm)", unit: " wpm", color: "#16a34a", better: "range", value: (s) => s.metrics?.wpmOverall ?? null },
  { title: "Filler words per minute", unit: "/min", color: "#d97706", better: "lower", value: (s) => s.metrics?.fillers.perMinute ?? null },
  { title: "Eye contact", unit: "%", color: "#2563eb", better: "higher", value: (s) => (s.vision?.analysed ? s.vision.eyeContactPct : null), domain: [0, 100] },
];

function trend(values: number[], better: Series["better"]): string {
  if (values.length < 2) return "";
  const first = values[0];
  const last = values[values.length - 1];
  const diff = Math.round((last - first) * 10) / 10;
  if (diff === 0 || better === "range") return `${diff > 0 ? "+" : ""}${diff} since first`;
  const improved = better === "higher" ? diff > 0 : diff < 0;
  return `${improved ? "▲ improved" : "▼ worse"} ${diff > 0 ? "+" : ""}${diff} since first`;
}

export function ProgressCharts({ sessions }: { sessions: SessionRecord[] }) {
  const ordered = [...sessions].filter((s) => s.report).sort((a, b) => a.createdAt - b.createdAt);
  if (ordered.length < 2) {
    return <p className="text-sm opacity-60">Progress charts appear once you have two or more sessions with reports.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SERIES.map((series) => {
        const data = ordered
          .map((s, i) => ({ n: i + 1, label: new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), v: series.value(s), topic: s.setup.topic }))
          .filter((d) => d.v !== null) as { n: number; label: string; v: number; topic: string }[];
        return (
          <div key={series.title} className="rounded-2xl border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">{series.title}</h3>
              <span className="text-xs opacity-60">{trend(data.map((d) => d.v), series.better)}</span>
            </div>
            <div className="h-36">
              {data.length < 2 ? (
                <p className="pt-10 text-center text-xs opacity-50">Not enough data yet.</p>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} />
                    <YAxis tick={AXIS} tickLine={false} domain={series.domain ?? ["auto", "auto"]} />
                    <Tooltip
                      formatter={(v) => [`${v}${series.unit}`, series.title]}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { topic?: string } | undefined)?.topic ?? ""}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Line dataKey="v" stroke={series.color} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
