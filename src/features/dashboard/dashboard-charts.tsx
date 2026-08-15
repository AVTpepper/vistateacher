"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsView } from "@/lib/dashboard/analytics-policy";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
};

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground grid h-56 place-items-center text-sm">
      {label}
    </div>
  );
}

export function DashboardCharts({
  series,
}: {
  series: NonNullable<AnalyticsView["series"]>;
}) {
  const growth = series.followerGrowth.map((point, index) => ({
    period: point.period,
    followers: point.value,
    views: series.profileViewTrend[index]?.value ?? 0,
  }));
  const activity = series.resourceDownloads.map((point, index) => ({
    period: point.period,
    downloads: point.value,
    engagement: series.engagementTrend[index]?.value ?? 0,
  }));

  return (
    <div className="grid max-w-full min-w-0 gap-5 xl:grid-cols-2">
      <div className="max-w-full min-w-0">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Audience growth</h3>
          <p className="text-muted-foreground text-xs">
            Followers and profile views by period
          </p>
        </div>
        {growth.length ? (
          <div className="h-56 max-w-full min-w-0" data-chart="audience-growth">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growth} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="followers"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="Audience trends will appear as your profile grows." />
        )}
      </div>
      <div className="max-w-full min-w-0">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Content activity</h3>
          <p className="text-muted-foreground text-xs">
            Resource downloads and engagement
          </p>
        </div>
        {activity.length ? (
          <div
            className="h-56 max-w-full min-w-0"
            data-chart="content-activity"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="downloads"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="engagement"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="Content trends will appear after people engage." />
        )}
      </div>
    </div>
  );
}
