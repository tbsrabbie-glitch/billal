import { NextResponse } from "next/server";
import type { QuestionsRequest, QuestionsResponse } from "@/lib/api-types";
import { questionsContent } from "@/lib/server/analysis";
import { callClaudeJSON } from "@/lib/server/claude";
import { UserFacingError, errorResponse, isMock } from "@/lib/server/errors";
import { mockQuestions } from "@/lib/server/mock";
import { modeInstructions, modeLabel, renderPrompt, rubricFor } from "@/lib/server/prompts";
import { QuestionsSchema } from "@/lib/server/schemas";
import type { Question } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuestionsRequest;
    if (!body?.setup || !Array.isArray(body.words)) throw new UserFacingError("Bad request.", 400);
    if (isMock()) return NextResponse.json({ questions: mockQuestions(body.words) } satisfies QuestionsResponse);

    const rubric = rubricFor(body.setup.speechType);
    const system = await renderPrompt("question-generator", {
      speech_type_label: rubric.label,
      topic: body.setup.topic,
      audience: body.setup.audience,
      goal: body.setup.goal,
      mode_label: modeLabel(body.setup.questionerMode),
      mode_instructions: modeInstructions(body.setup.questionerMode),
      question_count: body.setup.questionerMode === "tough" ? 5 : 4,
      type_focus: `${rubric.focus}\n${rubric.qa_focus}`,
    });
    const data = await callClaudeJSON({
      system,
      content: questionsContent(body.setup, body.words),
      schema: QuestionsSchema,
      effort: "low",
      maxTokens: 4000,
    });
    const questions: Question[] = data.questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
    return NextResponse.json({ questions } satisfies QuestionsResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
