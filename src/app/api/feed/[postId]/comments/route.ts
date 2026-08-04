import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { feedErrorResponse } from "@/lib/feed/route-response";
import { addPostComment, getPostComments } from "@/lib/feed/server";
import { createCommentSchema, postActionSchema } from "@/schemas/feed";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
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
    return NextResponse.json({
      comments: await getPostComments(account.uid, parsed.data.postId),
    });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
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
  const parsed = createCommentSchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid comment." },
      { status: 400 },
    );
  try {
    const commentId = await addPostComment(account.uid, parsed.data);
    return NextResponse.json({ commentId }, { status: 201 });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
