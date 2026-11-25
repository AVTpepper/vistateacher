import "server-only";

import { NextResponse } from "next/server";

import { LessonActionError } from "@/lib/lessons/server";

export function lessonErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof LessonActionError)) return null;
  const responses = {
    inactive: ["Your account cannot perform this action.", 403],
    "limit-reached": ["You have used all AI generations for this month.", 429],
    "rate-limited": ["Wait a few seconds before generating again.", 429],
    "not-found": ["Lesson not found.", 404],
    "not-owner": ["You do not own this lesson.", 403],
    busy: ["This lesson is already being generated.", 409],
    conflict: [
      "This lesson changed in another tab. Reload it before saving or regenerating.",
      409,
    ],
    "invalid-content": ["Review the lesson content.", 400],
    "invalid-cursor": ["Refresh the lesson list to continue.", 400],
    "generation-failed": ["The lesson could not be generated. Try again.", 502],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
