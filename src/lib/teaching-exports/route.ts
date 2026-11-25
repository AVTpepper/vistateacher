import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { TeachingExportError } from "@/lib/teaching-exports/server";
import { ResourceActionError } from "@/lib/resources/server";

const ERRORS = {
  inactive: ["Your account cannot perform this action.", 403],
  "not-found": [
    "This export or its saved teaching material is no longer available.",
    404,
  ],
  conflict: ["This export changed in another tab. Reopen it to continue.", 409],
  busy: ["Another export is in progress. Wait a few minutes, then retry.", 409],
  "too-large": [
    "This document is too large for Google export. Download the Word file instead.",
    422,
  ],
  "snapshot-limit": [
    "You have reached 100 saved Google exports. Delete teaching materials you no longer need to free their export snapshots. Existing exports and Word/PDF downloads remain available.",
    409,
  ],
  "not-ready": [
    "The export is not ready. Resume the Google Docs export first.",
    409,
  ],
  withdrawn: [
    "This community copy was removed. Export retries will not publish it again.",
    409,
  ],
} as const;
export async function teachingExportRoute(
  request: NextRequest,
  action: (uid: string) => Promise<Response>,
) {
  let response: Response;
  if (request.method !== "GET" && !hasTrustedOrigin(request))
    response = NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  else {
    const account = await getRouteAccount(request);
    if (!account)
      response = NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    else
      try {
        response = await action(account.uid);
      } catch (error) {
        if (error instanceof TeachingExportError) {
          const [message, status] = ERRORS[error.code];
          response = NextResponse.json(
            {
              error: error.message === error.code ? message : error.message,
              code: error.code,
            },
            { status },
          );
        } else if (error instanceof ZodError || error instanceof SyntaxError)
          response = NextResponse.json(
            {
              error:
                error instanceof ZodError
                  ? (error.issues[0]?.message ?? "Review the export fields.")
                  : "Send a valid JSON request.",
            },
            { status: 400 },
          );
        else if (error instanceof ResourceActionError)
          response = NextResponse.json(
            {
              error:
                "The community copy could not be published. Your private Google Doc is unaffected. Retry publishing or visit your resources.",
              code: error.code,
            },
            { status: error.code === "inactive" ? 403 : 409 },
          );
        else
          response = NextResponse.json(
            {
              error:
                "The export service could not finish this request. Reopen the export to recover its saved progress.",
            },
            { status: 503 },
          );
      }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
