import type { Metadata } from "next";

import { AdminReportsView } from "@/features/admin/admin-views";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminReports } from "@/lib/admin/server";

export const metadata: Metadata = { title: "Reports | Administration" };

export default async function AdminReportsPage() {
  const account = await requirePlatformAdmin();
  return <AdminReportsView reports={await getAdminReports(account)} />;
}
