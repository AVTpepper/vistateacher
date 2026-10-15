import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";

const community = PLAN_ENTITLEMENTS.free;
const plus = PLAN_ENTITLEMENTS.plus;

export const PLAN_COPY = {
  communityConnections: `Up to ${community.maxConnections} connections`,
  communityMessages: `${community.messagesPerDay} messages per day`,
  communityLessons: `${community.aiLessonCreationsPerMonth} AI lesson with ${community.aiRefinementsPerMonth} refinements per month`,
  communityExports: `${community.lessonExportsPerMonth} PDF or DOCX lesson exports per month`,
  plusGenerations: `${plus.aiLessonsPerMonth} AI generations per month, shared between new lessons and refinements`,
  plusExports: "Unlimited PDF and DOCX lesson exports",
} as const;
