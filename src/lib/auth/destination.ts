import { SIGNED_IN_HOME } from "@/lib/auth/policy";
import { hrefWithReturnTo, safeReturnTo } from "@/lib/auth/return-to";
import { planIntentHref, type PlanIntent } from "@/lib/billing/plan-intent";

export function authenticationDestination(
  next: string,
  returnTo: string | null,
  planIntent: PlanIntent | null,
): string {
  const destination = safeReturnTo(returnTo);
  if (next === "/onboarding")
    return hrefWithReturnTo(planIntentHref(next, planIntent), destination);
  if (destination) return destination;
  return planIntent && next === SIGNED_IN_HOME
    ? planIntentHref("/settings/billing", planIntent)
    : planIntentHref(next, planIntent);
}
