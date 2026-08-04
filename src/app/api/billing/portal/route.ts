import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { getBillingOrigin } from "@/lib/billing/request";
import { BillingError, createPortal } from "@/lib/billing/server";

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
    const url = await createPortal(account.uid, getBillingOrigin(request));
    return NextResponse.json({ url });
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
    return NextResponse.json(
      { error: "Billing management is not available yet.", code: error.code },
      { status: 409 },
    );
  }
}
