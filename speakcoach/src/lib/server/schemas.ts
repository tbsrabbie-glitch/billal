import * as z from "zod";

const score = z.number().int().min(1).max(10);
const evidence = z.object({ t: z.number(), quote: z.string() });

const rubric = <S extends z.ZodRawShape>(sub: S) =>
  z.object({
    score,
    reason: z.string(),
    sub: z.object(sub),
    evidence: z.array(evidence),
  });

export const contentSub = {
  opening_hook: score,
  logical_flow: score,
  key_message: score,
  evidence_examples: score,
  close: score,
  audience_fit: score,
  type_specific: score,
};
export const deliverySub = {
  pace: score,
  fillers: score,
  pauses: score,
  clarity: score,
  vocal_variety: score,
  confident_phrasing: score,
};
export const bodySub = {
  eye_contact: score,
  posture: score,
  head_movement: score,
  gestures: score,
  expression: score,
  fidgeting: score,
};
export const qaSub = {
  directness: score,
  structure: score,
  composure: score,
  answered_the_question: score,
};

export const ReportSchema = z.object({
  rubric: z.object({
    content_structure: rubric(contentSub),
    delivery_voice: rubric(deliverySub),
    body_language: rubric(bodySub),
    qa_handling: rubric(qaSub).nullable(),
  }),
  accuracy_flags: z.array(
    z.object({ t: z.number(), quote: z.string(), concern: z.string(), confidence: z.enum(["low", "medium"]) }),
  ),
  script_coverage: z
    .object({
      covered: z.array(z.object({ point: z.string(), t: z.number(), quote: z.string() })),
      missed: z.array(z.object({ point: z.string() })),
      added: z.array(z.object({ point: z.string(), t: z.number(), quote: z.string() })),
    })
    .nullable(),
  moments: z
    .array(
      z.object({
        t: z.number(),
        polarity: z.enum(["positive", "negative"]),
        category: z.enum(["content", "voice", "body"]),
        label: z.string(),
        quote: z.string().nullable(),
      }),
    )
    .min(5)
    .max(8),
  strengths: z.array(z.object({ title: z.string(), detail: z.string(), t: z.number(), quote: z.string() })).length(3),
  fixes: z
    .array(z.object({ title: z.string(), why: z.string(), original: evidence, say_instead: z.string() }))
    .length(3),
  drills: z
    .array(z.object({ name: z.string(), targets: z.string(), instructions: z.string(), minutes: z.number().int() }))
    .min(2)
    .max(3),
  rewrite: z.object({ opening: z.string(), closing: z.string() }),
  notes_usage_comment: z.string().nullable(),
});

export const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        reason: z.string(),
        targets_t: z.number().nullable(),
        kind: z.enum(["clarify", "extend", "evidence", "objection", "gap"]),
      }),
    )
    .min(3)
    .max(5),
});

export const AnswerEvalSchema = z.object({
  score,
  sub: z.object(qaSub),
  feedback: z.string(),
  quote: evidence.nullable(),
  better_answer_outline: z.array(z.string()).min(2).max(5),
});
