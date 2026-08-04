import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { feedErrorResponse } from "@/lib/feed/route-response";
import { reportPost } from "@/lib/feed/server";
import { reportPostSchema } from "@/schemas/feed";

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
  const parsed = reportPostSchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  try {
    await reportPost(account.uid, parsed.data);
    return NextResponse.json({ reported: true }, { status: 201 });
  } catch (error) {
    const response = feedErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
