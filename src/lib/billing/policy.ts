import type Stripe from "stripe";

import type { SubscriptionStatus } from "@/types/models";

export const VISTA_TRIAL_DAYS = 14;

export function getTrialEnd(startedAt: Date): Date {
  return new Date(
    startedAt.getTime() + VISTA_TRIAL_DAYS * 24 * 60 * 60 * 1_000,
  );
}

export function normalizeStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    default:
      return "incomplete";
  }
}
