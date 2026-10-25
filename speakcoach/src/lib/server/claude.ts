import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod";
import { UserFacingError } from "./errors";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
type Effort = "low" | "medium" | "high";
const EFFORT = (process.env.CLAUDE_EFFORT as Effort | undefined) || undefined;

// Models that accept the server-side refusal fallback chain ("default" routing).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserFacingError("ANTHROPIC_API_KEY isn't set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.", 503);
  }
  client ??= new Anthropic({ maxRetries: 2, timeout: 110_000 });
  return client;
}

export type UserContent = Anthropic.Beta.BetaContentBlockParam[];

function toUserFacing(err: unknown): never {
  if (err instanceof UserFacingError) throw err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    throw new UserFacingError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", 502);
  }
  if (err instanceof Anthropic.RateLimitError) {
    throw new UserFacingError("Claude is rate-limited right now. Wait a few seconds and press Retry.", 503);
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("Claude bad request", err.message);
    throw new UserFacingError(`Claude rejected the request: ${err.message}`, 502);
  }
  if (err instanceof Anthropic.InternalServerError) {
    throw new UserFacingError("Claude is overloaded right now. Press Retry in a moment.", 503);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    throw new UserFacingError("Couldn't reach Claude. Check your connection and press Retry.", 502);
  }
  throw err;
}

/**
 * Calls Claude with a strict JSON schema. The SDK validates the response against the zod schema;
 * on a validation failure (or a caller-supplied `check` failure) we retry once, telling Claude
 * exactly what was wrong.
 */
export async function callClaudeJSON<S extends z.ZodType>(opts: {
  system: string;
  content: UserContent;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
  /** Extra semantic validation; return a list of problems (empty = OK). */
  check?: (data: z.infer<S>) => string[];
}): Promise<z.infer<S>> {
  const anthropic = getClient();
  let feedback: string | null = null;
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const content: UserContent = feedback
      ? [...opts.content, { type: "text", text: `Your previous answer was rejected: ${feedback}\nFix these problems and answer again.` }]
      : opts.content;
    try {
      const useFallbacks = FALLBACK_MODELS.has(MODEL);
      const response = await anthropic.beta.messages.parse({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        system: opts.system,
        messages: [{ role: "user", content }],
        output_config: { effort: EFFORT ?? opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (response.stop_reason === "refusal") {
        throw new UserFacingError("Claude declined to analyse this session. Try re-recording or rephrasing your topic.", 422);
      }
      if (response.stop_reason === "max_tokens") {
        lastProblem = "the response was cut off";
        feedback = "Your answer was too long and got cut off. Be more concise.";
        continue;
      }
      const data = response.parsed_output;
      if (!data) {
        lastProblem = "no parsable JSON";
        feedback = "The output wasn't valid JSON for the schema.";
        continue;
      }
      const problems = opts.check?.(data) ?? [];
      if (problems.length && attempt === 0) {
        lastProblem = problems.join("; ");
        feedback = problems.join("\n");
        continue;
      }
      return data;
    } catch (err) {
      if (err instanceof Anthropic.APIError || err instanceof UserFacingError) toUserFacing(err);
      // Schema validation failures from the SDK's parser land here.
      lastProblem = err instanceof Error ? err.message : String(err);
      feedback = `The JSON didn't match the required schema: ${lastProblem.slice(0, 600)}`;
    }
  }
  console.error("Claude JSON failed twice:", lastProblem);
  throw new UserFacingError("The AI response didn't come back in the expected format twice in a row. Press Retry.", 502);
}
