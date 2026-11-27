import "server-only";

import { NextResponse } from "next/server";

import { FeedActionError } from "@/lib/feed/server";
import { PostAttachmentError } from "@/lib/feed/attachment-server";

export function feedErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof PostAttachmentError)
    return NextResponse.json(
      {
        error:
          "This attachment is unavailable. Upload it again or remove it from the draft.",
        code: error.code,
      },
      { status: error.code === "inactive" ? 403 : 400 },
    );
  if (!(error instanceof FeedActionError)) return null;
  const responses = {
    inactive: ["Your account cannot create content.", 403],
    "not-found": ["Post not found.", 404],
    "not-owner": ["You do not own this post.", 403],
    "not-visible": ["This post is not available.", 404],
    "not-interactive": [
      "Activity updates cannot be liked, commented on, shared, or saved.",
      409,
    ],
    "already-reported": ["You already reported this post.", 409],
    "invalid-cursor": ["The feed cursor is invalid.", 400],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
