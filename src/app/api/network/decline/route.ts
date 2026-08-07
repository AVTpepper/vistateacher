import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { unfollowEducator, NetworkActionError } from "@/lib/network/server";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const account = await getRouteAccount(request);
  if (!account) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { targetUid } = (await request.json().catch(() => ({}))) as {
    targetUid?: string;
  };

  if (typeof targetUid !== "string" || !targetUid.trim()) {
    return NextResponse.json(
      { error: "Invalid request: targetUid is required" },
      { status: 400 },
    );
  }

  try {
    // Decline is the same as unfollow - just delete the pending request
    await unfollowEducator(targetUid, account.uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NetworkActionError) {
      return NextResponse.json(
        { error: `Connection action failed: ${error.code}` },
        { status: error.code === "not-found" ? 404 : 400 },
      );
    }
    console.error("Decline connection error:", error);
    return NextResponse.json(
      { error: "Failed to decline connection request" },
      { status: 500 },
    );
  }
}
