import { NextResponse } from "next/server";
import type { ConfigResponse } from "@/lib/api-types";
import { MODEL } from "@/lib/server/claude";
import { isMock } from "@/lib/server/errors";

export async function GET() {
  const mock = isMock();
  return NextResponse.json({
    transcription: mock || !!process.env.DEEPGRAM_API_KEY,
    analysis: mock || !!process.env.ANTHROPIC_API_KEY,
    model: mock ? "mock" : MODEL,
    mock,
  } satisfies ConfigResponse);
}
