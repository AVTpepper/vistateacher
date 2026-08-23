import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { safeReturnTo } from "@/lib/auth/return-to";
import { requireCurrentAccount } from "@/lib/auth/session";
import { parsePlanIntent, planIntentHref } from "@/lib/billing/plan-intent";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const planIntent = parsePlanIntent(params.plan);
  const returnTo = safeReturnTo(
    Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
  );
  const account = await requireCurrentAccount();
  if (account.onboarded)
    redirect(
      returnTo ??
        (planIntent
          ? planIntentHref("/settings/billing", planIntent)
          : "/dashboard"),
    );

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
      <div className="mb-10 max-w-2xl">
        <p className="text-primary font-mono text-xs font-bold uppercase">
          Educator profile
        </p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl">
          Help the right educators find you.
        </h1>
        <p className="text-muted-foreground mt-4 leading-7">
          Your professional context makes recommendations, discussions, and
          resource discovery more relevant.
        </p>
      </div>
      <div className="surface-card p-6 sm:p-8">
        <OnboardingForm
          displayName={account.displayName ?? ""}
          planIntent={planIntent}
          returnTo={returnTo}
        />
      </div>
    </div>
  );
}
