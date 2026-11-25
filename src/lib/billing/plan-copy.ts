import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";

export const PLAN_COPY = {
  communityConnections: "Unlimited connections",
  communityMessages: "Unlimited messaging, with anti-spam protections",
  communityLessons: `${PLAN_ENTITLEMENTS.free.aiLessonsPerMonth} AI actions per month for lessons, worksheets or regeneration`,
  communityExports: "Unlimited standard PDF and Word exports",
  plusGenerations: `${PLAN_ENTITLEMENTS.plus.aiLessonsPerMonth} AI actions per month for lessons, worksheets or regeneration`,
  communityPromise:
    "Meet fellow educators, exchange resources, and share your expertise.",
  plusPromise: "More AI capacity for teaching materials, plus full analytics.",
} as const;
