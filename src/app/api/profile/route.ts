import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { updateProfile } from "@/lib/profiles/server";
import { profileUpdateSchema } from "@/schemas/profile";

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

  const parsed = profileUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Review your profile details.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );

  await updateProfile(account.uid, parsed.data);
  return NextResponse.json({ ok: true });
}
