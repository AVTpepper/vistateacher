import "server-only";
import { aiSpendErrorResponse } from "@/lib/ai/spend-response";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { UnsupportedPdfTextError } from "@/lib/documents/pdf";
import { WorksheetActionError } from "@/lib/worksheets/server";

const ERRORS = {
  inactive: ["Your account cannot perform this action.", 403],
  "limit-reached": ["You have used all AI generations for this month.", 429],
  "rate-limited": ["Wait a few seconds before generating again.", 429],
  "not-found": ["Worksheet or source lesson not found.", 404],
  busy: ["A generation is already in progress. Wait before trying again.", 409],
  conflict: [
    "This worksheet changed in another tab. Reload it before saving or regenerating.",
    409,
  ],
  "generation-failed": [
    "The worksheet could not be generated. Your AI allowance was restored. Try again.",
    502,
  ],
  "invalid-content": ["Review the worksheet content.", 400],
  "invalid-cursor": ["Refresh the worksheet list to continue.", 400],
} as const;

export async function worksheetRoute(
  request: NextRequest,
  action: (uid: string) => Promise<Response>,
) {
  if (request.method !== "GET" && !hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const expectedUid = request.headers.get("X-Vista-Expected-Uid");
  if (expectedUid !== null && expectedUid !== account.uid)
    return NextResponse.json(
      {
        error:
          "Your signed-in account changed. Reload this page before continuing. Your saved work remains with its original account.",
        code: "account-changed",
      },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  let response: Response;
  try {
    response = await action(account.uid);
  } catch (error) {
    const financial = aiSpendErrorResponse(error);
    if (financial) response = financial;
    else if (error instanceof WorksheetActionError) {
      const [message, status] = ERRORS[error.code];
      response = NextResponse.json(
        {
          error: error.code === "invalid-content" ? error.message : message,
          code: error.code,
        },
        { status },
      );
    } else if (error instanceof ZodError)
      response = NextResponse.json(
        { error: error.issues[0]?.message ?? "Review the worksheet fields." },
        { status: 400 },
      );
    else if (error instanceof UnsupportedPdfTextError)
      response = NextResponse.json({ error: error.message }, { status: 422 });
    else throw error;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function worksheetJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new WorksheetActionError(
      "invalid-content",
      "Send a valid JSON request.",
    );
  }
}
