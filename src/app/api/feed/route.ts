import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { feedErrorResponse } from "@/lib/feed/route-response";
import { createPost, getFeedPage } from "@/lib/feed/server";
import { createPostSchema, feedQuerySchema } from "@/schemas/feed";

export async function GET(request: NextRequest) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = feedQuerySchema.safeParse({
    view: request.nextUrl.searchParams.get("view") ?? undefined,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid feed query." }, { status: 400 });

  try {
    return NextResponse.json(
      await getFeedPage(account.uid, parsed.data.view, parsed.data.cursor),
    );
  } catch (error) {
    const response = feedErrorResponse(error);
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
  const parsed = createPostSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid post." },
      { status: 400 },
    );

  try {
    const postId = await createPost(account.uid, parsed.data);
    return NextResponse.json({ postId }, { status: 201 });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
