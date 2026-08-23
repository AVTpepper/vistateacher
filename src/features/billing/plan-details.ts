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
      "Up to 5 connections",
      "10 messages per day",
      "Unlimited resource uploads and downloads",
      "1 AI lesson with 2 refinements per month",
      "2 PDF or DOCX lesson exports per month",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$9",
    priceSuffix: " / month",
    note: "$79 when billed yearly (save $29).",
    features: [
      "Unlimited connections and messages",
      "50 AI generations per month",
      "Unlimited PDF and DOCX lesson exports",
      "Full analytics and Plus resources",
    ],
  },
] as const satisfies readonly BillingPlanDetails[];
