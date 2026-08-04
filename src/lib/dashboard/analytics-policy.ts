import type { UserAnalyticsAggregate } from "@/schemas/dashboard";
import type { Plan } from "@/types/models";

export interface AnalyticsView {
  summary: Pick<
    UserAnalyticsAggregate,
    | "profileViews"
    | "postEngagements"
    | "resourceDownloadsTotal"
    | "forumContributions"
    | "lessonsGeneratedTotal"
  >;
  fullAnalytics: boolean;
  series: Pick<
    UserAnalyticsAggregate,
    | "followerGrowth"
    | "resourceDownloads"
    | "profileViewTrend"
    | "engagementTrend"
  > | null;
}

export function projectAnalytics(
  plan: Plan,
  aggregate: UserAnalyticsAggregate,
): AnalyticsView {
  const summary = {
    profileViews: aggregate.profileViews,
    postEngagements: aggregate.postEngagements,
    resourceDownloadsTotal: aggregate.resourceDownloadsTotal,
    forumContributions: aggregate.forumContributions,
    lessonsGeneratedTotal: aggregate.lessonsGeneratedTotal,
  };
  if (plan === "free") return { summary, fullAnalytics: false, series: null };
  return {
    summary,
    fullAnalytics: true,
    series: {
      followerGrowth: aggregate.followerGrowth,
      resourceDownloads: aggregate.resourceDownloads,
      profileViewTrend: aggregate.profileViewTrend,
      engagementTrend: aggregate.engagementTrend,
    },
  };
}
