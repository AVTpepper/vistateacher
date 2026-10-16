import { MarketingFlow } from "@/components/marketing/marketing-flow";
import { StoryCarousel } from "@/components/marketing/story-carousel";
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
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";
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
      title="Connect for free. Add Plus for more AI planning."
      intro="Connections, messaging, community resource sharing, and standard lesson exports are free. Plus gives you more AI actions for lesson preparation, full analytics, and Plus resources."
    >
      <MarketingFlow>
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
        <div className="grid gap-6 md:grid-cols-2 md:gap-y-0">
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
                    ? "surface-card-featured p-7 md:row-span-5 md:grid md:grid-rows-subgrid"
                    : "surface-card surface-card-interactive p-7 md:row-span-5 md:grid md:grid-rows-subgrid"
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
          from account settings. Plus renews automatically at the selected
          interval until renewal is turned off.
        </p>
        <section
          className="mt-10 border-t pt-8"
          aria-labelledby="plan-usage-heading"
        >
          <h2 id="plan-usage-heading" className="font-serif text-2xl">
            How the allowances work
          </h2>
          <div className="mt-7">
            <StoryCarousel
              label="How your membership works"
              cards={[
                {
                  icon: "sparkles",
                  eyebrow: "A little help with the prep",
                  title: "One shared AI allowance",
                  description: `Creating a lesson or refining one with AI uses one action. Choose any mix: ${PLAN_ENTITLEMENTS.free.aiLessonsPerMonth} actions per month with Community or ${PLAN_ENTITLEMENTS.plus.aiLessonsPerMonth} with Plus. Manual editing uses no actions.`,
                  tags: ["Create", "Refine", "Keep your own voice"],
                },
                {
                  icon: "book",
                  eyebrow: "Good ideas deserve to be shared",
                  title: "Resources and exports",
                  description:
                    "Resources are files shared by members. Exports turn your lessons into PDF or Word files. Standard exports are free, even when your AI allowance is used up. Plus-only resources require Plus access.",
                  tags: ["Community resources", "PDF", "Word"],
                },
                {
                  icon: "people",
                  eyebrow: "More conversation, more possibility",
                  title: "A network you can keep using",
                  description:
                    "Connections and messages have no subscription quota. Short anti-spam limits apply to every plan. AI allowances reset on the first day of each month at 00:00 UTC.",
                  tags: ["Connect freely", "Stay in touch", "Grow together"],
                },
              ]}
            />
          </div>
        </section>
        <section
          className="mt-12 border-t pt-10"
          aria-labelledby="billing-faq-heading"
        >
          <h2 id="billing-faq-heading" className="font-serif text-3xl">
            Billing questions
          </h2>
          <div className="flow-faq mt-6 divide-y rounded-2xl border px-5 sm:px-7">
            {[
              [
                "Cancel without losing paid time",
                "Turn off renewal from Plan & billing. Plus remains active through the current billing period.",
              ],
              [
                "Receipts and payment methods",
                "Receipts are emailed after payment. Invoices and payment methods remain available through Stripe’s secure portal.",
              ],
              [
                "Refund support",
                "Refund requests are reviewed case by case through support, subject to applicable law.",
              ],
            ].map(([title, description]) => (
              <details key={title} className="group py-5">
                <summary className="cursor-pointer text-base font-bold">
                  <h3 className="inline">{title}</h3>
                </summary>
                <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-7">
                  {description}
                </p>
              </details>
            ))}
          </div>
        </section>
      </MarketingFlow>
    </ContentPage>
  );
}
