import type { Metadata } from "next";

import { BillingPanel } from "@/features/billing/billing-panel";
import type { BillingView } from "@/features/billing/billing-controls";
import { requireCurrentAccount } from "@/lib/auth/session";
import { parsePlanIntent } from "@/lib/billing/plan-intent";
import { getBillingState } from "@/lib/billing/server";
import { resolveStripeMode } from "@/lib/billing/stripe-mode";

export const metadata: Metadata = { title: "Plan and billing" };

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout?: string | string[];
    plan?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const checkout = params.checkout;
  const planIntent = parsePlanIntent(params.plan);
  const stripeMode = resolveStripeMode(
    process.env.STRIPE_MODE,
    process.env.STRIPE_SECRET_KEY,
  );
  const account = await requireCurrentAccount();
  const state = await getBillingState(account.uid);
  const billing: BillingView = {
    ...state,
    currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
  };
  return (
    <BillingPanel
      billing={billing}
      checkoutStatus={
        checkout === "success" || checkout === "canceled" ? checkout : null
      }
      planIntent={planIntent}
      testMode={stripeMode === "TEST"}
    />
  );
}
