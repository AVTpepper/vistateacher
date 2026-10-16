import { PLUS_PRICING, PLUS_YEARLY_SAVING } from "@/lib/billing/pricing";
import { PLAN_COPY } from "@/lib/billing/plan-copy";
export interface BillingPlanDetails {
  id: "free" | "plus";
  name: string;
  price: string;
  priceSuffix: string;
  note: string;
  features: readonly string[];
}

export const billingPlans = [
  {
    id: "free",
    name: "Community",
    price: "$0",
    priceSuffix: " membership",
    note: `${PLAN_COPY.communityPromise} No payment method required.`,
    features: [
      "Educator profile",
      PLAN_COPY.communityConnections,
      PLAN_COPY.communityMessages,
      "Share and download community resources",
      PLAN_COPY.communityLessons,
      PLAN_COPY.communityExports,
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: PLUS_PRICING.month.label,
    priceSuffix: " / month",
    note: `${PLAN_COPY.plusPromise} ${PLUS_PRICING.year.label} when billed yearly (save $${PLUS_YEARLY_SAVING}).`,
    features: [
      "Everything in Community",
      PLAN_COPY.plusGenerations,
      "Full analytics and Plus resources",
    ],
  },
] as const satisfies readonly BillingPlanDetails[];
