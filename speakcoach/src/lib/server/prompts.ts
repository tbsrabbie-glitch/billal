import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import rubrics from "../../../prompts/rubrics.json";
import type { QuestionerMode, RubricKey, SpeechType } from "../types";

export interface Rubric {
  label: string;
  weights: Record<RubricKey, number>;
  type_specific: string;
  focus: string;
  qa_focus: string;
}

export function rubricFor(type: SpeechType): Rubric {
  return (rubrics as unknown as Record<SpeechType, Rubric>)[type] ?? (rubrics as unknown as Record<SpeechType, Rubric>).general;
}

const cache = new Map<string, string>();

/** Loads /prompts/<name>.md and fills {{placeholders}}. Re-read on every call in development. */
export async function renderPrompt(name: string, vars: Record<string, string | number>): Promise<string> {
  let tpl = cache.get(name);
  if (!tpl) {
    tpl = await readFile(path.join(process.cwd(), "prompts", `${name}.md`), "utf8");
    if (process.env.NODE_ENV === "production") cache.set(name, tpl);
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt ${name} uses {{${key}}} but no value was given`);
    return String(vars[key]);
  });
}

export function modeLabel(mode: QuestionerMode): string {
  return mode === "tough" ? "Tough panel" : "Friendly";
}

export function modeInstructions(mode: QuestionerMode): string {
  return mode === "tough"
    ? "You are a sceptical, senior audience (think a demanding CFO, a strict examiner, or a tough interview panel). Challenge weak or unsupported claims, ask for numbers and evidence, point out gaps and risks, and raise the objections a sceptical client or examiner really would. Stay professional — tough, not rude."
    : "You are an interested, supportive audience. Ask clarifying and 'tell me more' questions that give the speaker a chance to expand on their best points and explain anything that was unclear. Still be specific — no softball questions that could apply to any speech.";
}
