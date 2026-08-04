import { describe, expect, it } from "vitest";

import { projectAnalytics } from "./analytics-policy";

const aggregate = {
  profileViews: 120,
  postEngagements: 36,
  resourceDownloadsTotal: 48,
  forumContributions: 9,
  lessonsGeneratedTotal: 12,
  followerGrowth: [{ period: "Aug", value: 4 }],
  resourceDownloads: [{ period: "Aug", value: 8 }],
  profileViewTrend: [{ period: "Aug", value: 25 }],
  engagementTrend: [{ period: "Aug", value: 11 }],
};

describe("dashboard analytics projection", () => {
  it("keeps aggregate summaries available on Free without exposing series", () => {
    expect(projectAnalytics("free", aggregate)).toMatchObject({
      summary: { profileViews: 120, resourceDownloadsTotal: 48 },
      fullAnalytics: false,
      series: null,
    });
  });

  it("includes bounded aggregate series for Plus", () => {
    expect(projectAnalytics("plus", aggregate)).toMatchObject({
      fullAnalytics: true,
      series: { followerGrowth: [{ period: "Aug", value: 4 }] },
    });
  });
});
