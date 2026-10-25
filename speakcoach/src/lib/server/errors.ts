import { NextResponse } from "next/server";

/** An error whose message is safe and useful to show the user. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UserFacingError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json(
    { error: "Something went wrong on the server. Your recording is safe — press Retry." },
    { status: 500 },
  );
}

export function isMock(): boolean {
  return process.env.MOCK_AI === "1";
}
