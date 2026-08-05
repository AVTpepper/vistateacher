import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { forumErrorResponse } from "@/lib/forum/route-response";
import { moderateForumThread, updateForumThread } from "@/lib/forum/server";
import {
  forumModerationSchema,
  forumThreadActionSchema,
  updateForumThreadSchema,
} from "@/schemas/forum";

async function accountForMutation(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return null;
  return getRouteAccount(request);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const account = await accountForMutation(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  const payload = {
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  };
  try {
    if (typeof (body as { action?: unknown } | null)?.action === "string") {
      const parsed = forumModerationSchema.safeParse(payload);
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid moderation action." },
          { status: 400 },
        );
      await moderateForumThread(account.uid, account.role, parsed.data);
      return NextResponse.json({ moderated: true });
    }
    const parsed = updateForumThreadSchema.safeParse(payload);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid discussion." },
        { status: 400 },
      );
    await updateForumThread(account.uid, parsed.data);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const account = await accountForMutation(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = forumThreadActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid discussion." }, { status: 400 });
  try {
    await moderateForumThread(account.uid, account.role, {
      ...parsed.data,
      action: "delete",
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
