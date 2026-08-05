import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmbeddedCheckoutPanel } from "@/features/billing/embedded-checkout";
import { requireCurrentAccount } from "@/lib/auth/session";
import {
  resolveStripeMode,
  resolveStripePublishableKey,
} from "@/lib/billing/stripe-mode";
import { billingIntervalSchema } from "@/schemas/billing";

export const metadata: Metadata = { title: "Checkout" };

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string | string[] }>;
}) {
  const interval = billingIntervalSchema.safeParse(
    (await searchParams).interval,
  );
  if (!interval.success) redirect("/settings/billing");

  await requireCurrentAccount();
  const mode = resolveStripeMode(
    process.env.STRIPE_MODE,
    process.env.STRIPE_SECRET_KEY,
  );
  const publishableKey = resolveStripePublishableKey(
    mode,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
      <Link
        href="/settings/billing"
        className="text-muted-foreground hover:text-foreground mb-7 inline-flex items-center gap-2 text-sm font-bold"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to billing
      </Link>
      <h1 className="font-serif text-3xl sm:text-4xl">Complete your upgrade</h1>
      <p className="text-muted-foreground mt-2 mb-8 text-sm">
        Review your plan and enter payment details securely below.
      </p>
      <EmbeddedCheckoutPanel
        interval={interval.data}
        publishableKey={publishableKey}
        testMode={mode === "TEST"}
      />
    </div>
  );
}
