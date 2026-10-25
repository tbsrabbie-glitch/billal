export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good" ? "text-green-700 dark:text-green-400" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : tone === "bad" ? "text-red-700 dark:text-red-400" : "";
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <dt className="text-xs opacity-60">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold tabular-nums ${toneClass}`}>{value}</dd>
      {hint && <dd className="text-xs opacity-60">{hint}</dd>}
    </div>
  );
}
