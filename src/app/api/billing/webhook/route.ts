import { NextResponse } from "next/server";

import { getBillingProvider } from "@/lib/billing/stripe-provider";
import { reconcileBillingEvent } from "@/lib/billing/server";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  try {
    const event = getBillingProvider().constructWebhookEvent(
      await request.text(),
      signature,
    );
    if (!event) return NextResponse.json({ received: true, applied: false });
    const applied = await reconcileBillingEvent(event);
    return NextResponse.json({ received: true, applied });
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
}
