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
    note: "No payment method required.",
    features: [
      "Educator profile",
      PLAN_COPY.communityConnections,
      PLAN_COPY.communityMessages,
      "Unlimited resource uploads and downloads",
      PLAN_COPY.communityLessons,
      PLAN_COPY.communityExports,
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: PLUS_PRICING.month.label,
    priceSuffix: " / month",
    note: `${PLUS_PRICING.year.label} when billed yearly (save $${PLUS_YEARLY_SAVING}).`,
    features: [
      "Unlimited connections and messages",
      PLAN_COPY.plusGenerations,
      PLAN_COPY.plusExports,
      "Full analytics and Plus resources",
    ],
  },
] as const satisfies readonly BillingPlanDetails[];
