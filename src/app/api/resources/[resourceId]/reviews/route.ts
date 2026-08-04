import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { resourceErrorResponse } from "@/lib/resources/route-response";
import { reviewResource } from "@/lib/resources/server";
import { resourceReviewSchema } from "@/schemas/resource";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
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
  const parsed = resourceReviewSchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid review." },
      { status: 400 },
    );
  try {
    await reviewResource(account.uid, parsed.data);
    return NextResponse.json({ reviewed: true });
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
