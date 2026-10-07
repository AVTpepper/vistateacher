import type { BillingInterval } from "@/schemas/billing";

export const PLUS_PRICING = {
  currency: "usd",
  month: { amount: 900, label: "$9", intervalLabel: "monthly" },
  year: { amount: 7900, label: "$79", intervalLabel: "yearly" },
} as const;

export function plusPriceLabel(interval: BillingInterval) {
  return `${PLUS_PRICING[interval].label} ${PLUS_PRICING[interval].intervalLabel}`;
}
export const PLUS_YEARLY_SAVING =
  (PLUS_PRICING.month.amount * 12 - PLUS_PRICING.year.amount) / 100;
