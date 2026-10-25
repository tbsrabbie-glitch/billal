"use client";

import { useState } from "react";
import {
  AUDIENCE_SUGGESTIONS,
  SPEECH_TYPES,
  type DurationSec,
  type QuestionerMode,
  type SessionSetup,
  type SpeechType,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ScriptUpload } from "./ScriptUpload";

const fieldClass =
  "w-full rounded-xl border border-black/15 bg-transparent px-3 py-2.5 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-foreground/30";

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
    </label>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            value === o.value
              ? "border-foreground bg-foreground text-background"
              : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          }`}
        >
          <span className="block font-medium">{o.label}</span>
          {o.hint && <span className="block text-xs opacity-70">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function SetupForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial?: SessionSetup;
  submitting: boolean;
  onSubmit: (setup: SessionSetup) => void;
}) {
  const [speechType, setSpeechType] = useState<SpeechType>(initial?.speechType ?? "client");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [durationSec, setDurationSec] = useState<DurationSec>(initial?.durationSec ?? 150);
  const [script, setScript] = useState(initial?.script ?? "");
  const [scriptFileName, setScriptFileName] = useState(initial?.scriptFileName);
  const [questionerMode, setQuestionerMode] = useState<QuestionerMode>(initial?.questionerMode ?? "friendly");
  const [showErrors, setShowErrors] = useState(false);

  const missing = !topic.trim() || !audience.trim() || !goal.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      speechType,
      topic: topic.trim(),
      audience: audience.trim(),
      goal: goal.trim(),
      durationSec,
      script: script.trim() || undefined,
      scriptFileName: script.trim() ? scriptFileName : undefined,
      questionerMode,
    });
  }

  const err = (v: string) => showErrors && !v.trim();

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <Label>Speech type</Label>
        <Choice name="Speech type" options={SPEECH_TYPES} value={speechType} onChange={setSpeechType} />
      </div>

      <div>
        <Label htmlFor="topic">Topic / title</Label>
        <input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Why restructure before the year-end"
          className={`${fieldClass} ${err(topic) ? "border-red-500" : ""}`}
        />
      </div>

      <div>
        <Label htmlFor="audience">Audience</Label>
        <input
          id="audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={AUDIENCE_SUGGESTIONS[speechType]}
          className={`${fieldClass} ${err(audience) ? "border-red-500" : ""}`}
        />
      </div>

      <div>
        <Label htmlFor="goal">Goal of the speech (one line)</Label>
        <input
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Convince them to restructure before year-end"
          className={`${fieldClass} ${err(goal) ? "border-red-500" : ""}`}
        />
      </div>

      {showErrors && missing && <p className="text-sm text-red-600">Please fill in topic, audience and goal.</p>}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label>Duration</Label>
          <Choice
            name="Duration"
            options={[
              { value: 150 as DurationSec, label: "2.5 min" },
              { value: 180 as DurationSec, label: "3 min" },
            ]}
            value={durationSec}
            onChange={setDurationSec}
          />
        </div>
        <div>
          <Label>Questioner mode</Label>
          <Choice
            name="Questioner mode"
            options={[
              { value: "friendly" as QuestionerMode, label: "Friendly", hint: "Clarifying questions" },
              { value: "tough" as QuestionerMode, label: "Tough panel", hint: "Challenges & objections" },
            ]}
            value={questionerMode}
            onChange={setQuestionerMode}
          />
        </div>
      </div>

      <div>
        <Label>Prepared script or notes (optional)</Label>
        <ScriptUpload
          value={script}
          fileName={scriptFileName}
          onChange={(text, name) => {
            setScript(text);
            setScriptFileName(name);
          }}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full py-3 text-base">
        {submitting ? "Saving…" : "Continue to camera"}
      </Button>
    </form>
  );
}
