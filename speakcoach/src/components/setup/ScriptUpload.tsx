"use client";

import { useRef, useState } from "react";
import { MAX_SCRIPT_CHARS, extractScriptText } from "@/lib/script-parse";

export function ScriptUpload({
  value,
  fileName,
  onChange,
}: {
  value: string;
  fileName?: string;
  onChange: (text: string, fileName?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await extractScriptText(file), file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {busy ? "Reading file…" : "Upload .txt / .docx / .pdf"}
        </button>
        {fileName && <span className="text-xs opacity-70">From {fileName}</span>}
        {value && (
          <button type="button" onClick={() => onChange("", undefined)} className="text-xs underline opacity-70">
            Clear
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_SCRIPT_CHARS), fileName)}
        rows={6}
        placeholder="…or paste your script / bullet notes here"
        className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
      />
      <p className="text-xs opacity-60">
        Read in your browser — the file isn&apos;t uploaded. You can show these notes while recording.
      </p>
    </div>
  );
}
