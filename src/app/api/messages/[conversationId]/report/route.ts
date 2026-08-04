import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import { reportMessage } from "@/lib/messages/server";
import { messageReportSchema } from "@/schemas/messages";

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
  const parsed = messageReportSchema.safeParse({
    ...(await request.json().catch(() => null)),
    conversationId,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  try {
    await reportMessage(account.uid, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
