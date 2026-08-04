import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { BillingError, startVistaTrial } from "@/lib/billing/server";

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

  try {
    const billing = await startVistaTrial(account.uid);
    return NextResponse.json({ billing });
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
    return NextResponse.json(
      {
        error: "The Plus trial is not available for this account.",
        code: error.code,
      },
      { status: error.code === "trial-unavailable" ? 409 : 403 },
    );
  }
}
