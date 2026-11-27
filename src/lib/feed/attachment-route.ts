import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getRouteAccount } from "@/lib/auth/route-account";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { PostAttachmentError } from "@/lib/feed/attachment-server";

export async function postAttachmentRoute(
  request: NextRequest,
  action: (uid: string | null) => Promise<Response>,
) {
  if (request.method !== "GET" && !hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account && request.method !== "GET")
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const expectedUid = request.headers.get("X-Vista-Expected-Uid");
  if (expectedUid !== null && expectedUid !== account?.uid)
    return NextResponse.json(
      {
        error: "Your account changed. Reload before continuing.",
        code: "account-changed",
      },
      { status: 409 },
    );
  try {
    const response = await action(account?.uid ?? null);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof PostAttachmentError)
      return NextResponse.json(
        {
          error:
            "This attachment is unavailable. Check its upload or sign in with the account that owns the draft.",
          code:
            error instanceof PostAttachmentError
              ? error.code
              : "invalid-attachment",
        },
        {
          status:
            error instanceof PostAttachmentError && error.code === "inactive"
              ? 403
              : error instanceof ZodError || error.code === "invalid-attachment"
                ? 400
                : 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    throw error;
  }
}
export function attachmentBytesResponse(result: {
  bytes: Buffer;
  contentType: string;
  name: string;
  inline: boolean;
}) {
  const safeName = result.name.replace(/[\r\n"\\]/gu, "_");
  return new Response(Uint8Array.from(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.bytes.length),
      "Content-Disposition": `${result.inline ? "inline" : "attachment"}; filename="${safeName.replace(/[^\x20-\x7e]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
