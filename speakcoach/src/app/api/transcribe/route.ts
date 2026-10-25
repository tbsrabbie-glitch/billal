import { NextResponse } from "next/server";
import { transcribeWithDeepgram } from "@/lib/server/deepgram";
import { UserFacingError, errorResponse, isMock } from "@/lib/server/errors";
import { mockTranscript } from "@/lib/server/mock";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => {
      throw new UserFacingError("The audio upload was incomplete or too large. Press Retry.", 400);
    });
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw new UserFacingError("No audio was received. Try recording again.", 400);
    const terms = String(form.get("terms") ?? "")
      .split("|")
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && t.length < 40)
      .slice(0, 20);

    const transcript = isMock()
      ? mockTranscript(Number(form.get("durationSec")) || 30, form.get("kind") === "answer" ? "answer" : "speech")
      : await transcribeWithDeepgram(audio, terms);

    if (transcript.words.length === 0) {
      throw new UserFacingError(
        "We couldn't hear any speech in this recording. Check that the right microphone is selected and not muted, then record again.",
        422,
      );
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    return errorResponse(err);
  }
}
