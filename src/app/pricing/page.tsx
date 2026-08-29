import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/marketing/content-page";
import { Button } from "@/components/ui/button";
import {
  BillingControls,
  type BillingView,
} from "@/features/billing/billing-controls";
import { billingPlans } from "@/features/billing/plan-details";
import { getCurrentAccount } from "@/lib/auth/session";
import { planIntentHref } from "@/lib/billing/plan-intent";
import { getBillingState } from "@/lib/billing/server";
import { billingIntervalSchema } from "@/schemas/billing";

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string | string[] }>;
}) {
  const parsedInterval = billingIntervalSchema.safeParse(
    (await searchParams).interval,
  );
  const interval = parsedInterval.success ? parsedInterval.data : "month";
  const account = await getCurrentAccount();
  const state = account?.onboarded
    ? await getBillingState(account.uid).catch(() => null)
    : null;
  const billing: BillingView | null = state
    ? {
        ...state,
        currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
        trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
      }
    : null;
  return (
    <ContentPage
      eyebrow="Simple plans"
      title="Begin with community. Add Plus for deeper tools."
      intro="Core professional participation is included with Community access. Plus expands limits and unlocks planning, export, and analytics tools."
    >
      <div
        className="bg-muted mx-auto mb-8 grid max-w-sm grid-cols-2 gap-1 rounded-lg p-1"
        aria-label="Billing interval"
      >
        {(["month", "year"] as const).map((value) => (
          <Link
            key={value}
            href={`/pricing?interval=${value}`}
            aria-current={interval === value ? "true" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-bold transition-colors ${
              interval === value
                ? "bg-card text-primary shadow-sm"
                : "text-foreground hover:bg-card/60"
            }`}
          >
            {value === "month" ? "$9 monthly" : "$79 yearly"}
          </Link>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {billingPlans.map((plan) => {
          const isCurrent = billing?.effectivePlan === plan.id;
          const displayedPrice =
            plan.id === "plus" && interval === "year" ? "$79" : plan.price;
          const displayedSuffix =
            plan.id === "plus" && interval === "year"
              ? " / year"
              : plan.priceSuffix;
          return (
            <section
              key={plan.id}
              className={
                plan.id === "plus"
                  ? "surface-card-featured p-7"
                  : "surface-card surface-card-interactive p-7"
              }
            >
              <h2 className="font-serif text-3xl tracking-tight">
                {plan.name}
              </h2>
              <p className="mt-5 font-serif text-5xl">
                {displayedPrice}
                <span
                  className={
                    plan.id === "plus"
                      ? "font-sans text-sm text-white/70"
                      : "text-muted-foreground font-sans text-sm"
                  }
                >
                  {displayedSuffix}
                </span>
              </p>
              <p
                className={
                  plan.id === "plus"
                    ? "mt-2 text-sm text-white/75"
                    : "text-muted-foreground mt-2 text-sm"
                }
              >
                {plan.note}
              </p>
              <ul className="mt-7 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li className="flex gap-3" key={feature}>
                    <Check
                      aria-hidden="true"
                      className={
                        plan.id === "plus"
                          ? "mt-0.5 size-4 shrink-0 text-white"
                          : "text-success mt-0.5 size-4 shrink-0"
                      }
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.id === "plus" && billing ? (
                <BillingControls
                  billing={billing}
                  compact
                  preferredInterval={interval}
                />
              ) : plan.id === "free" && billing?.effectivePlan === "plus" ? (
                <p className="bg-muted text-foreground mt-8 rounded-lg border px-4 py-3 text-center text-sm font-bold">
                  Included with your Plus plan
                </p>
              ) : (
                <Button
                  asChild
                  className="mt-8 w-full"
                  size="lg"
                  variant={plan.id === "plus" ? "accent" : "default"}
                >
                  <Link
                    href={
                      account
                        ? account.onboarded
                          ? plan.id === "plus"
                            ? "/settings/billing"
                            : "/dashboard"
                          : planIntentHref(
                              "/onboarding",
                              plan.id === "plus"
                                ? { plan: "plus", interval }
                                : null,
                            )
                        : planIntentHref(
                            "/sign-up",
                            plan.id === "plus"
                              ? { plan: "plus", interval }
                              : null,
                          )
                    }
                  >
                    {account
                      ? account.onboarded
                        ? isCurrent
                          ? "Current plan"
                          : plan.id === "plus"
                            ? "View billing"
                            : "Go to dashboard"
                        : "Continue setup"
                      : plan.id === "plus"
                        ? "Choose Plus"
                        : "Create free account"}
                  </Link>
                </Button>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        Paid memberships are processed securely by Stripe and can be managed
        from account settings.
      </p>
    </ContentPage>
  );
}
