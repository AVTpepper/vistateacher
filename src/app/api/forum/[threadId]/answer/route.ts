import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { forumErrorResponse } from "@/lib/forum/route-response";
import { acceptForumReply } from "@/lib/forum/server";
import { forumReplyActionSchema } from "@/schemas/forum";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
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
  const body = await request.json().catch(() => null);
  const parsed = forumReplyActionSchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
  try {
    await acceptForumReply(
      account.uid,
      account.role,
      parsed.data.threadId,
      parsed.data.replyId,
    );
    return NextResponse.json({ accepted: true });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
