import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BillingPanel } from "@/features/billing/billing-panel";
import type { BillingView } from "@/features/billing/billing-controls";
import { requireCurrentAccount } from "@/lib/auth/session";
import { parsePlanIntent } from "@/lib/billing/plan-intent";
import {
  confirmCompletedCheckout,
  getBillingAccountSummary,
  getBillingState,
} from "@/lib/billing/server";
import { resolveStripeMode } from "@/lib/billing/stripe-mode";
import { checkoutSessionIdSchema } from "@/schemas/billing";

export const metadata: Metadata = { title: "Plan and billing" };

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout?: string | string[];
    plan?: string | string[];
    interval?: string | string[];
    session_id?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const checkout = Array.isArray(params.checkout)
    ? params.checkout[0]
    : params.checkout;
  const planIntent = parsePlanIntent(params.plan, params.interval);
  const stripeMode = resolveStripeMode(
    process.env.STRIPE_MODE,
    process.env.STRIPE_SECRET_KEY,
  );
  const account = await requireCurrentAccount();
  const sessionId = checkoutSessionIdSchema.safeParse(
    Array.isArray(params.session_id) ? params.session_id[0] : params.session_id,
  );
  let checkoutVerified = false;
  if (checkout === "success" && sessionId.success) {
    try {
      checkoutVerified = await confirmCompletedCheckout(
        account.uid,
        sessionId.data,
      );
    } catch (error) {
      console.error("Could not confirm completed Stripe Checkout", error);
    }
  }
  if (checkoutVerified) redirect("/settings/billing?checkout=success");

  const state = await getBillingState(account.uid);
  const summary = await getBillingAccountSummary(account.uid).catch(() => null);
  const billing: BillingView = {
    ...state,
    currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
  };
  return (
    <BillingPanel
      billing={billing}
      checkoutStatus={
        checkout === "canceled"
          ? "canceled"
          : checkout === "success"
            ? state.effectivePlan === "plus"
              ? "success"
              : "processing"
            : null
      }
      planIntent={planIntent}
      testMode={stripeMode === "TEST"}
      summary={summary}
    />
  );
}
