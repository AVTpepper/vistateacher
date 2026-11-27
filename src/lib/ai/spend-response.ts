import "server-only";
import { NextResponse } from "next/server";
import { AiSpendError } from "@/lib/ai/spend";
export function aiSpendErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AiSpendError)) return null;
  const responses = {
    "ai-budget-exhausted": [
      "AI generation is paused because the pilot budget is used. Your drafts and saved work are available to edit and export.",
      503,
    ],
    "ai-unavailable": [
      "AI generation is temporarily unavailable. Your drafts and saved work are safe.",
      503,
    ],
    "ai-dispatch-conflict": [
      "This generation request is no longer active. Check its saved status before retrying.",
      409,
    ],
    "ai-accounting-pending": [
      "This AI request could not be completed. Check the saved request status before retrying. Your drafts and saved work are safe.",
      503,
    ],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json(
    { error: message, code: error.code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
