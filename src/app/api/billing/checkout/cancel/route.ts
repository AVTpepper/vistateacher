import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRouteAccount } from "@/lib/auth/route-account";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { BillingError, cancelOpenCheckout } from "@/lib/billing/server";

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
    await cancelOpenCheckout(account.uid);
    return NextResponse.json({ canceled: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BillingError && error.code === "already-subscribed"
            ? "Payment has already completed. Return to billing to check your subscription."
            : "Checkout could not be closed yet. Please try again shortly.",
      },
      { status: 409 },
    );
  }
}
