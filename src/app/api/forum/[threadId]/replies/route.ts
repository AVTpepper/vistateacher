import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { forumErrorResponse } from "@/lib/forum/route-response";
import { addForumReply } from "@/lib/forum/server";
import { createForumReplySchema } from "@/schemas/forum";

export async function POST(
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
  const parsed = createForumReplySchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid comment." },
      { status: 400 },
    );
  try {
    const replyId = await addForumReply(account.uid, parsed.data);
    return NextResponse.json({ replyId }, { status: 201 });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
