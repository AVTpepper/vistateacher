import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPlatformAdminRouteAccount } from "@/lib/admin/auth";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { processAccountDeletion } from "@/lib/accounts/deletion";

export async function POST(request: NextRequest) {
  if (
    !hasTrustedOrigin(request) ||
    !(await getPlatformAdminRouteAccount(request))
  )
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  if (typeof body?.uid !== "string" || !/^[\w-]{1,128}$/.test(body.uid))
    return NextResponse.json(
      { error: "Choose a deletion request." },
      { status: 400 },
    );
  return NextResponse.json({ status: await processAccountDeletion(body.uid) });
}
