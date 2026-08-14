import type { Plan, SubscriptionRecord } from "@/types/models";

export const PLAN_ENTITLEMENTS = {
  free: {
    maxConnections: 5,
    messagesPerDay: 10,
    resourceUploadsPerMonth: null,
    resourceDownloadsPerMonth: null,
    aiLessonsPerMonth: 3,
    aiLessonCreationsPerMonth: 1,
    aiRefinementsPerMonth: 2,
    lessonExportsPerMonth: 2,
    fullAnalytics: false,
    plusResourceAccess: false,
    lessonPdfExport: true,
    lessonDocxExport: true,
    contactInfoAccess: false,
  },
  plus: {
    maxConnections: null,
    messagesPerDay: null,
    resourceUploadsPerMonth: null,
    resourceDownloadsPerMonth: null,
    aiLessonsPerMonth: 50,
    aiLessonCreationsPerMonth: 50,
    aiRefinementsPerMonth: 50,
    lessonExportsPerMonth: null,
    fullAnalytics: true,
    plusResourceAccess: true,
    lessonPdfExport: true,
    lessonDocxExport: true,
    contactInfoAccess: true,
  },
} as const;

export type PlanEntitlements = (typeof PLAN_ENTITLEMENTS)[Plan];

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export function resolveEffectivePlan(
  subscription: SubscriptionRecord | null,
  now = new Date(),
): Plan {
  if (!subscription) return "free";

  const hasActiveSubscription =
    subscription.plan === "plus" &&
    ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status) &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);

  const hasActiveVistaTrial =
    subscription.trialConsumed &&
    subscription.trialEndsAt !== null &&
    subscription.trialEndsAt > now;

  return hasActiveSubscription || hasActiveVistaTrial ? "plus" : "free";
}

export function getUserEntitlements(
  subscription: SubscriptionRecord | null,
  now = new Date(),
): PlanEntitlements {
  return PLAN_ENTITLEMENTS[resolveEffectivePlan(subscription, now)];
}

export function isWithinLimit(
  currentUsage: number,
  limit: number | null,
): boolean {
  return limit === null || currentUsage < limit;
}
