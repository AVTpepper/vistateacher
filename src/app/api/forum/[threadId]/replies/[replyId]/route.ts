import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { forumErrorResponse } from "@/lib/forum/route-response";
import { deleteForumReply } from "@/lib/forum/server";
import { forumReplyActionSchema } from "@/schemas/forum";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; replyId: string }> },
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
  const parsed = forumReplyActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid reply." }, { status: 400 });
  try {
    await deleteForumReply(
      account.uid,
      account.role,
      parsed.data.threadId,
      parsed.data.replyId,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
