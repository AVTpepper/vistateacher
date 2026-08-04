import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import {
  getMessagePage,
  markConversationRead,
  sendMessage,
} from "@/lib/messages/server";
import {
  conversationActionSchema,
  messageQuerySchema,
  sendMessageSchema,
} from "@/schemas/messages";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { conversationId } = await params;
  const parsed = messageQuerySchema.safeParse({
    conversationId,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid message query." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await getMessagePage(account.uid, parsed.data));
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

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
  const parsed = sendMessageSchema.safeParse({
    ...(await request.json().catch(() => null)),
    conversationId,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await sendMessage(account.uid, parsed.data), {
      status: 201,
    });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(
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
  const parsed = conversationActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid conversation." },
      { status: 400 },
    );
  try {
    await markConversationRead(account.uid, parsed.data.conversationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
