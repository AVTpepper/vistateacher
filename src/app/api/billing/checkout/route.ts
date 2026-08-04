import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { getBillingOrigin } from "@/lib/billing/request";
import { BillingError, createCheckout } from "@/lib/billing/server";
import { checkoutRequestSchema } from "@/schemas/billing";

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
  const parsed = checkoutRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a billing interval." },
      { status: 400 },
    );

  try {
    const url = await createCheckout(
      account.uid,
      account.email,
      parsed.data.interval,
      getBillingOrigin(request),
    );
    return NextResponse.json({ url });
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
    return NextResponse.json(
      {
        error: "Checkout is not available for this account.",
        code: error.code,
      },
      { status: error.code === "already-subscribed" ? 409 : 403 },
    );
  }
}
