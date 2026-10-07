import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import {
  enqueueAccountDeletion,
  processAccountDeletion,
} from "@/lib/accounts/deletion";
import { deletionRequestSchema } from "@/schemas/profile";

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

  const parsed = deletionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Type DELETE to confirm." },
      { status: 400 },
    );

  try {
    const receipt = await enqueueAccountDeletion(account.uid);
    // Deliver the durable receipt before cleanup; interrupted jobs can be retried by administrators.
    after(async () => {
      await processAccountDeletion(account.uid);
    });
    const response = NextResponse.json(
      { ok: true, receipt, status: "pending" },
      { status: 202 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Could not request account deletion", error);
    return NextResponse.json(
      {
        error:
          "Deletion could not start. Your account is still available. Please try again.",
      },
      { status: 503 },
    );
  }
}
