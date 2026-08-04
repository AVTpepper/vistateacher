import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/marketing/content-page";
import { Button } from "@/components/ui/button";
import {
  BillingControls,
  type BillingView,
} from "@/features/billing/billing-controls";
import { getCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";

export const metadata: Metadata = { title: "Pricing" };

const plans = [
  {
    name: "Free",
    price: "$0",
    note: "For joining the community",
    features: [
      "Educator profile",
      "Up to 5 connections",
      "10 messages per day",
      "5 resource uploads per month",
    ],
  },
  {
    name: "Plus",
    price: "$9",
    note: "$79 when billed yearly",
    features: [
      "Unlimited connections and messages",
      "Unlimited resource uploads",
      "50 AI lessons per month",
      "Lesson PDF and DOCX exports",
      "Full analytics and Plus resources",
    ],
  },
];

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
      intro="Core professional participation stays available on the Free plan. Plus expands limits and unlocks planning, export, and analytics tools."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <section key={plan.name} className="bg-card rounded-lg border p-7">
            <h2 className="font-serif text-3xl">{plan.name}</h2>
            <p className="mt-5 font-serif text-5xl">
              {plan.price}
              <span className="text-muted-foreground font-sans text-sm">
                {plan.name === "Plus" ? " / month" : ""}
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
            {plan.name === "Plus" && billing ? (
              <BillingControls billing={billing} compact />
            ) : (
              <Button
                asChild
                className="mt-8 w-full"
                size="lg"
                variant={plan.name === "Plus" ? "accent" : "default"}
              >
                <Link href={account ? "/app" : "/sign-up"}>
                  {account ? "Current plan" : "Start free"}
                </Link>
              </Button>
            )}
          </section>
        ))}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        The fourteen-day Plus trial requires no card. Paid memberships are
        processed securely by Stripe and can be managed from account settings.
      </p>
    </ContentPage>
  );
}
