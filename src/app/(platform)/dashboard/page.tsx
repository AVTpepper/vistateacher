import type { Metadata } from "next";

import { DashboardExperience } from "@/features/dashboard/dashboard-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const account = await requireCurrentAccount();
  const dashboard = await getDashboardData(account.uid, account.role);
  return (
    <main className="h-full overflow-y-auto px-4 py-5 lg:px-6">
      <DashboardExperience dashboard={dashboard} />
    </main>
  );
}
