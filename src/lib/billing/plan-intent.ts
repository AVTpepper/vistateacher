import { billingIntervalSchema, type BillingInterval } from "@/schemas/billing";

export interface PlanIntent {
  plan: "plus";
  interval: BillingInterval;
}

export function parsePlanIntent(
  value: string | string[] | undefined,
  interval?: string | string[],
): PlanIntent | null {
  if (value !== "plus") return null;
  const parsedInterval = billingIntervalSchema.safeParse(interval);
  return {
    plan: "plus",
    interval: parsedInterval.success ? parsedInterval.data : "month",
  };
}

export function planIntentHref(path: string, plan: PlanIntent | null): string {
  if (!plan) return path;
  const url = new URL(path, "https://vistateacher.local");
  url.searchParams.set("plan", plan.plan);
  url.searchParams.set("interval", plan.interval);
  return `${url.pathname}${url.search}`;
}
