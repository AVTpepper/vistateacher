import { NextResponse } from "next/server";

import { sendBillingCommunication } from "@/lib/billing/receipt";
import { getBillingProvider } from "@/lib/billing/stripe-provider";
import { reconcileBillingEvent } from "@/lib/billing/server";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event;
  try {
    event = getBillingProvider().constructWebhookEvent(
      await request.text(),
      signature,
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
  if (!event) return NextResponse.json({ received: true, applied: false });

  try {
    const result = await reconcileBillingEvent(event);
    if (result.communicationKind) {
      await sendBillingCommunication(event, result.communicationKind);
    }
    return NextResponse.json({ received: true, applied: result.applied });
  } catch (error) {
    console.error("Billing webhook processing failed", event.id, error);
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
