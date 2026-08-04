import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { feedErrorResponse } from "@/lib/feed/route-response";
import { setPostLiked } from "@/lib/feed/server";
import { postActionSchema } from "@/schemas/feed";

async function action(
  request: NextRequest,
  params: Promise<{ postId: string }>,
  liked: boolean,
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
  const parsed = postActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  try {
    await setPostLiked(account.uid, parsed.data.postId, liked);
    return NextResponse.json({ liked });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  return action(request, params, true);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  return action(request, params, false);
}
