import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import { reserveMessageAttachment } from "@/lib/messages/server";
import { reserveMessageAttachmentSchema } from "@/schemas/messages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!hasTrustedOrigin(request))
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
  const { conversationId } = await params;
  const parsed = reserveMessageAttachmentSchema.safeParse({
    conversationId,
    attachment: await request.json().catch(() => null),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid attachment." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await reserveMessageAttachment(account.uid, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
