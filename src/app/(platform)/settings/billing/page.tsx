import type { Metadata } from "next";

import { BillingPanel } from "@/features/billing/billing-panel";
import type { BillingView } from "@/features/billing/billing-controls";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";

export const metadata: Metadata = { title: "Plan and billing" };

export default async function BillingSettingsPage() {
  const account = await requireCurrentAccount();
  const state = await getBillingState(account.uid);
  const billing: BillingView = {
    ...state,
    currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
  };
  return <BillingPanel billing={billing} />;
}
