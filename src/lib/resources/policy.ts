import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";
import type { ResourceAccess } from "@/schemas/resource";
import type { Plan, UserStatus } from "@/types/models";

export function canReserveResource({
  status,
  plan,
  uploadsThisMonth,
}: {
  status: UserStatus;
  plan: Plan;
  uploadsThisMonth: number;
}) {
  if (status !== "active")
    return { allowed: false, reason: "inactive" } as const;
  const limit = PLAN_ENTITLEMENTS[plan].resourceUploadsPerMonth;
  if (limit !== null && uploadsThisMonth >= limit)
    return { allowed: false, reason: "limit-reached" } as const;
  return { allowed: true } as const;
}

export function canDownloadResource({
  status,
  plan,
  accessTier,
  ownsResource,
  downloadsThisMonth,
}: {
  status: UserStatus;
  plan: Plan;
  accessTier: ResourceAccess;
  ownsResource: boolean;
  downloadsThisMonth: number;
}) {
  if (status !== "active")
    return { allowed: false, reason: "inactive" } as const;
  if (ownsResource) return { allowed: true } as const;
  if (accessTier === "plus" && plan !== "plus" && !ownsResource)
    return { allowed: false, reason: "plus-required" } as const;
  const limit = PLAN_ENTITLEMENTS[plan].resourceDownloadsPerMonth;
  if (limit !== null && downloadsThisMonth >= limit)
    return { allowed: false, reason: "download-limit-reached" } as const;
  return { allowed: true } as const;
}
