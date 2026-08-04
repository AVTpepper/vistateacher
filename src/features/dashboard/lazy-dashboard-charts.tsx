"use client";

import dynamic from "next/dynamic";

import type { AnalyticsView } from "@/lib/dashboard/analytics-policy";

const DashboardCharts = dynamic(
  () =>
    import("@/features/dashboard/dashboard-charts").then(
      (module) => module.DashboardCharts,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-muted/40 h-72 animate-pulse rounded-lg"
        aria-label="Loading analytics"
      />
    ),
  },
);

export function LazyDashboardCharts({
  series,
}: {
  series: NonNullable<AnalyticsView["series"]>;
}) {
  return <DashboardCharts series={series} />;
}
