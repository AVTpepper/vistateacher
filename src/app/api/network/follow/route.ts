import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import {
  followEducator,
  NetworkActionError,
  unfollowEducator,
} from "@/lib/network/server";
import { followActionSchema } from "@/schemas/network";

async function action(request: NextRequest, mode: "follow" | "unfollow") {
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
  const parsed = followActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid educator." },
      { status: 400 },
    );

  try {
    if (mode === "follow")
      await followEducator(account.uid, parsed.data.targetUid);
    else await unfollowEducator(account.uid, parsed.data.targetUid);
    return NextResponse.json({ following: mode === "follow" });
  } catch (error) {
    if (!(error instanceof NetworkActionError)) throw error;
    const responses = {
      self: ["You cannot follow yourself.", 400],
      "already-following": ["You already follow this educator.", 409],
      inactive: ["This connection is not available.", 409],
      "limit-reached": [
        "Your Community plan includes up to five connections.",
        403,
      ],
      "not-found": ["Educator not found.", 404],
    } as const;
    const [message, status] = responses[error.code];
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
}

export async function POST(request: NextRequest) {
  return action(request, "follow");
}

export async function DELETE(request: NextRequest) {
  return action(request, "unfollow");
}
