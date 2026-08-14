export type PlanIntent = "plus";

export function parsePlanIntent(
  value: string | string[] | undefined,
): PlanIntent | null {
  return value === "plus" ? value : null;
}

export function planIntentHref(path: string, plan: PlanIntent | null): string {
  if (!plan) return path;
  const url = new URL(path, "https://vistateacher.local");
  url.searchParams.set("plan", plan);
  return `${url.pathname}${url.search}`;
}
