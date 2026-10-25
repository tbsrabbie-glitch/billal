import { NextResponse } from "next/server";
import type { EvaluateRequest, EvaluateResponse } from "@/lib/api-types";
import { evaluateContent, overallScore, verifyReport } from "@/lib/server/analysis";
import { MODEL, callClaudeJSON } from "@/lib/server/claude";
import { UserFacingError, errorResponse, isMock } from "@/lib/server/errors";
import { mockReport } from "@/lib/server/mock";
import { renderPrompt, rubricFor } from "@/lib/server/prompts";
import { ReportSchema } from "@/lib/server/schemas";
import { fmtClock } from "@/lib/transcript";
import type { LlmReport, Report } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const req = (await request.json()) as EvaluateRequest;
    if (!req?.setup || !Array.isArray(req.words) || !req.metrics) throw new UserFacingError("Bad request.", 400);

    let raw: LlmReport;
    if (isMock()) {
      raw = mockReport(req);
    } else {
      const rubric = rubricFor(req.setup.speechType);
      const system = await renderPrompt("speech-evaluator", {
        speech_type_label: rubric.label,
        topic: req.setup.topic,
        audience: req.setup.audience,
        goal: req.setup.goal,
        time_allowed: fmtClock(req.metrics.timeAllowedSec),
        time_used: fmtClock(req.recording.durationSec),
        type_focus: rubric.focus,
        type_specific: rubric.type_specific,
        qa_focus: rubric.qa_focus,
        script_instruction: req.setup.script
          ? "compare the prepared script with what was said: `covered` (planned points that were said, with the quote), `missed` (planned points not said), `added` (notable points said that weren't planned, with the quote)."
          : "null (no script was given).",
        notes_instruction: req.setup.script
          ? "one or two sentences on how using the on-screen notes affected eye contact and flow, citing the notes timings and look-away ranges."
          : "null.",
      });
      // The semantic check runs inside the call so a failure triggers exactly one corrective retry.
      raw = await callClaudeJSON({
        system,
        content: evaluateContent(req),
        schema: ReportSchema,
        effort: "low",
        maxTokens: 16000,
        check: (data) => verifyReport(data as LlmReport, req).problems,
      });
    }

    const { report: verified, dropped } = verifyReport(raw, req);
    const { overall, weights } = overallScore(verified, req.setup.speechType);
    const report: Report = {
      ...verified,
      overallScore: overall,
      weights,
      generatedAt: Date.now(),
      model: isMock() ? "mock" : MODEL,
      generationMs: Date.now() - started,
      droppedUnverified: dropped,
    };
    return NextResponse.json({ report } satisfies EvaluateResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
