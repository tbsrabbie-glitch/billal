import { NextResponse } from "next/server";
import type { EvaluateAnswerRequest, EvaluateAnswerResponse } from "@/lib/api-types";
import { answerContent, verifyAnswer } from "@/lib/server/analysis";
import { callClaudeJSON } from "@/lib/server/claude";
import { UserFacingError, errorResponse, isMock } from "@/lib/server/errors";
import { mockAnswerEval } from "@/lib/server/mock";
import { modeLabel, renderPrompt, rubricFor } from "@/lib/server/prompts";
import { AnswerEvalSchema } from "@/lib/server/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { setup, answer } = (await request.json()) as EvaluateAnswerRequest;
    if (!setup || !answer?.question || answer.skipped) throw new UserFacingError("Bad request.", 400);

    let evaluation = isMock()
      ? mockAnswerEval(answer)
      : await callClaudeJSON({
          system: await renderPrompt("answer-evaluator", {
            speech_type_label: rubricFor(setup.speechType).label,
            audience: setup.audience,
            mode_label: modeLabel(setup.questionerMode),
            goal: setup.goal,
            qa_focus: rubricFor(setup.speechType).qa_focus,
          }),
          content: answerContent(setup, answer),
          schema: AnswerEvalSchema,
          effort: "low",
          maxTokens: 4000,
        });
    evaluation = verifyAnswer(evaluation, answer.words);
    return NextResponse.json({ evaluation } satisfies EvaluateAnswerResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
