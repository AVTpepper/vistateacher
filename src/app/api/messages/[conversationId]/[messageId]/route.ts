import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import { deleteMessage, editMessage } from "@/lib/messages/server";
import { editMessageSchema, messageActionSchema } from "@/schemas/messages";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; messageId: string }> },
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
  const parsed = editMessageSchema.safeParse({
    ...(await request.json().catch(() => null)),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 },
    );
  try {
    await editMessage(
      account.uid,
      parsed.data.conversationId,
      parsed.data.messageId,
      parsed.data.content,
    );
    return NextResponse.json({ updated: true });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; messageId: string }> },
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
  const parsed = messageActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  try {
    await deleteMessage(
      account.uid,
      parsed.data.conversationId,
      parsed.data.messageId,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
