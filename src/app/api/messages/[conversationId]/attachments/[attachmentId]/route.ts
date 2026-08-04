import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import {
  cancelMessageAttachment,
  getMessageAttachment,
} from "@/lib/messages/server";
import { messageActionSchema } from "@/schemas/messages";

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; attachmentId: string }> },
) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const values = await params;
  const parsed = messageActionSchema.safeParse({
    conversationId: values.conversationId,
    messageId: values.attachmentId,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  try {
    const file = await getMessageAttachment(
      account.uid,
      parsed.data.conversationId,
      parsed.data.messageId,
    );
    const safeName = file.fileName.replace(/["\r\n]/g, "_");
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.fileType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ conversationId: string; attachmentId: string }>;
  },
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
  const values = await params;
  try {
    await cancelMessageAttachment(
      account.uid,
      values.conversationId,
      values.attachmentId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
