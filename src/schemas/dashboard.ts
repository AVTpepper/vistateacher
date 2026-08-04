import { z } from "zod";

export const analyticsPointSchema = z.object({
  period: z.string().trim().min(1).max(20),
  value: z.number().finite().nonnegative(),
});

export const userAnalyticsAggregateSchema = z.object({
  profileViews: z.number().int().nonnegative().default(0),
  postEngagements: z.number().int().nonnegative().default(0),
  resourceDownloadsTotal: z.number().int().nonnegative().default(0),
  forumContributions: z.number().int().nonnegative().default(0),
  lessonsGeneratedTotal: z.number().int().nonnegative().default(0),
  followerGrowth: z.array(analyticsPointSchema).max(24).default([]),
  resourceDownloads: z.array(analyticsPointSchema).max(24).default([]),
  profileViewTrend: z.array(analyticsPointSchema).max(24).default([]),
  engagementTrend: z.array(analyticsPointSchema).max(24).default([]),
});

export type UserAnalyticsAggregate = z.infer<
  typeof userAnalyticsAggregateSchema
>;
