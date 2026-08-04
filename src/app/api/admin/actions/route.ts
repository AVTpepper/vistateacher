import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getPlatformAdminRouteAccount } from "@/lib/admin/auth";
import { AdminActionError, performAdminAction } from "@/lib/admin/server";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { adminActionSchema } from "@/schemas/admin";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getPlatformAdminRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  const parsed = adminActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid administrator action." },
      { status: 400 },
    );

  try {
    await performAdminAction(account, parsed.data);
    return NextResponse.json({ completed: true });
  } catch (error) {
    if (!(error instanceof AdminActionError)) throw error;
    const responses = {
      "admin-required": ["Administrator access is required.", 403],
      conflict: ["This item has already been reviewed.", 409],
      "invalid-target": ["The moderation target is invalid.", 400],
      "not-found": ["The moderation target was not found.", 404],
      "protected-target": ["This administrator account is protected.", 403],
    } as const;
    const [message, status] = responses[error.code];
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
}
