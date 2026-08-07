import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { SubscriptionManager } from "@/features/billing/subscription-manager";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";

export const metadata: Metadata = { title: "Manage billing" };

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export default async function ManageBillingPage() {
  const account = await requireCurrentAccount();
  const billing = await getBillingState(account.uid);

  return (
    <section className="space-y-5">
      <div className="surface-card p-6">
        <p className="text-primary font-mono text-[10px] font-bold uppercase">
          Subscription controls
        </p>
        <h1 className="mt-2 font-serif text-2xl">Manage your membership</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Core subscription actions stay inside VistaTeacher. Payment method and
          invoice details continue in Stripe&apos;s secure billing portal.
        </p>
        <div className="mt-5">
          <SubscriptionManager
            canManageBilling={billing.canManageBilling}
            cancelAtPeriodEnd={billing.cancelAtPeriodEnd}
            periodEndLabel={formatDate(billing.currentPeriodEnd)}
          />
        </div>
      </div>

      <Button asChild variant="outline">
        <Link href="/settings/billing">Back to billing</Link>
      </Button>
    </section>
  );
}
