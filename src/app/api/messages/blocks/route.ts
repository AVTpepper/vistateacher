import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { messageErrorResponse } from "@/lib/messages/route-response";
import { setUserBlocked } from "@/lib/messages/server";
import { blockUserSchema } from "@/schemas/messages";

export async function PUT(request: NextRequest) {
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
  const parsed = blockUserSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid block action." },
      { status: 400 },
    );
  try {
    await setUserBlocked(account.uid, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = messageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
