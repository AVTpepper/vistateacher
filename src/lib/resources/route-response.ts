import "server-only";

import { NextResponse } from "next/server";

import { ResourceActionError } from "@/lib/resources/server";

export function resourceErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof ResourceActionError)) return null;
  const responses = {
    inactive: ["Your account cannot perform this action.", 403],
    "limit-reached": [
      "Your Community plan includes five resource uploads per month.",
      403,
    ],
    "not-found": ["Resource not found.", 404],
    "not-owner": ["You do not own this resource.", 403],
    "not-ready": ["This resource is not ready.", 409],
    "invalid-upload": [
      "The uploaded file does not match its reservation.",
      400,
    ],
    "plus-required": ["A Plus plan is required for this download.", 403],
    "download-limit-reached": [
      "You have used all five Community resource downloads this month.",
      429,
    ],
    "own-review": ["You cannot review your own resource.", 400],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
