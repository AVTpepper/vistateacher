import type { Metadata } from "next";

import { ResourceLibrary } from "@/features/resources/resource-library";
import { requireCurrentAccount } from "@/lib/auth/session";
import { resolveEffectivePlan } from "@/lib/entitlements/plan-entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { listResources } from "@/lib/resources/server";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const account = await requireCurrentAccount();
  const [resources, subscription] = await Promise.all([
    listResources({ query: "", type: "", subject: "", sort: "downloads" }),
    adminDb().doc(`subscriptions/${account.uid}`).get(),
  ]);
  const data = subscription.data();
  const plan = resolveEffectivePlan(
    data
      ? {
          plan: data.plan === "plus" ? "plus" : "free",
          status: data.status ?? "free",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          billingInterval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialStartedAt: null,
          trialEndsAt: data.trialEndsAt?.toDate?.() ?? null,
          trialConsumed: data.trialConsumed === true,
          updatedAt: new Date(),
        }
      : null,
  );
  return (
    <div className="px-4 py-5 lg:px-6">
      <ResourceLibrary resources={resources} plan={plan} />
    </div>
  );
}
