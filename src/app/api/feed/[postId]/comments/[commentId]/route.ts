import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { feedErrorResponse } from "@/lib/feed/route-response";
import { deletePostComment, updatePostComment } from "@/lib/feed/server";
import { commentActionSchema, updateCommentSchema } from "@/schemas/feed";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
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
  const parsed = updateCommentSchema.safeParse({
    ...(await request.json().catch(() => null)),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid comment." },
      { status: 400 },
    );
  try {
    await updatePostComment(account.uid, parsed.data);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
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
  const parsed = commentActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  try {
    await deletePostComment(
      account.uid,
      parsed.data.postId,
      parsed.data.commentId,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
