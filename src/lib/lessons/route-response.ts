import "server-only";

import { NextResponse } from "next/server";

import { LessonActionError } from "@/lib/lessons/server";

export function lessonErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof LessonActionError)) return null;
  const responses = {
    inactive: ["Your account cannot perform this action.", 403],
    "plus-required": ["AI lessons require a Plus membership.", 403],
    "limit-reached": ["You have used all 50 AI lessons for this month.", 429],
    "rate-limited": ["Wait a few seconds before generating again.", 429],
    "not-found": ["Lesson not found.", 404],
    "not-owner": ["You do not own this lesson.", 403],
    busy: ["This lesson is already being generated.", 409],
    "generation-failed": ["The lesson could not be generated. Try again.", 502],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
