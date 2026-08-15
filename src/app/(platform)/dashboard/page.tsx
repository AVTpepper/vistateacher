import type { Metadata } from "next";

import { DashboardExperience } from "@/features/dashboard/dashboard-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const account = await requireCurrentAccount();
  const dashboard = await getDashboardData(account.uid, account.role);
  return (
    <div className="w-full max-w-full min-w-0">
      <DashboardExperience dashboard={dashboard} />
    </div>
  );
}
