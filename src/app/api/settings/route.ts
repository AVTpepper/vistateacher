import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { PrivateRecoveryError } from "@/lib/profiles/private-user";
import { updatePrivateSettings } from "@/lib/profiles/server";
import { privateSettingsSchema } from "@/schemas/profile";

export async function PATCH(request: NextRequest) {
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

  const parsed = privateSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Review your settings." },
      { status: 400 },
    );

  try {
    await updatePrivateSettings(account.uid, account.email, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PrivateRecoveryError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === "invalid-identity"
              ? 401
              : ["inactive", "deletion-blocked"].includes(error.code)
                ? 403
                : 409,
        },
      );
    console.error("Private settings update failed", {
      uid: account.uid,
      category: "unexpected",
    });
    return NextResponse.json(
      { error: "Unable to save your settings. Please try again." },
      { status: 503 },
    );
  }
}
