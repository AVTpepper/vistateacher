import "server-only";

import { NextResponse } from "next/server";

import { ForumActionError } from "@/lib/forum/server";

export function forumErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof ForumActionError)) return null;
  const responses = {
    inactive: ["Your account cannot perform this action.", 403],
    "not-found": ["Discussion not found.", 404],
    "not-owner": ["You cannot moderate this discussion.", 403],
    "not-visible": ["This discussion is not available.", 404],
    locked: ["This discussion is locked.", 409],
    "already-reported": ["You already reported this content.", 409],
    "invalid-cursor": ["Invalid forum cursor.", 400],
    "invalid-category": ["Choose an active forum category.", 400],
    "invalid-answer": ["That reply cannot be accepted.", 400],
    "admin-required": ["Administrator access is required.", 403],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
