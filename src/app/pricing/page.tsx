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

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
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
      signedIn={Boolean(account)}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {billingPlans.map((plan) => (
          <section key={plan.id} className="bg-card rounded-lg border p-7">
            <h2 className="font-serif text-3xl">{plan.name}</h2>
            <p className="mt-5 font-serif text-5xl">
              {plan.price}
              <span className="text-muted-foreground font-sans text-sm">
                {plan.priceSuffix}
              </span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{plan.note}</p>
            <ul className="mt-7 space-y-3 text-sm">
              {plan.features.map((feature) => (
                <li className="flex gap-3" key={feature}>
                  <Check
                    aria-hidden="true"
                    className="text-success mt-0.5 size-4 shrink-0"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.id === "plus" && billing ? (
              <BillingControls billing={billing} compact />
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
                        ? "/app"
                        : planIntentHref(
                            "/onboarding",
                            plan.id === "plus" ? "plus" : null,
                          )
                      : planIntentHref(
                          "/sign-up",
                          plan.id === "plus" ? "plus" : null,
                        )
                  }
                >
                  {account
                    ? account.onboarded
                      ? "Current plan"
                      : "Continue setup"
                    : plan.id === "plus"
                      ? "Choose Plus"
                      : "Create free account"}
                </Link>
              </Button>
            )}
          </section>
        ))}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        Paid memberships are processed securely by Stripe and can be managed
        from account settings.
      </p>
    </ContentPage>
  );
}
