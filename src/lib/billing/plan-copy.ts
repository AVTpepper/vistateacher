import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";

export const PLAN_COPY = {
  communityConnections: "Unlimited connections",
  communityMessages: "Unlimited messaging, with anti-spam protections",
  communityLessons: `${PLAN_ENTITLEMENTS.free.aiLessonsPerMonth} AI actions per month for new lessons or refinements`,
  communityExports: "Unlimited standard PDF and Word lesson exports",
  plusGenerations: `${PLAN_ENTITLEMENTS.plus.aiLessonsPerMonth} AI actions per month for new lessons or refinements`,
  communityPromise:
    "Meet fellow educators, exchange resources, and share your expertise.",
  plusPromise:
    "More AI capacity for lesson preparation, plus full analytics and Plus resources.",
} as const;
