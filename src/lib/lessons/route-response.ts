import "server-only";
import { aiSpendErrorResponse } from "@/lib/ai/spend-response";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { LessonActionError } from "@/lib/lessons/server";

export function lessonErrorResponse(error: unknown): NextResponse | null {
  const financial = aiSpendErrorResponse(error);
  if (financial) return financial;
  if (!(error instanceof LessonActionError)) return null;
  const responses = {
    inactive: ["Your account cannot perform this action.", 403],
    "limit-reached": ["You have used all AI generations for this month.", 429],
    "rate-limited": ["Wait a few seconds before generating again.", 429],
    "not-found": ["Lesson not found.", 404],
    "not-owner": ["You do not own this lesson.", 403],
    busy: ["This lesson is already being generated.", 409],
    conflict: [
      "This lesson changed in another tab. Review the latest version before saving or regenerating.",
      409,
    ],
    "invalid-content": ["Review the lesson content.", 400],
    "invalid-cursor": ["Refresh the lesson list to continue.", 400],
    "generation-failed": ["The lesson could not be generated. Try again.", 502],
  } as const;
  const [message, status] = responses[error.code];
  return NextResponse.json(
    {
      error: error.code === "invalid-content" ? error.message : message,
      code: error.code,
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Share account, origin and cache handling across private lesson actions. */
export async function lessonRoute(
  request: NextRequest,
  action: (uid: string) => Promise<Response>,
) {
  if (request.method !== "GET" && !hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  const expectedUid = request.headers.get("X-Vista-Expected-Uid");
  if (expectedUid !== null && expectedUid !== account.uid)
    return NextResponse.json(
      {
        error:
          "Your signed-in account changed. Reload this page before continuing. Your saved request remains with its original account.",
        code: "account-changed",
      },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  let response: Response;
  try {
    response = await action(account.uid);
  } catch (error) {
    const known = lessonErrorResponse(error);
    if (known) response = known;
    else if (error instanceof ZodError)
      response = NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Review the lesson fields.",
          code: "invalid-content",
        },
        { status: 400 },
      );
    else throw error;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function lessonJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new LessonActionError(
      "invalid-content",
      "Send a valid JSON request.",
    );
  }
}
