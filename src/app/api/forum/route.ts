import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { forumErrorResponse } from "@/lib/forum/route-response";
import { createForumThread, getForumPage } from "@/lib/forum/server";
import { createForumThreadSchema, forumQuerySchema } from "@/schemas/forum";

export async function GET(request: NextRequest) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = forumQuerySchema.safeParse({
    categoryId: request.nextUrl.searchParams.get("categoryId") ?? "",
    query: request.nextUrl.searchParams.get("query") ?? "",
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid forum query." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await getForumPage(account.uid, account.role, parsed.data),
    );
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: NextRequest) {
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
  const parsed = createForumThreadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid discussion." },
      { status: 400 },
    );
  try {
    const threadId = await createForumThread(account.uid, parsed.data);
    return NextResponse.json({ threadId }, { status: 201 });
  } catch (error) {
    const response = forumErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
